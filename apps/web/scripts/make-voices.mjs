// Gera as falas do chat rápido (src/assets/falas/<avatarId>/<emoteId>.m4a) com as vozes em português do macOS.
// Não mexe em fala que já existe (gravada à mão ou gerada pela OpenAI) sem --force. Bichos (Boi, Bernunça,
// Tainha) ficam de fora de propósito e continuam no blablablá sintetizado.
// Uso: node scripts/make-voices.mjs [--force] [--only mane,veterano] [--emote olholho]
import { execFileSync } from 'node:child_process';
import { AVATARS, EMOTES, done, existingFiles, parseArgs, report, target } from './falas.mjs';

/**
 * Voz do macOS por personagem e velocidade em palavras por minuto (o padrão do `say` é ~175).
 * Para trocar, veja as vozes instaladas com `say -v '?' | grep pt_` ou baixe outras em
 * Ajustes do Sistema › Acessibilidade › Conteúdo Falado › Voz do Sistema › Gerenciar Vozes.
 */
const CAST = {
  veterano: { voice: 'Grandpa (Português (Brasil))', rate: 160 },
  pescador: { voice: 'Rocko (Português (Brasil))', rate: 175 },
  camarao: { voice: 'Eddy (Português (Brasil))', rate: 190 },
  surfista: { voice: 'Reed (Português (Brasil))', rate: 160 },
  mane: { voice: 'Eddy (Português (Brasil))', rate: 215 },
  rendeira: { voice: 'Luciana', rate: 145 },
  benzedeira: { voice: 'Grandma (Português (Brasil))', rate: 150 },
  maricota: { voice: 'Sandy (Português (Brasil))', rate: 195 },
  bruxa: { voice: 'Shelley (Português (Brasil))', rate: 170 },
};

/** O texto do balão nem sempre é o melhor pra máquina ler: aqui vai o jeito de pronunciar. */
const SPOKEN = {
  olholho: 'Ó lhó lhó!',
};

const { force, only, emotes } = parseArgs();

const installed = execFileSync('say', ['-v', '?'], { encoding: 'utf8' });
const missing = [...new Set(Object.values(CAST).map((c) => c.voice))].filter((v) => !installed.includes(`${v} `));
if (missing.length) {
  console.error(`Vozes não instaladas: ${missing.join(', ')}`);
  console.error('Baixe em Ajustes do Sistema › Acessibilidade › Conteúdo Falado, ou troque no CAST deste script.');
  process.exit(1);
}

const unknown = (only ?? []).filter((id) => !CAST[id]);
if (unknown.length) {
  console.error(`Sem voz no CAST: ${unknown.join(', ')} (bichos ficam no blablablá).`);
  process.exit(1);
}

let made = 0;
let kept = 0;
for (const avatar of AVATARS) {
  const cast = CAST[avatar.id];
  if (!cast || (only && !only.includes(avatar.id))) continue;
  for (const emote of EMOTES) {
    if (emotes && !emotes.includes(emote.id)) continue;
    const key = `${avatar.id}/${emote.id}`;
    if (!force && existingFiles(key).length) {
      kept++;
      continue;
    }
    const text = SPOKEN[emote.id] ?? emote.text;
    const file = target(key, 'm4a');
    execFileSync('say', ['-v', cast.voice, '-r', String(cast.rate), '--file-format=m4af', '--data-format=aac', '-o', file, text]);
    done(key, 'mac');
    report(key, file, text);
    made++;
  }
}
console.log(`\n${made} falas geradas${kept ? `, ${kept} já existiam (use --force para refazer)` : ''}.`);
