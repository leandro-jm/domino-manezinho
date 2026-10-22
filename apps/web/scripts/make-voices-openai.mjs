// Gera as falas do chat rápido (src/assets/falas/<avatarId>/<emoteId>.mp3) com o TTS da OpenAI, pedindo
// sotaque manezinho e um jeito de falar pra cada personagem.
// Substitui as falas que o gerador do Mac fez; gravação feita à mão e fala que já veio da OpenAI só com --force.
// Bichos (Boi, Bernunça, Tainha) ficam de fora de propósito e continuam no blablablá sintetizado.
//
// Chave: OPENAI_API_KEY no ambiente, ou numa linha OPENAI_API_KEY=... em scripts/.env (ignorado pelo git e pelo Docker).
// Uso: node scripts/make-voices-openai.mjs [--dry] [--force] [--only mane,veterano] [--emote olholho]
//   --dry   só lista o que seria gerado, sem chamar a API
// O modelo pode ser trocado com OPENAI_TTS_MODEL (padrão gpt-4o-mini-tts, que a OpenAI desliga em 06/01/2027).
import { existsSync, writeFileSync } from 'node:fs';
import { AVATARS, EMOTES, done, existingFiles, generatedBy, parseArgs, report, target } from './falas.mjs';

const ENV_FILE = new URL('.env', import.meta.url);
if (!process.env.OPENAI_API_KEY && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
/** Pedidos em paralelo: pouco, pra não esbarrar no limite de requisições. */
const PARALLEL = 3;

/** Vale pra todo mundo: o sotaque da Ilha e o tom de mesa de dominó. */
const SOTAQUE = `Fale em português do Brasil com sotaque manezinho de Florianópolis, o falar ilhéu de origem açoriana:
fala ligeira e cantada, com o S chiado antes de consoante e no fim da palavra (como "tásh tolo", "maish"),
e o T e o D antes de I sem chiar ("tia", "dia" ditos secos, nunca "tchia", "djia").
É uma provocação de brincadeira numa mesa de dominó na Praça XV, entre amigos.
Diga só a frase, uma vez, sem acrescentar nada antes ou depois.`;

/**
 * Voz da OpenAI e jeito de falar de cada personagem. Vozes: alloy, ash, ballad, coral, echo, fable, nova,
 * onyx, sage, shimmer, verse, marin, cedar (marin e cedar são as de melhor qualidade).
 */
const CAST = {
  veterano: { voice: 'cedar', persona: 'Senhor de uns 75 anos, voz grave e um pouco rouca, calmo e sabido, de quem já viu de tudo na praça.' },
  pescador: { voice: 'ash', persona: 'Pescador de uns 50 anos da Barra da Lagoa, voz forte de quem grita no mar, simples e direto.' },
  camarao: { voice: 'verse', persona: 'Vendedor de camarão do Mercado Público, uns 45 anos, voz de feirante, animado e alto.' },
  surfista: { voice: 'echo', persona: 'Surfista de uns 25 anos da Joaquina, relaxado, fala arrastada e sorridente.' },
  mane: { voice: 'ballad', persona: 'Manezinho raiz de uns 40 anos, fala muito rápido, debochado e provocador, carregando no sotaque.' },
  rendeira: { voice: 'marin', persona: 'Senhora de uns 60 anos da Lagoa da Conceição, rendeira, doce mas ligeira e espirituosa.' },
  benzedeira: { voice: 'sage', persona: 'Senhora de uns 80 anos, benzedeira, voz baixa e um pouco trêmula, fala devagar, quase rezando.' },
  maricota: { voice: 'shimmer', persona: 'Moça de uns 25 anos, a Maricota do Boi de Mamão, alegre, risonha e cheia de energia.' },
  bruxa: { voice: 'nova', persona: 'Bruxa das lendas de Franklin Cascaes, voz maliciosa e aguda, com uma risadinha, arrastando as sílabas.' },
};

/** O texto do balão nem sempre é o melhor pra máquina ler: aqui vai o jeito de pronunciar. */
const SPOKEN = {};

const { force, dry, only, emotes } = parseArgs();

const unknown = (only ?? []).filter((id) => !CAST[id]);
if (unknown.length) {
  console.error(`Sem voz no CAST: ${unknown.join(', ')} (bichos ficam no blablablá).`);
  process.exit(1);
}

const jobs = [];
let kept = 0;
for (const avatar of AVATARS) {
  const cast = CAST[avatar.id];
  if (!cast || (only && !only.includes(avatar.id))) continue;
  for (const emote of EMOTES) {
    if (emotes && !emotes.includes(emote.id)) continue;
    const key = `${avatar.id}/${emote.id}`;
    // Sem --force, só substitui o que o gerador do Mac fez (ou o que ainda não existe).
    if (!force && existingFiles(key).length && generatedBy(key) !== 'mac') {
      kept++;
      continue;
    }
    jobs.push({ key, cast, text: SPOKEN[emote.id] ?? emote.text });
  }
}

const keptNote = kept ? `, ${kept} mantidas (gravadas à mão ou já da OpenAI; use --force para refazer)` : '';
if (dry) {
  for (const j of jobs) console.log(`${j.key}  ${j.cast.voice}  "${j.text}"`);
  console.log(`\n${jobs.length} falas seriam geradas com ${MODEL}${keptNote}.`);
  process.exit(0);
}
if (!jobs.length) {
  console.log(`Nada a gerar${keptNote}.`);
  process.exit(0);
}
if (!KEY) {
  console.error('Falta a chave: defina OPENAI_API_KEY no ambiente ou em apps/web/scripts/.env');
  process.exit(1);
}

const speak = async ({ cast, text }) => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        voice: cast.voice,
        input: text,
        instructions: `${SOTAQUE}\n\nPersonagem: ${cast.persona}`,
        response_format: 'mp3',
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) throw new Error(`OpenAI respondeu ${res.status}: ${body.slice(0, 300)}`);
    const wait = Number(res.headers.get('retry-after')) * 1000 || 2 ** attempt * 1000;
    await new Promise((r) => setTimeout(r, wait));
  }
};

let made = 0;
const failed = [];
const queue = [...jobs];
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const audio = await speak(job);
        const file = target(job.key, 'mp3');
        writeFileSync(file, audio);
        done(job.key, 'openai');
        report(job.key, file, job.text);
        made++;
      } catch (err) {
        // Chave errada ou sem crédito: não adianta tentar as outras.
        if (/respondeu (401|403)/.test(err.message)) {
          console.error(err.message);
          process.exit(1);
        }
        failed.push(job.key);
        console.error(`${job.key}  falhou: ${err.message}`);
      }
    }
  }),
);

console.log(`\n${made} falas geradas com ${MODEL}${keptNote}.`);
if (failed.length) {
  console.log(`${failed.length} falharam (a versão anterior ficou): ${failed.join(', ')}. Rode de novo para tentar só essas.`);
  process.exitCode = 1;
}
