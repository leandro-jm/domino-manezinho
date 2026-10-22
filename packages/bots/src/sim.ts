/**
 * Simulador: uma dupla de bots contra outra, alternando os lados. Sem argumentos é Monstro contra
 * Amador e falha se o Monstro ficar abaixo de 75% (dá pra trocar com --min).
 * Uso: pnpm --filter @domino/bots sim -- --games 200 [--a praca --b amador] [--min 60]
 */
import { BOT_LEVEL_IDS, isBotLevel, type BotLevel } from '@domino/shared';
import { playBotMatch } from './arena';

const raw = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};

const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const num = (name: string, fallback: number, min = 1) => {
  const value = raw(name);
  if (value === undefined) return fallback;
  const n = Number(value);
  // Valor torto (NaN, zero) faria o Monstro jogar sem pensar e o resultado enganaria.
  return Number.isInteger(n) && n >= min ? n : fail(`--${name} precisa de um número inteiro >= ${min}`);
};

const level = (name: string, fallback: BotLevel): BotLevel => {
  const value = raw(name) ?? fallback;
  return isBotLevel(value) ? value : fail(`--${name} precisa ser um destes: ${BOT_LEVEL_IDS.join(', ')}`);
};

const games = num('games', 200);
const samples = num('samples', 60);
const a = level('a', 'monstro');
const b = level('b', 'amador');
const minRate = num('min', a === 'monstro' && b === 'amador' ? 75 : 0, 0);
let aWins = 0;
const started = Date.now();

for (let g = 0; g < games; g++) {
  const aTeam = g % 2;
  const levels = [0, 1, 2, 3].map((s) => (s % 2 === aTeam ? a : b)) as Parameters<typeof playBotMatch>[0];
  const m = playBotMatch(levels, 1000 + g, {}, { monstro: { samples, timeLimitMs: 5000 } });
  if (m.winner === aTeam) aWins++;
  if ((g + 1) % 20 === 0) process.stdout.write(`  ${g + 1}/${games} partidas...\n`);
}

const rate = (aWins / games) * 100;
console.log(`${a} venceu ${b} em ${aWins}/${games} (${rate.toFixed(1)}%) em ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exitCode = rate >= minRate ? 0 : 1;
