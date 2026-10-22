// Gera os fundos ilustrados da Praça XV (public/fundos/praca-N.webp) a partir de art/fundos/.
// Uso: node scripts/make-backdrops.mjs
import { readdirSync } from 'node:fs';
import sharp from 'sharp';

const SRC = new URL('../art/fundos/', import.meta.url);
const OUT = new URL('../public/fundos/', import.meta.url);

for (const name of readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
  const id = name.replace(/\.\w+$/, '');
  await sharp(new URL(name, SRC).pathname)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(new URL(`${id}.webp`, OUT).pathname);
  console.log(`${id}.webp ok`);
}
