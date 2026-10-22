import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseMove } from '@domino/bots';
import type { PlayerView } from '@domino/engine';
import type { PublicPlayer, RoomSettings } from '@domino/shared';
import { DEFAULT_ROOM_SETTINGS } from '@domino/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import { persistMatch, type FinishedMatch } from '../src/persistence';
import { ResultQueue } from '../src/results';
import { STATE_VERSION } from '../src/state';
import { ageAccounts, ask, connectClient, createPlayer, resetDb, startServer, until, waitFor, type Client, type TestServer } from './helpers';

let s: TestServer;
const open: Client[] = [];
const settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, config: { scoring: 'batida', targetScore: 6, galo: false } };

const finished = (id: string, playerIds: [string, string]): FinishedMatch => ({
  id,
  roomCode: 'RESIL',
  config: settings.config,
  startedAt: new Date(),
  endedAt: new Date(),
  winner: 0,
  seats: [
    { seat: 0, playerId: playerIds[0], botLevel: null },
    { seat: 1, playerId: playerIds[1], botLevel: null },
    { seat: 2, playerId: null, botLevel: 'amador' },
    { seat: 3, playerId: null, botLevel: 'amador' },
  ],
  hands: [],
});

const autoplay = (c: Client) =>
  c.on('game:view', (v: PlayerView) => {
    if (!v.result && v.winner === null && v.turn === v.seat) c.emit('game:move', chooseMove(v, 'amador'), () => undefined);
  });

beforeAll(async () => {
  s = await startServer();
});
beforeEach(async () => {
  s.ctx.rooms.shutdown();
  await new Promise((r) => setTimeout(r, 100));
  await resetDb(s.ctx.db);
});
afterAll(async () => {
  for (const c of open) c.close();
  await s.close();
});

describe('fila de resultados', () => {
  it('banco falhando: guarda, tenta de novo com espera e entrega quando volta', async () => {
    let failures = 2;
    const saved: string[] = [];
    const late: string[] = [];
    const q = new ResultQueue({
      persist: async (m) => {
        if (failures-- > 0) throw new Error('banco fora');
        saved.push(m.id);
        return [] as PublicPlayer[];
      },
      onSaved: (m) => late.push(m.id),
      log: () => undefined,
      retryMs: [10, 10],
    });
    expect(await q.save(finished('p1', ['a', 'b']))).toBeNull();
    expect(await q.save(finished('p2', ['a', 'b']))).toBeNull();
    expect(q.size).toBe(2);
    await until(() => q.size === 0, 2000);
    // Em ordem, e a mesa é avisada de cada um que entrou atrasado.
    expect(saved).toEqual(['p1', 'p2']);
    expect(late).toEqual(['p1', 'p2']);
    q.stop();
  });

  it('resultado que nunca grava não segura os que vêm atrás', async () => {
    const saved: string[] = [];
    let down = true;
    const q = new ResultQueue({
      persist: async (m) => {
        if (down || m.id === 'podre') throw new Error('não grava');
        saved.push(m.id);
        return [] as PublicPlayer[];
      },
      onSaved: () => undefined,
      log: () => undefined,
      retryMs: [10, 10],
    });
    await q.save(finished('podre', ['a', 'b']));
    await q.save(finished('p2', ['a', 'b']));
    await q.save(finished('p3', ['a', 'b']));
    down = false;
    await until(() => q.size === 1, 2000);
    expect(saved).toEqual(['p2', 'p3']);
    q.stop();
  });

  it('gravar a mesma partida duas vezes não duplica nem conta rating em dobro', async () => {
    const [a, b] = await Promise.all(['Repete Um', 'Repete Dois'].map((n) => createPlayer(s, n)));
    await ageAccounts(s, [a!.player.id, b!.player.id]);
    const m = finished('partida-repetida', [a!.player.id, b!.player.id]);
    await persistMatch(s.ctx.db, m);
    await persistMatch(s.ctx.db, m);
    expect(await s.ctx.db.match.count({ where: { id: 'partida-repetida' } })).toBe(1);
    const pa = await s.ctx.db.player.findUniqueOrThrow({ where: { id: a!.player.id } });
    expect(pa.games).toBe(1);
    expect(pa.rating).toBe(1016);
  });
});

describe('banco fora', () => {
  it('handshake com erro de banco é erro passageiro, não "token inválido" (o app tenta de novo)', async () => {
    const a = await createPlayer(s, 'Sem Banco');
    const real = s.ctx.db;
    const broken = new Proxy(real, {
      get(target, prop) {
        if (prop === 'player') {
          return new Proxy(target.player, {
            get: (p, k) => (k === 'update' ? () => Promise.reject(new Error('banco fora')) : Reflect.get(p, k)),
          });
        }
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as Db;
    const down = await startServer({}, { db: broken });
    try {
      await expect(connectClient(down.url, a.token)).rejects.toThrow(/Deu ruim aqui no servidor/);
      await expect(connectClient(down.url, 'token-falso')).rejects.toThrow(/Token inválido/);
    } finally {
      await down.close();
    }
  });
});

describe('reinício do servidor', () => {
  it('resultado pendente salvo no arquivo de estado é gravado ao subir', async () => {
    const [a, b] = await Promise.all(['Pendente Um', 'Pendente Dois'].map((n) => createPlayer(s, n)));
    const dir = mkdtempSync(join(tmpdir(), 'domino-estado-'));
    const m = finished('partida-pendente', [a!.player.id, b!.player.id]);
    writeFileSync(
      join(dir, 'estado.json'),
      JSON.stringify({
        version: STATE_VERSION,
        savedAt: new Date().toISOString(),
        rooms: [],
        pendingResults: [{ ...m, startedAt: m.startedAt.toISOString(), endedAt: m.endedAt.toISOString() }],
      }),
    );
    const next = await startServer({}, { db: s.ctx.db, config: { stateDir: dir } });
    try {
      await until(async () => (await s.ctx.db.match.count({ where: { id: 'partida-pendente' } })) === 1, 5000);
    } finally {
      await next.close();
    }
  });

  it('partida em andamento sobrevive ao reinício: mesmo jogador volta pra mesma cadeira e termina', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'domino-estado-'));
    const timings = { botDelayMs: [150, 150] as [number, number], restoreGraceMs: 5_000 };
    const first = await startServer(timings, { db: s.ctx.db, config: { stateDir: dir } });
    const a = await createPlayer(first, 'Sobrevivente');
    const ca = await connectClient(first.url, a.token);
    open.push(ca);
    const { code } = await ask<{ ok: boolean; code: string }>((r) => ca.emit('room:create', settings, r as never));
    for (const seat of [1, 2, 3] as const) await ask((r) => ca.emit('room:bot', seat, 'amador', r as never));
    autoplay(ca);
    let closedEvent = false;
    ca.on('room:closed', () => (closedEvent = true));
    const moved = waitFor(ca, 'game:move', () => true, 10_000);
    await ask((r) => ca.emit('room:start', r as never));
    await moved;
    const before = first.ctx.rooms.get(code)!.match!.hand.log.length;
    await first.close();
    // Reinício não fecha a mesa para o jogador: ele só cai e reconecta.
    expect(closedEvent).toBe(false);

    const second = await startServer(timings, { db: s.ctx.db, config: { stateDir: dir } });
    try {
      const restored = second.ctx.rooms.get(code);
      expect(restored?.status).toBe('playing');
      expect(restored!.match!.hand.log.length).toBeGreaterThanOrEqual(before);
      const back = await connectClient(second.url, a.token);
      open.push(back);
      autoplay(back);
      const done = waitFor(back, 'room:state', (r) => r.status === 'finished', 60_000);
      expect(await ask((r) => back.emit('room:join', code, r as never))).toEqual({ ok: true, seat: 0 });
      await done;
      await until(async () => (await s.ctx.db.match.count({ where: { roomCode: code } })) === 1, 5000);
    } finally {
      await second.close();
    }
  });
});
