/**
 * Teste de carga: N mesas ao mesmo tempo, cada uma com 1 humano (este script) + 3 bots do servidor,
 * jogando uma mão inteira. Mede a latência do ack das jogadas e conta erros.
 * Uso: pnpm --filter @domino/server load -- --rooms 200 --url http://localhost:3001
 */
import { chooseMove } from '@domino/bots';
import type { PlayerView } from '@domino/engine';
import { DEFAULT_ROOM_SETTINGS, PROTOCOL_VERSION, type Ack, type AuthResponse, type ClientToServerEvents, type ServerToClientEvents } from '@domino/shared';
import { io, type Socket } from 'socket.io-client';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const ROOMS = Number(arg('rooms', '200'));
const URL = arg('url', 'http://localhost:3001');
const LEVEL = arg('level', 'amador') as 'amador' | 'monstro';

const latencies: number[] = [];
let errors = 0;
let finished = 0;

const call = <T extends object>(emit: (cb: (r: Ack<T>) => void) => void) =>
  new Promise<T>((resolve, reject) => emit((r) => (r.ok ? resolve(r) : reject(new Error(r.error)))));

const runTable = async (i: number) => {
  const res = await fetch(`${URL}/api/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: `Carga ${i}`, avatarId: 'veterano' }),
  });
  const { token } = (await res.json()) as AuthResponse;
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, { auth: { token, protocol: PROTOCOL_VERSION }, transports: ['websocket'] });
  await new Promise<void>((r) => socket.once('connect', () => r()));
  await call((cb) => socket.emit('room:create', DEFAULT_ROOM_SETTINGS, cb));
  for (const seat of [1, 2, 3] as const) await call((cb) => socket.emit('room:bot', seat, LEVEL, cb));

  await new Promise<void>((resolve) => {
    let busy = false;
    socket.on('game:view', (view: PlayerView) => {
      if (view.result) {
        finished++;
        socket.emit('room:leave');
        socket.disconnect();
        resolve();
        return;
      }
      if (busy || view.turn !== view.seat) return;
      busy = true;
      const move = chooseMove(view, 'amador');
      const t0 = performance.now();
      socket.emit('game:move', move, (r) => {
        latencies.push(performance.now() - t0);
        if (!r.ok) errors++;
        busy = false;
      });
    });
    void call((cb) => socket.emit('room:start', cb)).catch(() => {
      errors++;
      resolve();
    });
  });
};

const pct = (p: number) => {
  const sorted = [...latencies].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

const started = Date.now();
console.log(`Abrindo ${ROOMS} mesas (bots ${LEVEL}) em ${URL}…`);
const results = await Promise.allSettled(Array.from({ length: ROOMS }, (_, i) => runTable(i)));
const failed = results.filter((r) => r.status === 'rejected');
console.log(`Mesas que terminaram a mão: ${finished}/${ROOMS} em ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`Jogadas humanas: ${latencies.length}, erros: ${errors + failed.length}`);
console.log(`Latência do ack (ms): p50 ${pct(50).toFixed(1)} · p95 ${pct(95).toFixed(1)} · p99 ${pct(99).toFixed(1)} · máx ${Math.max(...latencies).toFixed(1)}`);
if (failed.length) console.log('Primeiro erro:', (failed[0] as PromiseRejectedResult).reason);
process.exit(finished === ROOMS && errors + failed.length === 0 ? 0 : 1);
