import * as THREE from 'three';
import { PIP_LAYOUT } from '../components/TileFace';

/**
 * Texturas desenhadas em canvas na hora: nada de imagem para baixar, e funciona offline.
 * Quando houver fotos reais da praça (com licença), dá pra trocar aqui.
 */
const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

/** Pontinhos aleatórios: dá textura de pedra/concreto. */
const speckle = (g: CanvasRenderingContext2D, w: number, h: number, count: number, colors: string[], size: [number, number]) => {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(Math.random() * colors.length)]!;
    const r = size[0] + Math.random() * (size[1] - size[0]);
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    g.fill();
  }
};

const memo = <T>(fn: () => T) => {
  let v: T | null = null;
  return () => (v ??= fn());
};

/** Tampo da mesa: concreto granilite cinza com a moldura de faixas brancas, igual às mesas da Praça XV. */
export const tableTopTexture = memo(() =>
  canvasTexture(1024, 1024, (g) => {
    g.fillStyle = '#8c8e8c';
    g.fillRect(0, 0, 1024, 1024);
    speckle(g, 1024, 1024, 26000, ['#7a7c7a', '#9d9f9c', '#a9aaa6', '#6f716f', '#b9b5ab'], [0.6, 2.2]);
    // manchas de uso e de chuva
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const grad = g.createRadialGradient(x, y, 0, x, y, 40 + Math.random() * 120);
      grad.addColorStop(0, `rgba(60,62,60,${0.04 + Math.random() * 0.06})`);
      grad.addColorStop(1, 'rgba(60,62,60,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 1024, 1024);
    }
    const band = (inset: number, width: number) => {
      g.fillStyle = '#ecebe5';
      g.fillRect(inset, inset, 1024 - inset * 2, width);
      g.fillRect(inset, 1024 - inset - width, 1024 - inset * 2, width);
      g.fillRect(inset, inset, width, 1024 - inset * 2);
      g.fillRect(1024 - inset - width, inset, width, 1024 - inset * 2);
    };
    band(46, 20);
    // desgaste nas faixas
    speckle(g, 1024, 1024, 3000, ['rgba(140,142,140,0.5)'], [0.5, 1.5]);
  }),
);

export const concreteTexture = memo(() =>
  canvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = '#8a8b88';
      g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 4000, ['#7b7c79', '#9a9b97', '#6e6f6c'], [0.5, 1.6]);
    },
    true,
  ),
);

/** Calçada portuguesa preto e branco em ondas, marca do centro de Floripa. */
export const calcadaTexture = memo(() => {
  const tex = canvasTexture(
    1024,
    1024,
    (g) => {
      g.fillStyle = '#e8e4da';
      g.fillRect(0, 0, 1024, 1024);
      g.fillStyle = '#26282a';
      for (let band = -1; band < 5; band++) {
        g.beginPath();
        const y0 = band * 256;
        for (let x = 0; x <= 1024; x += 8) g.lineTo(x, y0 + 60 + Math.sin((x / 1024) * Math.PI * 4) * 60);
        for (let x = 1024; x >= 0; x -= 8) g.lineTo(x, y0 + 150 + Math.sin((x / 1024) * Math.PI * 4) * 60);
        g.closePath();
        g.fill();
      }
      // pedrinhas: rejunte irregular
      g.strokeStyle = 'rgba(120,115,105,0.45)';
      g.lineWidth = 1;
      for (let y = 0; y < 1024; y += 8) {
        for (let x = (y / 8) % 2 ? 0 : 4; x < 1024; x += 8) {
          g.strokeRect(x + Math.random() * 1.5, y + Math.random() * 1.5, 6 + Math.random() * 2, 6 + Math.random() * 2);
        }
      }
    },
    true,
  );
  // ~6,7 m por repetição: ondas de ~1,7 m e pedrinhas de ~9 cm, como na calçada de verdade.
  tex.repeat.set(60, 60);
  return tex;
});

const faceCache = new Map<string, THREE.CanvasTexture>();

/** Face de cima da pedra: `back` na metade esquerda (-x), `front` na direita (+x). */
export const tileFaceTexture = (back: number, front: number, highContrast: boolean) => {
  const key = `${back}-${front}-${highContrast}`;
  let tex = faceCache.get(key);
  if (!tex) {
    tex = canvasTexture(256, 128, (g) => {
      g.fillStyle = highContrast ? '#ffffff' : '#f3ead2';
      g.fillRect(0, 0, 256, 128);
      g.strokeStyle = highContrast ? '#000' : '#8f8672';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(128, 14);
      g.lineTo(128, 114);
      g.stroke();
      g.fillStyle = '#b9a77d';
      g.beginPath();
      g.arc(128, 64, 6, 0, Math.PI * 2);
      g.fill();
      const half = (value: number, cx: number) => {
        for (const [x, y] of PIP_LAYOUT[value]!) {
          const px = cx + x * 32;
          const py = 64 + y * 32;
          const grad = g.createRadialGradient(px - 3, py - 3, 1, px, py, 13);
          grad.addColorStop(0, highContrast ? '#000' : '#3a3a3c');
          grad.addColorStop(1, '#0d0d0f');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(px, py, 12, 0, Math.PI * 2);
          g.fill();
        }
      };
      half(back, 64);
      half(front, 192);
    });
    faceCache.set(key, tex);
  }
  return tex;
};

const labelCache = new Map<string, THREE.CanvasTexture>();

/** Etiqueta amarela (ex.: "ponta 5") para usar em sprite dentro da cena. */
export const labelTexture = (text: string) => {
  let tex = labelCache.get(text);
  if (!tex) {
    tex = canvasTexture(256, 80, (g) => {
      g.fillStyle = '#f2c14e';
      g.beginPath();
      g.roundRect(4, 4, 248, 72, 36);
      g.fill();
      g.fillStyle = '#1d201e';
      g.font = 'bold 38px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 128, 42);
    });
    labelCache.set(text, tex);
  }
  return tex;
};
