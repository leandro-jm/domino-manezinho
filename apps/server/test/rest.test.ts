import type { AuthResponse, MatchPage, PlayerProfile, RankingEntry, TransferCode } from '@domino/shared';
import { DEFAULT_ROOM_SETTINGS } from '@domino/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HISTORY_PAGE } from '../src/history';
import { persistMatch, RATED_RULES } from '../src/persistence';
import { toPublic } from '../src/players';
import { ageAccounts, createPlayer, resetDb, startServer, type TestServer } from './helpers';

let s: TestServer;
const bearer = (a: AuthResponse) => ({ authorization: `Bearer ${a.token}` });

beforeAll(async () => {
  s = await startServer();
  await resetDb(s.ctx.db);
});
afterAll(() => s.close());

describe('jogadores', () => {
  it('cria jogador com tag de 4 dígitos e devolve token', async () => {
    const a = await createPlayer(s, '  Zé   da Lagoa ', 'pescador');
    expect(a.player).toMatchObject({ nickname: 'Zé da Lagoa', avatarId: 'pescador', rating: 1000, title: 'Mané' });
    expect(a.player.tag).toMatch(/^\d{4}$/);
    expect(a.player.stats.games).toBe(0);

    const me = await s.app.inject({ url: '/api/players/me', headers: bearer(a) });
    expect(me.statusCode).toBe(200);
    expect(me.json<PlayerProfile>().id).toBe(a.player.id);
  });

  it('recusa apelido feio, avatar inexistente ou bloqueado', async () => {
    const post = (payload: object) => s.app.inject({ method: 'POST', url: '/api/players', payload });
    const bad = await post({ nickname: 'seu merda', avatarId: 'mane' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain('Olha a boca');
    expect((await post({ nickname: 'Fulano', avatarId: 'dragao' })).statusCode).toBe(400);
    const locked = await post({ nickname: 'Fulano', avatarId: 'bruxa' });
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error).toMatch(/bloqueado/);
  });

  it('exige token válido', async () => {
    expect((await s.app.inject({ url: '/api/players/me' })).statusCode).toBe(401);
    const res = await s.app.inject({ url: '/api/players/me', headers: { authorization: 'Bearer lixo' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty('error');
  });

  it('PATCH troca apelido e libera avatar só com vitórias online', async () => {
    const a = await createPlayer(s, 'Guria');
    const patch = (payload: object) => s.app.inject({ method: 'PATCH', url: '/api/players/me', headers: bearer(a), payload });
    expect((await patch({ avatarId: 'boi' })).statusCode).toBe(403);
    // Vitória de treino é informada pelo aparelho: não desbloqueia.
    await s.ctx.db.player.update({ where: { id: a.player.id }, data: { wins: 2, practiceWins: 30 } });
    expect((await patch({ avatarId: 'boi' })).statusCode).toBe(403);
    await s.ctx.db.player.update({ where: { id: a.player.id }, data: { wins: 5 } });
    const ok = await patch({ avatarId: 'boi', nickname: 'Guria da Ilha' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<PlayerProfile>()).toMatchObject({ avatarId: 'boi', nickname: 'Guria da Ilha' });
  });

  it('transfere a identidade com código de uso único', async () => {
    const a = await createPlayer(s, 'Mudancista');
    const t = await s.app.inject({ method: 'POST', url: '/api/players/me/transfer', headers: bearer(a) });
    const { code, expiresAt } = t.json<TransferCode>();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);

    const claim = await s.app.inject({ method: 'POST', url: '/api/players/claim', payload: { code: code.toLowerCase() } });
    expect(claim.statusCode).toBe(200);
    const claimed = claim.json<AuthResponse>();
    expect(claimed.player.id).toBe(a.player.id);
    const me = await s.app.inject({ url: '/api/players/me', headers: bearer(claimed) });
    expect(me.json<PlayerProfile>().id).toBe(a.player.id);

    const again = await s.app.inject({ method: 'POST', url: '/api/players/claim', payload: { code } });
    expect(again.statusCode).toBe(404);

    // O aparelho antigo perde o acesso.
    const old = await s.app.inject({ url: '/api/players/me', headers: bearer(a) });
    expect(old.statusCode).toBe(401);
    expect(old.json()).toMatchObject({ code: 'token_revoked' });
  });

  it('401 diz se o token não presta ou se o jogador sumiu', async () => {
    const bad = await s.app.inject({ url: '/api/players/me', headers: { authorization: 'Bearer lixo' } });
    expect(bad.json()).toMatchObject({ code: 'token_invalid' });
    const a = await createPlayer(s, 'Sumido');
    await s.ctx.db.player.delete({ where: { id: a.player.id } });
    const gone = await s.app.inject({ url: '/api/players/me', headers: bearer(a) });
    expect(gone.statusCode).toBe(401);
    expect(gone.json()).toMatchObject({ code: 'player_not_found' });
  });

  it('limita tentativas de resgatar código por IP', async () => {
    const limited = await startServer({}, { db: s.ctx.db, config: { rateLimit: true } });
    try {
      const status: number[] = [];
      for (let i = 0; i < 11; i++) {
        const r = await limited.app.inject({ method: 'POST', url: '/api/players/claim', payload: { code: 'NAOEXISTE' } });
        status.push(r.statusCode);
      }
      expect(status.filter((c) => c === 404)).toHaveLength(10);
      expect(status.filter((c) => c === 429)).toHaveLength(1);
    } finally {
      await limited.close();
    }
  });

  it('código vencido não vale', async () => {
    const a = await createPlayer(s, 'Atrasado');
    await s.ctx.db.transferCode.create({ data: { code: 'ZZZZ99', playerId: a.player.id, expiresAt: new Date(Date.now() - 1000) } });
    const res = await s.app.inject({ method: 'POST', url: '/api/players/claim', payload: { code: 'ZZZZ99' } });
    expect(res.statusCode).toBe(404);
  });

  it('registra treino e limita a frequência', async () => {
    const a = await createPlayer(s, 'Treineiro');
    const send = () =>
      s.app.inject({
        method: 'POST',
        url: '/api/practice',
        headers: bearer(a),
        payload: { won: true, carrocas: 1, laelos: 2, cruzadas: 0 },
      });
    const first = await send();
    expect(first.statusCode).toBe(200);
    expect(first.json<PlayerProfile>().stats).toMatchObject({ practiceGames: 1, practiceWins: 1, carrocas: 1, laelos: 2, games: 0 });
    expect((await send()).statusCode).toBe(429);
  });
});

describe('ranking, amigos e push', () => {
  it('monta os quadros geral, semanal, amigos e treino', async () => {
    await resetDb(s.ctx.db);
    const [a, b, c, d] = await Promise.all(['Ana', 'Beto', 'Cida', 'Dedé'].map((n) => createPlayer(s, n)));
    await ageAccounts(s, [a, b, c, d].map((p) => p!.player.id));
    const now = new Date();
    // a+c contra b+d, a dupla de a vence; d fica de fora da segunda partida.
    await persistMatch(s.ctx.db, {
      id: 'partida-aaaaa',
      roomCode: 'AAAAA',
      config: { scoring: 'batida', targetScore: 6, galo: false },
      startedAt: now,
      endedAt: now,
      winner: 0,
      seats: [a!, b!, c!, d!].map((p, seat) => ({ seat: seat as 0 | 1 | 2 | 3, playerId: p.player.id, botLevel: null })),
      hands: [{ number: 1, log: [], result: { type: 'batida', seat: 0, team: 0, kind: 'carroca', points: 2, galo: [0, 0] } }],
    });
    await persistMatch(s.ctx.db, {
      id: 'partida-bbbbb',
      roomCode: 'BBBBB',
      config: { scoring: 'batida', targetScore: 6, galo: false },
      startedAt: now,
      endedAt: new Date(now.getTime() + 1000),
      winner: 1,
      seats: [
        { seat: 0, playerId: c!.player.id, botLevel: null },
        { seat: 1, playerId: null, botLevel: 'monstro' },
        { seat: 2, playerId: null, botLevel: 'amador' },
        { seat: 3, playerId: null, botLevel: 'monstro' },
      ],
      hands: [],
    });

    const board = async (name: string, who = a!) =>
      (await s.app.inject({ url: `/api/ranking?board=${name}`, headers: bearer(who) })).json<RankingEntry[]>();

    const geral = await board('geral');
    expect(geral.map((e) => e.value)).toEqual([1016, 1016, 984, 984]);
    expect(geral[0]).toMatchObject({ position: 1, games: 1, wins: 1 });

    const semanal = await board('semanal');
    expect(semanal).toHaveLength(4);
    expect(semanal[0]!.value).toBe(16);
    expect(semanal.at(-1)!.value).toBe(-16);

    // c jogou sozinha com bots: conta como treino.
    const treino = await board('treino');
    expect(treino.map((e) => e.player.id)).toEqual([c!.player.id]);
    expect(treino[0]).toMatchObject({ value: 0, games: 1, wins: 0 });

    // A posição de cada um bate com a lista (mesmo desempate), em todos os rankings.
    for (const name of ['geral', 'semanal', 'amigos', 'treino']) {
      for (const who of [a, b, c, d]) {
        const list = await board(name, who!);
        const res = await s.app.inject({ url: `/api/ranking/position?board=${name}`, headers: bearer(who!) });
        const index = list.findIndex((e) => e.player.id === who!.player.id);
        expect(res.json<RankingEntry | null>()?.position ?? null).toBe(index < 0 ? null : index + 1);
      }
    }
    expect((await s.app.inject({ url: '/api/ranking/position?board=geral' })).statusCode).toBe(401);
    // Perfil de quem aparece no ranking: título e números, sem preferência de notificação.
    const pub = (await s.app.inject({ url: `/api/players/${geral[0]!.player.id}` })).json<Record<string, unknown>>();
    expect(pub).toMatchObject({ id: geral[0]!.player.id, title: expect.any(String), stats: { games: 1 } });
    expect(pub).not.toHaveProperty('pushPrefs');
    expect((await s.app.inject({ url: '/api/players/nao-existe' })).statusCode).toBe(404);

    const amigos = await board('amigos', d!);
    expect(amigos.map((e) => e.player.id).sort()).toEqual([a, b, c, d].map((p) => p!.player.id).sort());

    const ana = await s.app.inject({ url: '/api/players/me', headers: bearer(a!) });
    expect(ana.json<PlayerProfile>().stats).toMatchObject({ games: 1, wins: 1, streak: 1, bestStreak: 1, carrocas: 1 });

    expect((await s.app.inject({ url: '/api/ranking?board=amigos' })).statusCode).toBe(401);
    expect((await s.app.inject({ url: '/api/ranking?board=xyz' })).statusCode).toBe(400);

    const friends = await s.app.inject({ url: '/api/friends', headers: bearer(c!) });
    const ids = friends.json<{ id: string }[]>().map((p) => p.id);
    expect(ids.sort()).toEqual([a, b, d].map((p) => p!.player.id).sort());
  });

  it('conta nova não vale ranking; contra o mesmo adversário o rating para de subir', async () => {
    const [p, q] = await Promise.all(['Farmador', 'Laranja'].map((n) => createPlayer(s, n)));
    const play = (winner: 0 | 1, i: number) =>
      persistMatch(s.ctx.db, {
        id: `partida-farm-${i}`,
        roomCode: `FARM${i}`,
        config: { scoring: 'batida', targetScore: 6, galo: false },
        startedAt: new Date(),
        endedAt: new Date(Date.now() + i),
        winner,
        seats: [
          { seat: 0, playerId: p!.player.id, botLevel: null },
          { seat: 1, playerId: q!.player.id, botLevel: null },
          { seat: 2, playerId: null, botLevel: 'amador' },
          { seat: 3, playerId: null, botLevel: 'amador' },
        ],
        hands: [],
      });
    // Laranja recém-criada: não vale.
    await play(0, 0);
    expect((await s.ctx.db.match.findFirstOrThrow({ where: { roomCode: 'FARM0' } })).rated).toBe(false);

    await ageAccounts(s, [p!.player.id, q!.player.id]);
    for (let i = 1; i <= RATED_RULES.sameOpponentLimit + 1; i++) await play(0, i);
    const deltas = await s.ctx.db.matchPlayer.findMany({
      where: { playerId: p!.player.id, match: { rated: true } },
      orderBy: { match: { endedAt: 'asc' } },
      select: { ratingDelta: true },
    });
    expect(deltas).toHaveLength(RATED_RULES.sameOpponentLimit + 1);
    expect(deltas.slice(0, RATED_RULES.sameOpponentLimit).every((d) => d.ratingDelta > 0)).toBe(true);
    expect(deltas.at(-1)!.ratingDelta).toBe(0);
    // Quem perde continua perdendo: o teto é só para ganhar.
    const lost = await s.ctx.db.matchPlayer.findFirstOrThrow({ where: { playerId: q!.player.id, match: { roomCode: `FARM${RATED_RULES.sameOpponentLimit + 1}` } } });
    expect(lost.ratingDelta).toBeLessThan(0);
  });

  it('dupla de humanos contra bots: o rating para de subir com o mesmo parceiro', async () => {
    const [p, q] = await Promise.all(['Parceiro', 'Comparsa'].map((n) => createPlayer(s, n)));
    await ageAccounts(s, [p!.player.id, q!.player.id]);
    for (let i = 1; i <= RATED_RULES.sameOpponentLimit + 1; i++) {
      await persistMatch(s.ctx.db, {
        id: `partida-dupla-${i}`,
        roomCode: `DUPLA${i}`,
        config: { scoring: 'batida', targetScore: 6, galo: false },
        startedAt: new Date(),
        endedAt: new Date(Date.now() + i),
        winner: 0,
        seats: [
          { seat: 0, playerId: p!.player.id, botLevel: null },
          { seat: 1, playerId: null, botLevel: 'monstro' },
          { seat: 2, playerId: q!.player.id, botLevel: null },
          { seat: 3, playerId: null, botLevel: 'monstro' },
        ],
        hands: [],
      });
    }
    for (const id of [p!.player.id, q!.player.id]) {
      const deltas = await s.ctx.db.matchPlayer.findMany({
        where: { playerId: id, match: { rated: true } },
        orderBy: { match: { endedAt: 'asc' } },
        select: { ratingDelta: true },
      });
      expect(deltas).toHaveLength(RATED_RULES.sameOpponentLimit + 1);
      expect(deltas.slice(0, RATED_RULES.sameOpponentLimit).every((d) => d.ratingDelta > 0)).toBe(true);
      expect(deltas.at(-1)!.ratingDelta).toBe(0);
    }
  });

  it('histórico de partidas vem em páginas, da mais recente pra mais antiga', async () => {
    const p = await createPlayer(s, 'Freguês');
    const total = HISTORY_PAGE + 1;
    for (let i = 0; i < total; i++) {
      await persistMatch(s.ctx.db, {
        id: `partida-hist-${i}`,
        roomCode: `HIST${i}`,
        config: { scoring: 'batida', targetScore: 6, galo: false },
        startedAt: new Date(Date.UTC(2026, 0, 1, 12, i)),
        endedAt: new Date(Date.UTC(2026, 0, 1, 12, i, 30)),
        winner: 0,
        seats: [
          { seat: 0, playerId: p!.player.id, botLevel: null },
          { seat: 1, playerId: null, botLevel: 'amador' },
          { seat: 2, playerId: null, botLevel: 'amador' },
          { seat: 3, playerId: null, botLevel: 'amador' },
        ],
        hands: [],
      });
    }
    const page = (before?: string) =>
      s.app
        .inject({ url: `/api/matches${before ? `?before=${encodeURIComponent(before)}` : ''}`, headers: bearer(p!) })
        .then((r) => r.json<MatchPage>());
    const first = await page();
    expect(first.matches).toHaveLength(HISTORY_PAGE);
    expect(first.matches[0]!.id).toBe(`partida-hist-${total - 1}`);
    expect(first.next).not.toBeNull();
    const second = await page(first.next!);
    expect(second.matches.map((m) => m.id)).toEqual(['partida-hist-0']);
    expect(second.next).toBeNull();
    // Partida gravada antes do histórico (sem placar nem personagem do bot) ainda aparece.
    expect(second.matches[0]!).toMatchObject({ scores: null, seats: [{ kind: 'human' }, { kind: 'bot', nickname: 'Bot Amador' }, {}, {}] });
    expect((await s.app.inject({ url: '/api/matches?before=ontem', headers: bearer(p!) })).statusCode).toBe(400);
    expect((await s.app.inject({ url: '/api/matches' })).statusCode).toBe(401);
  });

  it('exporta os dados e apaga a conta; nas partidas dos outros vira "jogador que saiu"', async () => {
    const [p, q] = await Promise.all(['Saidor', 'Ficador'].map((n) => createPlayer(s, n)));
    await persistMatch(s.ctx.db, {
      id: 'partida-lgpd',
      roomCode: 'LGPD1',
      config: { scoring: 'batida', targetScore: 6, galo: false },
      startedAt: new Date(),
      endedAt: new Date(),
      winner: 0,
      scores: [6, 2],
      seats: [
        { seat: 0, playerId: p!.player.id, botLevel: null },
        { seat: 1, playerId: q!.player.id, botLevel: null },
        { seat: 2, playerId: null, botLevel: 'amador' },
        { seat: 3, playerId: null, botLevel: 'amador' },
      ],
      hands: [],
    });
    const exported = await s.app.inject({ url: '/api/players/me/export', headers: bearer(p!) });
    expect(exported.headers['content-disposition']).toMatch(/attachment/);
    const data = exported.json<{ player: Record<string, unknown>; matches: { match: { id: string } }[] }>();
    expect(data.player).toMatchObject({ id: p!.player.id, nickname: 'Saidor' });
    expect(data.player).not.toHaveProperty('tokenVersion');
    expect(data.matches.map((m) => m.match.id)).toEqual(['partida-lgpd']);

    expect((await s.app.inject({ method: 'DELETE', url: '/api/players/me', headers: bearer(p!) })).statusCode).toBe(204);
    expect((await s.app.inject({ url: '/api/players/me', headers: bearer(p!) })).statusCode).toBe(401);
    const history = (await s.app.inject({ url: '/api/matches', headers: bearer(q!) })).json<MatchPage>();
    expect(history.matches[0]!.seats[0]).toMatchObject({ kind: 'human', playerId: null, nickname: 'Jogador que saiu' });
  });

  it('inscreve push, convida pra mesa e limpa inscrição morta', async () => {
    const a = await createPlayer(s, 'Convidador');
    const b = await createPlayer(s, 'Convidado');
    expect((await s.app.inject({ url: '/api/push/key' })).json()).toEqual({ publicKey: 'test-public-key' });

    const sub = (endpoint: string) =>
      s.app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        headers: bearer(b),
        payload: { endpoint, keys: { p256dh: 'p', auth: 'x' } },
      });
    expect((await sub('https://push.example/1')).statusCode).toBe(201);
    expect((await sub('https://push.example/1')).statusCode).toBe(201);
    // Só serviços de push conhecidos: o servidor não posta em URL qualquer (SSRF).
    for (const bad of ['https://169.254.169.254/latest', 'http://push.example/x', 'https://push.example.evil.com/x', 'https://push.example:8443/x']) {
      expect((await sub(bad)).statusCode).toBe(400);
    }
    expect(await s.ctx.db.pushSubscription.count({ where: { playerId: b.player.id } })).toBe(1);

    const room = s.ctx.rooms.create(toPublic((await s.ctx.db.player.findUniqueOrThrow({ where: { id: a.player.id } }))), 'socket-falso', DEFAULT_ROOM_SETTINGS);
    const invite = await s.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/invite`,
      headers: bearer(a),
      payload: { playerId: b.player.id },
    });
    expect(invite.json()).toEqual({ ok: true, delivered: 1 });
    expect(s.pushes.at(-1)!.payload).toEqual({
      title: 'Dominó Manezinho',
      body: 'Convidador te chamou pra uma partida na Praça XV!',
      url: `/sala/${room.code}`,
      tag: `convite-${room.code}`,
    });

    const missing = await s.app.inject({ method: 'POST', url: '/api/rooms/QQQQQ/invite', headers: bearer(a), payload: { playerId: b.player.id } });
    expect(missing.statusCode).toBe(404);
    // Quem não tá sentado na mesa não manda convite em nome dela.
    const outsider = await s.app.inject({ method: 'POST', url: `/api/rooms/${room.code}/invite`, headers: bearer(b), payload: { playerId: a.player.id } });
    expect(outsider.statusCode).toBe(403);

    // Desligou só o convite: convite não chega, os outros tipos sim.
    const patch = (payload: object) => s.app.inject({ method: 'PATCH', url: '/api/players/me', headers: bearer(b), payload });
    const updated = await patch({ pushPrefs: { invite: false } });
    expect(updated.json<PlayerProfile>().pushPrefs).toEqual({ turn: true, invite: false, full: true });
    const note = { title: 't', body: 'b', url: '/', tag: 't' };
    expect(await s.ctx.push.sendToPlayer(b.player.id, note, 'invite')).toBe(0);
    expect(await s.ctx.push.sendToPlayer(b.player.id, note, 'turn')).toBe(1);
    expect((await patch({ pushPrefs: { turn: 'sim' } })).statusCode).toBe(400);
    expect((await patch({ pushPrefs: null })).statusCode).toBe(400);

    // Navegador descartou a inscrição: 410 apaga do banco.
    await sub('https://push.example/morta');
    const dead = await startServer({}, {
      db: s.ctx.db,
      pushSender: async (target) => {
        if (target.endpoint.endsWith('/morta')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      },
    });
    try {
      expect(await dead.ctx.push.sendToPlayer(b.player.id, { title: 't', body: 'b', url: '/', tag: 't' })).toBe(1);
    } finally {
      await dead.close();
    }
    const left = await s.ctx.db.pushSubscription.findMany({ where: { playerId: b.player.id } });
    expect(left.map((x) => x.endpoint)).toEqual(['https://push.example/1']);

    const del = await s.app.inject({
      method: 'DELETE',
      url: '/api/push/subscribe',
      headers: bearer(b),
      payload: { endpoint: 'https://push.example/1' },
    });
    expect(del.statusCode).toBe(200);
    expect(await s.ctx.db.pushSubscription.count({ where: { playerId: b.player.id } })).toBe(0);
    room.close('fim do teste');
  });

  it('health responde', async () => {
    const res = await s.app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: true });
    expect((await s.app.inject({ url: '/api/health/live' })).json()).toEqual({ ok: true });
  });
});
