/**
 * Emblemas de torcida pintados no tampo da mesa: o clássico da Ilha, Avaí × Figueirense.
 * Desenho próprio nas cores dos clubes, de propósito diferente dos escudos oficiais (marcas registradas).
 * Gerado em canvas uma vez e reaproveitado: textura na mesa 3D e imagem na mesa 2D.
 */
export type Team = 'avai' | 'figueirense';

interface TeamStyle {
  name: string;
  stripes: [string, string];
  edge: string;
  band: string;
}

const STYLES: Record<Team, TeamStyle> = {
  avai: { name: 'AVAÍ', stripes: ['#1458b0', '#f4f4f0'], edge: '#0b3a78', band: '#0b3a78' },
  figueirense: { name: 'FIGUEIRA', stripes: ['#161616', '#f4f4f0'], edge: '#0d0d0d', band: '#0d0d0d' },
};

export const TEAM_ASPECT = 300 / 256; // altura / largura do emblema

const shield = (g: CanvasRenderingContext2D, w: number, h: number, inset: number) => {
  g.beginPath();
  g.moveTo(inset, inset + 18);
  g.quadraticCurveTo(w / 2, inset - 8, w - inset, inset + 18);
  g.lineTo(w - inset, h * 0.52);
  g.quadraticCurveTo(w - inset, h * 0.82, w / 2, h - inset);
  g.quadraticCurveTo(inset, h * 0.82, inset, h * 0.52);
  g.closePath();
};

const star = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
};

const cache = new Map<Team, HTMLCanvasElement>();

/** Emblema em canvas (256×300), com aspecto de tinta gasta no concreto. */
export const teamCanvas = (team: Team): HTMLCanvasElement => {
  let c = cache.get(team);
  if (c) return c;
  const s = STYLES[team];
  c = document.createElement('canvas');
  c.width = 256;
  c.height = 300;
  const g = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;

  // contorno grosso
  shield(g, w, h, 6);
  g.fillStyle = s.edge;
  g.fill();
  // listras verticais dentro do escudo
  g.save();
  shield(g, w, h, 20);
  g.clip();
  const n = 7;
  for (let i = 0; i < n; i++) {
    g.fillStyle = s.stripes[i % 2]!;
    g.fillRect((i * w) / n, 0, w / n + 1, h);
  }
  // faixa com o nome
  g.fillStyle = s.band;
  g.fillRect(0, h * 0.4, w, 64);
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, h * 0.4 + 4, w, 3);
  g.fillRect(0, h * 0.4 + 57, w, 3);
  g.font = `900 ${s.name.length > 5 ? 38 : 48}px system-ui, -apple-system, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s.name, w / 2, h * 0.4 + 33);
  g.restore();
  // estrela no alto
  g.fillStyle = team === 'avai' ? '#f2c230' : '#f4f4f0';
  g.strokeStyle = s.edge;
  star(g, w / 2, 62, 22);

  // desgaste: falhas na tinta, como pintura velha no concreto
  g.globalCompositeOperation = 'destination-out';
  let seed = team === 'avai' ? 11 : 29;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.6;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 3.2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  cache.set(team, c);
  return c;
};

/** Onde fica cada emblema (unidades de pedra, centro da mesa na origem): cantos do fundo. */
export const TEAM_SPOTS: { team: Team; x: number; z: number; rot: number }[] = [
  { team: 'avai', x: -1, z: -1, rot: -0.12 },
  { team: 'figueirense', x: 1, z: -1, rot: 0.12 },
];
