import { chooseMove } from '@domino/bots';
import { replayMatch, type Move, type PlayerView, type Seat } from '@domino/engine';
import type { AuthResponse, MatchDetail, MatchPage, RankingEntry, RoomSettings, RoomSnapshot } from '@domino/shared';
import { DEFAULT_ROOM_SETTINGS, ERROR_CODES, PROTOCOL_VERSION } from '@domino/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ageAccounts, ask, connectClient, createPlayer, resetDb, startServer, until, waitFor, type Client, type TestServer } from './helpers';

let s: TestServer;
const open: Client[] = [];

const settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, config: { scoring: 'batida', targetScore: 3, galo: true } };

const client = async (auth: AuthResponse): Promise<Client> => {
  const c = await connectClient(s.url, auth.token);
  open.push(c);
  return c;
};

interface Autoplay {
  views: PlayerView[];
  states: RoomSnapshot[];
  moves: Move[];
  errors: string[];
}

/** Joga sozinho: a cada view em que é a vez dele, manda uma jogada legal. */
const autoplay = (c: Client): Autoplay => {
  const log: Autoplay = { views: [], states: [], moves: [], errors: [] };
  let acted = '';
  c.on('room:state', (r) => log.states.push(r));
  c.on('game:move', (m) => log.moves.push(m));
  c.on('game:view', (v) => {
    log.views.push(v);
    if (v.result || v.winner !== null || v.turn !== v.seat) return;
    const key = `${v.handNumber}:${v.log.length}`;
    if (key === acted) return;
    acted = key;
    c.emit('game:move', chooseMove(v, 'amador'), (res) => {
      if (!res.ok) log.errors.push(res.error);
    });
  });
  return log;
};

beforeAll(async () => {
  s = await startServer({}, { config: { monstro: { samples: 8, timeLimitMs: 20 } } });
});
beforeEach(async () => {
  // Mesas dos testes anteriores seguem jogando com bots; se uma terminar e gravar depois do TRUNCATE,
  // o banco reclama. Fecha todas e espera alguma gravação em andamento antes de limpar.
  s.ctx.rooms.shutdown();
  await new Promise((r) => setTimeout(r, 150));
  await resetDb(s.ctx.db);
});
afterAll(async () => {
  for (const c of open) c.close();
  await s.close();
});

/** Mesa privada: A cria (cadeira 0), B entra pelo código (cadeira 1), bots nas cadeiras 2 e 3. */
const setupRoom = async () => {
  const a = await createPlayer(s, 'Aninha', 'rendeira');
  const b = await createPlayer(s, 'Bento', 'pescador');
  const ca = await client(a);
  const cb = await client(b);
  const created = await ask<{ ok: boolean; code?: string }>((cb_) => ca.emit('room:create', settings, cb_ as never));
  expect(created.ok).toBe(true);
  const code = created.code!;
  expect(code).toMatch(/^[A-HJKMNP-Z]{5}$/);
  const joined = await ask<{ ok: boolean; seat?: Seat }>((cb_) => cb.emit('room:join', code.toLowerCase(), cb_ as never));
  expect(joined).toEqual({ ok: true, seat: 1 });
  expect((await ask<{ ok: boolean }>((r) => ca.emit('room:bot', 2, 'amador', r as never))).ok).toBe(true);
  expect((await ask<{ ok: boolean }>((r) => ca.emit('room:bot', 3, 'monstro', r as never))).ok).toBe(true);
  return { a, b, ca, cb, code };
};

describe('mesa em tempo real', () => {
  it('joga uma partida inteira, grava e atualiza o ranking', async () => {
    const { a, b, ca, cb, code } = await setupRoom();
    await ageAccounts(s, [a.player.id, b.player.id]);

    const notOwner = await ask<{ ok: boolean; error?: string }>((r) => cb.emit('room:start', r as never));
    expect(notOwner).toEqual({ ok: false, error: 'Só o dono da mesa pode fazer isso.' });

    const la = autoplay(ca);
    const lb = autoplay(cb);
    const finished = waitFor(ca, 'room:state', (r) => r.status === 'finished', 30_000);
    expect((await ask<{ ok: boolean }>((r) => ca.emit('room:start', r as never))).ok).toBe(true);

    // Quem não tá sentado não entra com a partida rolando.
    const c = await createPlayer(s, 'Curioso');
    const cc = await client(c);
    expect(await ask((r) => cc.emit('room:join', code, r as never))).toEqual({ ok: false, error: 'A mesa já tá rolando' });

    const [final] = await finished;
    expect(la.errors).toEqual([]);
    expect(lb.errors).toEqual([]);
    expect(la.moves.length).toBeGreaterThan(10);

    // Ninguém recebe a mão do outro.
    for (const [log, seat] of [
      [la, 0],
      [lb, 1],
    ] as const) {
      for (const v of log.views) {
        expect(v.seat).toBe(seat);
        expect(v).not.toHaveProperty('hands');
        if (!v.result) expect(v.revealedHands).toBeNull();
      }
      for (const st of log.states) expect(JSON.stringify(st)).not.toMatch(/myHand|"hands"/);
    }
    const firstViews = (log: Autoplay) => new Map(log.views.map((v) => [v.handNumber, v] as const).reverse());
    const fa = firstViews(la);
    const fb = firstViews(lb);
    for (const [hand, va] of fa) {
      const vb = fb.get(hand)!;
      if (va.log.length || vb.log.length) continue;
      const ids = new Set(va.myHand.map((t) => t.id));
      expect(vb.myHand.some((t) => ids.has(t.id))).toBe(false);
    }

    // Gravou partida, cadeiras e mãos.
    const match = await s.ctx.db.match.findFirstOrThrow({ where: { roomCode: code }, include: { players: true, hands: true } });
    expect(match.rated).toBe(true);
    expect(match.players).toHaveLength(4);
    expect(match.hands.length).toBeGreaterThan(0);
    expect(match.winnerTeam).not.toBeNull();
    const lastView = la.views.at(-1)!;
    expect(lastView.winner).toBe(match.winnerTeam);
    const totalMoves = match.hands.reduce((n, h) => n + (h.moves as unknown[]).length, 0);
    expect(totalMoves).toBe(la.moves.length);

    const [pa, pb] = await Promise.all([a, b].map((p) => s.ctx.db.player.findUniqueOrThrow({ where: { id: p.player.id } })));
    expect(pa!.rating).not.toBe(1000);
    expect(pa!.rating + pb!.rating).toBe(2000);
    expect(pa!.games).toBe(1);
    expect(pa!.wins + pb!.wins).toBe(1);

    // Snapshot final já traz o rating novo.
    const seat0 = final.seats[0];
    expect(seat0?.kind === 'human' && seat0.player.rating).toBe(pa!.rating);

    const res = await s.app.inject({ url: '/api/ranking?board=geral' });
    const ids = res.json<RankingEntry[]>().map((e) => e.player.id);
    expect(ids.sort()).toEqual([a.player.id, b.player.id].sort());

    // Histórico: a partida aparece pra quem jogou e dá pra refazer mão a mão até o placar final.
    const get = (url: string, who: AuthResponse) => s.app.inject({ url, headers: { authorization: `Bearer ${who.token}` } });
    const page = (await get('/api/matches', a)).json<MatchPage>();
    expect(page.next).toBeNull();
    expect(page.matches.map((m) => m.id)).toEqual([match.id]);
    const summary = page.matches[0]!;
    expect(summary).toMatchObject({ mySeat: 0, rated: true, winnerTeam: match.winnerTeam, scores: lastView.scores, handCount: match.hands.length });
    expect(summary.seats.map((x) => x.kind)).toEqual(['human', 'human', 'bot', 'bot']);
    expect(summary.seats[0]).toMatchObject({ nickname: 'Aninha', avatarId: 'rendeira', ratingBefore: 1000, ratingDelta: pa!.rating - 1000 });
    const bot = final.seats[3];
    expect(summary.seats[3]).toMatchObject({ botLevel: 'monstro', nickname: bot?.kind === 'bot' && bot.nickname, ratingBefore: null });
    const detail = (await get(`/api/matches/${match.id}`, b)).json<MatchDetail>();
    expect(detail.mySeat).toBe(1);
    const replayed = replayMatch(
      detail.config,
      detail.hands.map((h) => ({ number: h.number, dealt: h.dealt!, moves: h.moves })),
    );
    const end = replayed.at(-1)!.at(-1)!;
    expect(end.scores).toEqual(summary.scores);
    expect(end.winner).toBe(summary.winnerTeam);
    // Quem não jogou recebe 404, igual a partida que não existe.
    expect((await get(`/api/matches/${match.id}`, c)).statusCode).toBe(404);
    expect((await get('/api/matches/nao-existe', a)).statusCode).toBe(404);
    expect((await get('/api/matches', c)).json<MatchPage>().matches).toEqual([]);

    // Revanche com as mesmas cadeiras.
    const rematchStarted = waitFor(ca, 'room:state', (r) => r.status === 'playing');
    expect((await ask<{ ok: boolean }>((r) => ca.emit('game:rematch', r as never))).ok).toBe(true);
    await rematchStarted;
    ca.emit('room:leave');
    cb.emit('room:leave');
  });

  it('valida jogadas e ignora a cadeira do payload', async () => {
    const { ca, cb } = await setupRoom();
    // Humanos não jogam sozinhos aqui: os bots andam até a vez de um humano e a mesa para.
    const humanTurn = (v: PlayerView) => v.turn === 0 || v.turn === 1;
    const viewA = waitFor(ca, 'game:view', humanTurn);
    const viewB = waitFor(cb, 'game:view', humanTurn);
    await ask((r) => ca.emit('room:start', r as never));
    const [[va], [vb]] = await Promise.all([viewA, viewB]);
    const [onTurn, onView, idle] = va.turn === 0 ? [ca, va, cb] : [cb, vb, ca];

    // Fingir ser quem está na vez não cola: a cadeira é sempre a do socket.
    expect(await ask((r) => idle.emit('game:move', { type: 'pass', seat: onView.seat }, r as never))).toEqual({
      ok: false,
      error: 'Não é tua vez, calma!',
    });
    const notMine = [...Array(28).keys()].find((id) => !onView.myHand.some((t) => t.id === id))!;
    expect(await ask((r) => onTurn.emit('game:move', { type: 'play', seat: onView.seat, tileId: notMine, side: 'left' }, r as never))).toEqual({
      ok: false,
      error: 'Jogada inválida, mané!',
    });
    const legal = chooseMove(onView, 'amador');
    const moved = waitFor(idle, 'game:move');
    expect(await ask((r) => onTurn.emit('game:move', { ...legal, seat: 3 } as Move, r as never))).toEqual({ ok: true });
    expect((await moved)[0]).toEqual(legal);
    ca.emit('room:leave');
    cb.emit('room:leave');
  });

  it('reconexão devolve a mesma cadeira e bot joga por quem caiu', async () => {
    // Servidor à parte com bots mais lentos, para a partida não acabar antes de A voltar.
    const slow = await startServer({ botDelayMs: [40, 40], disconnectGraceMs: 200 }, { db: s.ctx.db, config: { monstro: { samples: 4, timeLimitMs: 10 } } });
    const conn = async (auth: AuthResponse) => {
      const c = await connectClient(slow.url, auth.token);
      open.push(c);
      return c;
    };
    try {
      const a = await createPlayer(slow, 'Caidor');
      const b = await createPlayer(slow, 'Firme');
      const ca = await conn(a);
      const cb = await conn(b);
      const { code } = await ask<{ ok: boolean; code: string }>((r) =>
        ca.emit('room:create', { ...settings, config: { scoring: 'batida', targetScore: 20, galo: false } }, r as never),
      );
      await ask((r) => cb.emit('room:join', code, r as never));
      await ask((r) => ca.emit('room:bot', 2, 'amador', r as never));
      await ask((r) => ca.emit('room:bot', 3, 'amador', r as never));
      autoplay(cb);
      const firstView = waitFor(ca, 'game:view');
      await ask((r) => ca.emit('room:start', r as never));
      await firstView;

      const moves: Move[] = [];
      cb.on('game:move', (m) => moves.push(m));
      const sawOffline = waitFor(cb, 'room:state', (r) => r.seats[0]?.kind === 'human' && !r.seats[0].connected);
      ca.close();
      await sawOffline;
      // A nunca jogou: qualquer jogada da cadeira 0 agora é do bot substituto.
      await until(() => moves.some((m) => m.seat === 0), 15_000);

      const back = await conn(a);
      const [view] = await waitFor(back, 'game:view');
      expect(view.seat).toBe(0);
      expect(await ask((r) => back.emit('room:join', code, r as never))).toEqual({ ok: true, seat: 0 });
      expect(slow.ctx.rooms.get(code)!.snapshot().seats[0]).toMatchObject({ kind: 'human', connected: true });

      // Segunda aba pede a mesa: ganha a cadeira e a primeira recebe room:closed.
      const tab = await conn(a);
      const kicked = waitFor(back, 'room:closed');
      expect(await ask((r) => tab.emit('room:join', code, r as never))).toEqual({ ok: true, seat: 0 });
      expect((await kicked)[0]).toBe('Tu abriste essa mesa noutra aba.');
      // A aba velha que tentar jogar fica sabendo pelo código que perdeu a cadeira (e pode sentar de novo).
      const stale = await ask((r) => back.emit('game:move', { type: 'pass', seat: 0 }, r as never));
      expect(stale).toMatchObject({ ok: false, code: ERROR_CODES.lostSeat });
    } finally {
      await slow.close();
    }
  });

  it('relógio estoura e joga a pedra mais pesada; push de sala completa e de tua vez', async () => {
    const fast = await startServer({ turnMsPerSecond: 10 }, { db: s.ctx.db, config: { monstro: { samples: 4, timeLimitMs: 10 } } });
    try {
      const a = await createPlayer(fast, 'Dorminhoco');
      await fast.app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        headers: { authorization: `Bearer ${a.token}` },
        payload: { endpoint: 'https://push.example/dorminhoco', keys: { p256dh: 'p', auth: 'x' } },
      });
      const ca = await connectClient(fast.url, a.token);
      open.push(ca);
      ca.emit('presence', false);
      const { code } = await ask<{ ok: boolean; code: string }>((r) =>
        ca.emit('room:create', { ...settings, turnSeconds: 15, config: { scoring: 'batida', targetScore: 1, galo: false } }, r as never),
      );
      for (const seat of [1, 2, 3] as const) await ask((r) => ca.emit('room:bot', seat, 'amador', r as never));
      const deadlines: number[] = [];
      ca.on('room:state', (r) => r.turnDeadline && deadlines.push(r.turnDeadline));
      const moves: Move[] = [];
      ca.on('game:move', (m) => moves.push(m));
      const done = waitFor(ca, 'room:state', (r) => r.status === 'finished', 20_000);
      await ask((r) => ca.emit('room:start', r as never));
      await done;

      // A nunca mandou jogada: as dele saíram pelo relógio (150ms).
      expect(moves.some((m) => m.seat === 0)).toBe(true);
      expect(deadlines.length).toBeGreaterThan(0);
      const bodies = fast.pushes.map((p) => p.payload.body);
      expect(bodies).toContain('Sala completa, bora jogar!');
      expect(bodies.filter((b) => b === 'Tua vez, Dorminhoco!')).toHaveLength(1);
      expect(fast.pushes.every((p) => p.payload.url === `/sala/${code}`)).toBe(true);
      // Treino (1 humano): não mexe no rating.
      const p = await fast.ctx.db.player.findUniqueOrThrow({ where: { id: a.player.id } });
      expect(p).toMatchObject({ rating: 1000, games: 0, practiceGames: 1 });
    } finally {
      await fast.close();
    }
  });

  it('jogo rápido completa com bots e começa sozinho', async () => {
    const q = await createPlayer(s, 'Apressado');
    const cq = await client(q);
    const playing = waitFor(cq, 'room:state', (r) => r.status === 'playing');
    const res = await ask<{ ok: boolean; code?: string }>((r) => cq.emit('room:quick', r as never));
    expect(res.ok).toBe(true);

    const other = await client(await createPlayer(s, 'Espiador'));
    const lobby = await ask<{ code: string; humans: number; freeSeats: number }[]>((r) => other.emit('lobby:list', r as never));
    expect(lobby.find((l) => l.code === res.code)).toMatchObject({ humans: 1, freeSeats: 3 });

    const [room] = await playing;
    expect(room.quick).toBe(true);
    expect(room.fillAt).toBeNull();
    expect(room.seats.filter((x) => x?.kind === 'bot')).toHaveLength(3);
    expect(room.seats.every((x) => x?.kind !== 'bot' || x.level === 'amador')).toBe(true);
    const names = room.seats.flatMap((x) => (x?.kind === 'bot' ? [x.nickname] : []));
    expect(new Set(names).size).toBe(3);
    cq.emit('room:leave');
  });

  it('emotes passam pelo filtro e pelo limite', async () => {
    const { ca, cb } = await setupRoom();
    const got: { seat: Seat; emoteId: string }[] = [];
    cb.on('chat:emote', (e) => got.push(e));
    ca.emit('chat:emote', 'olholho');
    ca.emit('chat:emote', 'tastolo'); // dentro de 2s: ignorado
    ca.emit('chat:emote', 'palavrao-livre');
    cb.emit('chat:emote', 'dalhe');
    await until(() => got.length >= 2);
    await new Promise((r) => setTimeout(r, 100));
    expect(got).toEqual([
      { seat: 0, emoteId: 'olholho' },
      { seat: 1, emoteId: 'dalhe' },
    ]);
    ca.emit('room:leave');
    cb.emit('room:leave');
  });

  it('dono saindo na espera passa a mesa adiante; sem humanos a mesa fecha', async () => {
    const { a, ca, cb, code } = await setupRoom();
    const passed = waitFor(cb, 'room:state', (r) => r.ownerId !== a.player.id);
    ca.emit('room:leave');
    const [st] = await passed;
    expect(st.seats[0]).toBeNull();
    cb.emit('room:leave');
    await until(() => !s.ctx.rooms.get(code));
  });

  it('quem cai na espera e a partida começa continua na cadeira (bot joga por ele) e a mesa não trava', async () => {
    const { b, ca, cb, code } = await setupRoom();
    const sawOffline = waitFor(ca, 'room:state', (r) => r.seats[1]?.kind === 'human' && !r.seats[1].connected);
    cb.close();
    await sawOffline;
    autoplay(ca);
    const finished = waitFor(ca, 'room:state', (r) => r.status === 'finished', 30_000);
    // Começa dentro da carência de B (200ms); o timer de saída dele não pode tirar a cadeira no meio da partida.
    expect((await ask<{ ok: boolean }>((r) => ca.emit('room:start', r as never))).ok).toBe(true);
    await finished;
    const match = await s.ctx.db.match.findFirstOrThrow({ where: { roomCode: code }, include: { players: true } });
    expect(match.players.find((p) => p.seat === 1)?.playerId).toBe(b.player.id);
    ca.emit('room:leave');
  });

  it('mesa em jogo fecha quando todo humano sai de vez', async () => {
    const a = await createPlayer(s, 'Fujão');
    const ca = await client(a);
    const { code } = await ask<{ ok: boolean; code: string }>((r) => ca.emit('room:create', settings, r as never));
    for (const seat of [1, 2, 3] as const) await ask((r) => ca.emit('room:bot', seat, 'monstro', r as never));
    await ask((r) => ca.emit('room:start', r as never));
    const second = await ask<{ ok: boolean; code: string }>((r) => ca.emit('room:create', settings, r as never));
    expect(second.ok).toBe(true);
    expect(s.ctx.rooms.get(code)).toBeUndefined();
    ca.emit('room:leave');
  });

  it('limita criação de mesa por jogador', async () => {
    const a = await createPlayer(s, 'Abridor');
    const ca = await client(a);
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await ask<{ ok: boolean; error?: string }>((r) => ca.emit('room:create', settings, r as never)));
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, error: 'Calma, mané! Muita coisa de uma vez.' });
    ca.emit('room:leave');
  });

  it('rejeita token desconhecido no handshake', async () => {
    await expect(connectClient(s.url, 'token-falso')).rejects.toMatchObject({
      message: expect.stringMatching(/Token inválido/),
      data: { code: ERROR_CODES.tokenRefused },
    });
  });

  it('app com protocolo velho é mandado atualizar; sem o campo conta como versão 1', async () => {
    const a = await createPlayer(s, 'Desatualizado');
    await expect(connectClient(s.url, a.token, { protocol: 0 })).rejects.toMatchObject({ data: { code: ERROR_CODES.updateRequired } });
    open.push(await connectClient(s.url, a.token, { protocol: PROTOCOL_VERSION }));
    open.push(await connectClient(s.url, a.token, {}));
  });

  it('convite chega na tela de quem está com o app aberto; push só pra quem não está olhando', async () => {
    const [a, b] = await Promise.all([createPlayer(s, 'Chamador'), createPlayer(s, 'Chamado')]);
    const ca = await client(a);
    const cb = await client(b);
    const created = await ask<{ ok: boolean; code: string }>((r) => ca.emit('room:create', settings, r as never));
    const subscribe = await s.app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { authorization: `Bearer ${b.token}` },
      payload: { endpoint: 'https://push.example/chamado', keys: { p256dh: 'k', auth: 'a' } },
    });
    expect(subscribe.statusCode).toBe(201);
    const invite = () =>
      s.app.inject({ method: 'POST', url: `/api/rooms/${created.code}/invite`, headers: { authorization: `Bearer ${a.token}` }, payload: { playerId: b.player.id } });

    cb.emit('presence', true);
    await until(() => s.ctx.rooms.isVisible(b.player.id));
    const pushesBefore = s.pushes.length;
    const received = waitFor(cb, 'invite');
    expect((await invite()).json()).toEqual({ ok: true, delivered: 1 });
    const [got] = await received;
    expect(got).toMatchObject({ code: created.code, from: { id: a.player.id, nickname: 'Chamador' } });
    expect(s.pushes.length).toBe(pushesBefore);

    // App no fundo: vai por push (passado o intervalo entre convites pro mesmo jogador).
    cb.emit('presence', false);
    await until(() => !s.ctx.rooms.isVisible(b.player.id));
    await new Promise((r) => setTimeout(r, 10_100));
    expect((await invite()).json()).toEqual({ ok: true, delivered: 1 });
    expect(s.pushes.at(-1)!.payload.tag).toBe(`convite-${created.code}`);
    ca.emit('room:leave');
  });

  it('perfil levado para outro aparelho derruba o socket do antigo', async () => {
    const a = await createPlayer(s, 'Mudancista');
    const old = await client(a);
    const headers = { authorization: `Bearer ${a.token}` };
    const { code } = (await s.app.inject({ method: 'POST', url: '/api/players/me/transfer', headers })).json<{ code: string }>();
    const dropped = new Promise<string>((resolve) => old.on('disconnect', resolve));
    const claim = await s.app.inject({ method: 'POST', url: '/api/players/claim', payload: { code } });
    expect(claim.statusCode).toBe(200);
    expect(await dropped).toBe('io server disconnect');
    // E não volta com o token velho.
    await expect(connectClient(s.url, a.token)).rejects.toThrow(/Token inválido/);
    const fresh = await client(claim.json<AuthResponse>());
    expect(fresh.connected).toBe(true);
  });
});
