// Gera os ícones PNG do PWA (pedra 5|3 sobre o verde da figueira) sem dependências externas.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [29, 43, 36];
const IVORY = [244, 236, 214];
const PIP = [28, 28, 30];
const LINE = [150, 140, 120];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (size, pixel) => {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const roundRect = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.max(Math.abs(x - cx) - (hw - r), 0);
  const dy = Math.max(Math.abs(y - cy) - (hh - r), 0);
  return dx * dx + dy * dy <= r * r;
};

const PIPS = {
  3: [[-1, -1], [0, 0], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
};

/** Cor de um ponto em coordenadas normalizadas 0..1. `pad` encolhe o desenho (ícone maskable). */
const shade = (u, v, pad, rounded) => {
  if (rounded && !roundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22)) return null;
  const s = 1 - pad * 2;
  const x = (u - 0.5) / s + 0.5;
  const y = (v - 0.5) / s + 0.5;
  const hw = 0.2, hh = 0.38;
  if (!roundRect(x, y, 0.5, 0.5, hw + 0.02, hh + 0.02, 0.08)) return BG;
  if (!roundRect(x, y, 0.5, 0.5, hw, hh, 0.07)) return [205, 196, 172];
  if (Math.abs(y - 0.5) < 0.008 && Math.abs(x - 0.5) < hw - 0.04) return LINE;
  for (const [value, cy] of [[5, 0.5 - hh / 2], [3, 0.5 + hh / 2]]) {
    for (const [px, py] of PIPS[value]) {
      if ((x - (0.5 + px * 0.1)) ** 2 + (y - (cy + py * 0.1)) ** 2 < 0.034 ** 2) return PIP;
    }
  }
  return IVORY;
};

const render = (size, pad, rounded) =>
  png(size, (x, y) => {
    const acc = [0, 0, 0, 0];
    const n = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const c = shade((x + (i + 0.5) / n) / size, (y + (j + 0.5) / n) / size, pad, rounded);
      if (c) { acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255; }
    }
    const k = n * n;
    const a = acc[3] / k;
    return a ? [acc[0] / (a / 255 * k), acc[1] / (a / 255 * k), acc[2] / (a / 255 * k), a].map(Math.round) : [0, 0, 0, 0];
  });

const out = new URL('../public/icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192, 0.04, true));
writeFileSync(new URL('icon-512.png', out), render(512, 0.04, true));
writeFileSync(new URL('icon-maskable-512.png', out), render(512, 0.14, false));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, 0.08, false));
console.log('ícones gerados');
