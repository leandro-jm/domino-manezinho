// Gera os retratos dos personagens (public/avatars/<id>.webp) a partir das ilustrações em art/avatares/.
// Acha o oval da ilustração, recorta um círculo por dentro da moldura e deixa o fundo transparente.
// Uso: node scripts/make-avatars.mjs [--sheet caminho.png]  (a folha de contato serve pra conferir os recortes)
import { readdirSync } from 'node:fs';
import { basename, extname } from 'node:path';
import sharp from 'sharp';

const SRC = new URL('../art/avatares/', import.meta.url);
const OUT = new URL('../public/avatars/', import.meta.url);
const SIZE = 384;

/**
 * Ajuste fino por personagem: `zoom` < 1 aproxima (corta mais da borda), `dy`/`dx` deslocam o centro
 * em fração do diâmetro (negativo = sobe/esquerda), para o rosto ficar bem enquadrado.
 */
const TUNE = {
  camarao: { zoom: 0.8, dy: -0.2 },
  benzedeira: { zoom: 0.84, dy: -0.08 },
  bruxa: { zoom: 0.86, dy: -0.06 },
  surfista: { zoom: 0.84, dy: -0.16 },
  rendeira: { zoom: 0.84, dy: -0.08 },
  pescador: { zoom: 0.84, dy: -0.1 },
  boi: { zoom: 0.86, dy: -0.04 },
  bernunca: { zoom: 0.86, dy: -0.02 },
  maricota: { zoom: 0.8, dy: -0.14 },
  mane: { zoom: 0.84, dy: -0.08 },
  veterano: { zoom: 0.84, dy: -0.08 },
  tainha: { zoom: 0.86, dy: 0 },
};

/** Caixa do oval: linhas/colunas com bastante pixel não-branco (ignora enfeites que vazam da moldura). */
const findOval = async (file) => {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ink = (x, y) => {
    const i = (y * w + x) * 3;
    return data[i] < 232 || data[i + 1] < 232 || data[i + 2] < 232;
  };
  const rows = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink(x, y);
    rows.push(n);
  }
  const cols = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += ink(x, y);
    cols.push(n);
  }
  const span = (arr, min) => [arr.findIndex((n) => n > min), arr.length - 1 - [...arr].reverse().findIndex((n) => n > min)];
  const [x0, x1] = span(cols, h * 0.3);
  const [y0, y1] = span(rows, w * 0.3);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, imgW: w, imgH: h };
};

const circleMask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/></svg>`,
);

const results = [];
for (const name of readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
  const id = basename(name, extname(name));
  const file = new URL(name, SRC).pathname;
  const oval = await findOval(file);
  const t = TUNE[id] ?? { zoom: 0.86, dy: 0 };
  const d = Math.round(Math.min(oval.w, oval.h) * t.zoom);
  const left = Math.round(Math.min(oval.imgW - d, Math.max(0, oval.cx - d / 2 + (t.dx ?? 0) * d)));
  const top = Math.round(Math.min(oval.imgH - d, Math.max(0, oval.cy - d / 2 + t.dy * d)));
  const out = new URL(`${id}.webp`, OUT).pathname;
  await sharp(file)
    .extract({ left, top, width: d, height: d })
    .resize(SIZE, SIZE)
    .ensureAlpha()
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(out);
  results.push({ id, out });
  console.log(`${id}: oval ${oval.w}x${oval.h}, recorte ${d}px em (${left}, ${top})`);
}

const sheetIdx = process.argv.indexOf('--sheet');
if (sheetIdx > 0) {
  const cell = 200;
  const cols = 4;
  const rows = Math.ceil(results.length / cols);
  const tiles = await Promise.all(
    results.map(async (r, i) => ({
      input: await sharp(r.out).resize(cell - 10, cell - 10).png().toBuffer(),
      left: (i % cols) * cell + 5,
      top: Math.floor(i / cols) * cell + 5,
    })),
  );
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: '#1d2b24' } })
    .composite(tiles)
    .png()
    .toFile(process.argv[sheetIdx + 1]);
  console.log('folha de contato:', process.argv[sheetIdx + 1]);
}
