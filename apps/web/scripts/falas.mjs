// Utilitários compartilhados pelos geradores de falas (make-voices.mjs, make-voices-openai.mjs).
// O manifesto falas/geradas.json anota qual gerador fez cada arquivo: o que não está nele foi gravado à mão
// e nenhum gerador mexe sem --force.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export { AVATARS } from '../../../packages/shared/src/avatars.ts';
export { EMOTES } from '../../../packages/shared/src/flavor.ts';

const OUT = new URL('../src/assets/falas/', import.meta.url);
const MANIFEST = new URL('geradas.json', OUT);
/** As mesmas extensões que o app procura (src/lib/voice.ts). */
const EXTENSIONS = ['mp3', 'm4a', 'ogg', 'opus', 'wav'];
/** Passou disso, a fala dura mais que o balão na tela. */
export const BUBBLE_SECONDS = 3.5;

export const parseArgs = (argv = process.argv.slice(2)) => {
  const list = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? (argv[i + 1] ?? '').split(',').filter(Boolean) : null;
  };
  return { force: argv.includes('--force'), dry: argv.includes('--dry'), only: list('--only'), emotes: list('--emote') };
};

/** Quem fez cada fala: { "mane/olholho": "mac" | "openai" }. */
export const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

const saveManifest = () => {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
};

/** Arquivos que já existem para a fala, em qualquer extensão. */
export const existingFiles = (key) =>
  EXTENSIONS.map((ext) => fileURLToPath(new URL(`${key}.${ext}`, OUT))).filter((f) => existsSync(f));

/**
 * Prepara o caminho de saída: apaga a versão anterior da fala (em qualquer extensão, para o app não
 * achar duas) e devolve onde gravar. Chame `done` depois que o arquivo foi escrito.
 */
export const target = (key, ext) => {
  mkdirSync(new URL(`${key.split('/')[0]}/`, OUT), { recursive: true });
  for (const f of existingFiles(key)) rmSync(f);
  delete manifest[key];
  return fileURLToPath(new URL(`${key}.${ext}`, OUT));
};

/** Extensão que cada gerador grava. */
const ENGINE_EXT = { mac: 'm4a', openai: 'mp3' };

/**
 * Qual gerador fez a fala que está na pasta, ou null se foi posta à mão. Não basta o manifesto: se alguém
 * trocou o arquivo por uma gravação (outra extensão, ou duas versões lado a lado), ela é tratada como manual.
 */
export const generatedBy = (key) => {
  const engine = manifest[key];
  const files = existingFiles(key);
  return engine && files.length === 1 && files[0].endsWith(`.${ENGINE_EXT[engine]}`) ? engine : null;
};

export const done = (key, engine) => {
  manifest[key] = engine;
  saveManifest();
};

/** Duração em segundos pelo afinfo do macOS; fora do Mac devolve null. */
export const durationOf = (file) => {
  try {
    const m = execFileSync('afinfo', [file], { encoding: 'utf8' }).match(/estimated duration: ([\d.]+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
};

export const report = (key, file, text) => {
  const seconds = durationOf(file);
  const warn = seconds !== null && seconds > BUBBLE_SECONDS ? '  ⚠ mais longa que o balão' : '';
  console.log(`${key}  ${seconds === null ? '' : `${seconds.toFixed(1)} s  `}"${text}"${warn}`);
};
