// Gera a imagem de compartilhamento (public/og-image.jpg, 1200×630): a Praça XV com o nome do jogo por cima.
// É a que aparece no Google, no WhatsApp e nas redes ao colar o link. Uso: node scripts/make-og.mjs
import sharp from 'sharp';

const SRC = new URL('../art/fundos/praca-1.jpg', import.meta.url).pathname;
const OUT = new URL('../public/og-image.jpg', import.meta.url).pathname;
const W = 1200;
const H = 630;

const texto = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sombra" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.35" stop-color="#1d2b24" stop-opacity="0" />
      <stop offset="1" stop-color="#1d2b24" stop-opacity="0.92" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sombra)" />
  <g font-family="Helvetica, Arial, sans-serif" fill="#f4ecd6">
    <text x="64" y="440" font-size="30" fill="#f2c14e" font-weight="600">PRAÇA XV DE NOVEMBRO · FLORIANÓPOLIS</text>
    <text x="60" y="525" font-size="92" font-weight="800">Dominó Manezinho</text>
    <text x="64" y="580" font-size="34">Dominó online em duplas, grátis · com os amigos ou contra os bots</text>
  </g>
</svg>`;

await sharp(SRC)
  .resize(W, H, { fit: 'cover', position: 'attention' })
  .composite([{ input: Buffer.from(texto) }])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(OUT);
console.log('og-image.jpg ok');
