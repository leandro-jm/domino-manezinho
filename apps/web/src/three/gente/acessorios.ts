import * as THREE from 'three';
import type { Hat, Look, Pattern } from './looks';

/**
 * Peças 3D presas aos ossos: chapéus, lenços, bigodes, óculos, saia, capa, ramo de ervas e as cabeças
 * de fantasia. Tudo é montado nas coordenadas da pose de repouso (metros, frente +z) e depois o
 * Pessoa.tsx "cola" no osso com Object3D.attach, então acompanha qualquer animação.
 */

/** Cabeça em repouso: topo, altura dos olhos e frente do rosto, por corpo. */
export const HEAD = {
  homem: { top: 1.81, eyesY: 1.698, faceZ: 0.098, cy: 1.7 },
  mulher: { top: 1.767, eyesY: 1.656, faceZ: 0.093, cy: 1.66 },
};

const std = (color: string, roughness = 0.75, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else m.scale.set(...scale);
  m.castShadow = true;
  return m;
};

const sphere = new THREE.SphereGeometry(1, 20, 14);
/** Geometria reaproveitada por todos os acessórios: quem descarta uma pessoa não pode liberar esta. */
export const SHARED_ACCESSORY_GEOMETRY: ReadonlySet<THREE.BufferGeometry> = new Set([sphere]);

// ---------- texturas de tecido (canvas) ----------
const texCache = new Map<string, THREE.CanvasTexture>();

/** Tecido estampado para lenço, saia e capuz: liso, listras ou florido. */
export const fabricTexture = (p: Pattern | { kind: 'lenco'; a: string; b: string; c: string }, repeat = 1) => {
  const key = JSON.stringify(p) + repeat;
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const any = p as { a: string; b?: string; c?: string };
  g.fillStyle = any.a;
  g.fillRect(0, 0, 256, 256);
  const flower = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    g.fill();
  };
  if (p.kind === 'listras') {
    g.fillStyle = any.b!;
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 16, 256);
  } else if (p.kind === 'florido' || p.kind === 'lenco') {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 26; i++) flower(rnd() * 256, rnd() * 256, 10 + rnd() * 10, rnd() > 0.5 ? any.b! : any.c!);
    if (p.kind === 'lenco') {
      // barra rendada na borda (embaixo da textura = borda do lenço)
      g.fillStyle = any.c!;
      g.fillRect(0, 226, 256, 14);
      g.fillStyle = '#ffffff';
      for (let x = 4; x < 256; x += 12) {
        g.beginPath();
        g.arc(x, 246, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  texCache.set(key, tex);
  return tex;
};

const strawTexture = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d9bb6c';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 6) {
      for (let x = (y / 6) % 2 ? 0 : 6; x < 128; x += 12) {
        g.fillStyle = 'rgba(140,105,40,0.35)';
        g.fillRect(x, y, 8, 3);
      }
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
    return t;
  };
})();

const smallFlower = (color: string, size: number) => {
  const g = new THREE.Group();
  const petal = std(color, 0.6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(mesh(sphere, petal, [Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55, 0], [0, 0, 0], [size * 0.5, size * 0.5, size * 0.18]));
  }
  g.add(mesh(sphere, std('#ffd23f', 0.5), [0, 0, size * 0.1], [0, 0, 0], size * 0.28));
  return g;
};

// ---------- chapéus e cabeça ----------
export const buildHat = (hat: Hat, body: Look['body']): THREE.Object3D => {
  const h = HEAD[body];
  const base = h.eyesY + 0.065;
  const g = new THREE.Group();
  switch (hat.kind) {
    case 'palha': {
      const straw = std('#ffffff', 0.9, { map: strawTexture() });
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.012, 40), straw, [0, base, 0.005]));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.112, 0.11, 32), straw, [0, base + 0.058, -0.005]));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 32), straw, [0, base + 0.115, -0.005]));
      g.add(mesh(new THREE.CylinderGeometry(0.113, 0.114, 0.028, 32), std(hat.band, 0.7), [0, base + 0.02, -0.005]));
      if (hat.flag) {
        // bandeirinha do Brasil na faixa
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.022, 0.004), std('#1f8f3a'), [0, base + 0.02, 0.112]));
        g.add(mesh(new THREE.BoxGeometry(0.02, 0.02, 0.004), std('#ffd23f'), [0, base + 0.02, 0.115], [0, 0, Math.PI / 4]));
        g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12), std('#1f3a8a'), [0, base + 0.02, 0.118], [Math.PI / 2, 0, 0]));
      }
      if (hat.flower) {
        const f = smallFlower(hat.flower, 0.03);
        f.position.set(-0.085, base + 0.03, 0.07);
        f.rotation.y = -0.7;
        g.add(f);
      }
      break;
    }
    case 'fedora': {
      const felt = std(hat.color, 0.8);
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.165, 0.012, 40), felt, [0, base, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.095, 0.108, 0.12, 32), felt, [0, base + 0.062, -0.005], [0, 0, 0], [1, 1, 1.08]));
      g.add(mesh(sphere, felt, [0, base + 0.122, -0.005], [0, 0, 0], [0.095, 0.018, 0.1]));
      g.add(mesh(new THREE.CylinderGeometry(0.109, 0.11, 0.025, 32), std(hat.band, 0.6), [0, base + 0.02, -0.005], [0, 0, 0], [1, 1, 1.08]));
      break;
    }
    case 'bone': {
      const cloth = std(hat.color, 0.85);
      g.add(mesh(new THREE.SphereGeometry(0.112, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloth, [0, base - 0.01, -0.005]));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.01, 0.1), cloth, [0, base - 0.008, 0.13], [0.12, 0, 0]));
      break;
    }
    case 'bruxa': {
      const felt = std(hat.color, 0.8);
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.012, 40), felt, [0, base, 0]));
      g.add(mesh(new THREE.ConeGeometry(0.115, 0.24, 28), felt, [0, base + 0.12, -0.01]));
      g.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 20), felt, [0, base + 0.29, -0.06], [-0.6, 0, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.112, 0.116, 0.03, 28), std(hat.band, 0.4, { metalness: 0.4 }), [0, base + 0.02, -0.01]));
      const f = smallFlower('#9b5de5', 0.035);
      f.position.set(-0.09, base + 0.04, 0.07);
      f.rotation.y = -0.6;
      g.add(f);
      break;
    }
    case 'lenco': {
      const fabric = std('#ffffff', 0.85, { map: fabricTexture({ kind: 'lenco', a: hat.color, b: hat.flowers, c: hat.edge }, 1), side: THREE.DoubleSide });
      // lenço cobrindo topo e nuca até a altura da orelha, com o nó atrás
      // inclinado pra trás: cobre o alto da cabeça e a nuca, deixando testa e olhos de fora
      g.add(mesh(new THREE.SphereGeometry(0.122, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), fabric, [0, h.cy + 0.035, -0.02], [-0.55, 0, 0], [1.02, 1.05, 1.12]));
      g.add(mesh(sphere, fabric, [0, h.cy - 0.04, -0.13], [0, 0, 0], 0.035));
      g.add(mesh(new THREE.ConeGeometry(0.045, 0.16, 12), fabric, [0.03, h.cy - 0.13, -0.14], [0.2, 0, 0.25]));
      g.add(mesh(new THREE.ConeGeometry(0.045, 0.14, 12), fabric, [-0.03, h.cy - 0.12, -0.14], [0.2, 0, -0.25]));
      break;
    }
    case 'coroa-flores': {
      const colors = ['#ff4f6d', '#ffcf33', '#ff8a1f', '#ec3b7c', '#ff4f6d', '#ffcf33', '#f7f2ea'];
      colors.forEach((c, i) => {
        const a = -Math.PI * 0.85 + (i / (colors.length - 1)) * Math.PI * 1.7;
        const big = i === 2 || i === 4;
        const f = smallFlower(c, big ? 0.05 : 0.034);
        f.position.set(Math.sin(a) * 0.11, base + 0.035 + (big ? 0.02 : 0), Math.cos(a) * 0.11 - 0.01);
        f.lookAt(new THREE.Vector3(Math.sin(a) * 0.4, base + 0.12, Math.cos(a) * 0.4));
        g.add(f);
      });
      break;
    }
  }
  return g;
};

export const buildMustache = (color: string, body: Look['body']) => {
  const h = HEAD[body];
  const g = new THREE.Group();
  const mat = std(color, 0.9);
  for (const s of [1, -1]) g.add(mesh(sphere, mat, [s * 0.022, h.eyesY - 0.063, h.faceZ + 0.006], [0, 0, s * 0.35], [0.028, 0.011, 0.012]));
  return g;
};

export const buildGlasses = (body: Look['body']) => {
  const h = HEAD[body];
  const g = new THREE.Group();
  const mat = std('#1b1b1b', 0.3, { metalness: 0.4 });
  for (const s of [1, -1]) g.add(mesh(new THREE.TorusGeometry(0.02, 0.0028, 6, 18), mat, [s * 0.032, h.eyesY, h.faceZ + 0.008]));
  g.add(mesh(new THREE.BoxGeometry(0.024, 0.003, 0.003), mat, [0, h.eyesY + 0.004, h.faceZ + 0.01]));
  return g;
};

/** Saia rodada (só em pé: sentado, o vestido pintado nas pernas fica mais natural). */
export const buildSkirt = (p: Pattern, waistY: number) => {
  const tex = fabricTexture(p, 2);
  const geo = new THREE.CylinderGeometry(0.17, 0.31, 0.42, 36, 1, true);
  const skirt = mesh(geo, std('#ffffff', 0.85, { map: tex, side: THREE.DoubleSide }), [0, waistY - 0.2, 0.0]);
  // babado na barra
  skirt.add(mesh(new THREE.TorusGeometry(0.31, 0.018, 8, 36), std('#ffffff', 0.85, { map: tex }), [0, -0.21, 0], [Math.PI / 2, 0, 0]));
  return skirt;
};

export const buildCape = (color: string, neckY: number) => {
  const geo = new THREE.CylinderGeometry(0.2, 0.36, 0.95, 32, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  return mesh(geo, std(color, 0.85, { side: THREE.DoubleSide }), [0, neckY - 0.5, -0.04]);
};

/** Ramo de ervas preso à mão direita (pose T: mão direita em -x). */
export const buildBouquet = (handX: number, armY: number) => {
  const g = new THREE.Group();
  const leaf = std('#4f8a3a', 0.8);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.add(mesh(new THREE.ConeGeometry(0.012, 0.16, 6), leaf, [Math.cos(a) * 0.018, 0.08, Math.sin(a) * 0.018], [Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25]));
  }
  for (const [x, z, c] of [
    [0.01, 0.01, '#ffd23f'],
    [-0.015, 0.005, '#9b5de5'],
    [0.0, -0.015, '#ffffff'],
  ] as const) {
    g.add(mesh(sphere, std(c, 0.6), [x, 0.17, z], [0, 0, 0], 0.014));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10), std('#b08a52', 0.9), [0, 0.02, 0]));
  g.position.set(-handX - 0.07, armY - 0.02, 0.04);
  return g;
};

// ---------- cabeças de fantasia ----------
const eye = (x: number, y: number, z: number, r: number, iris = '#1b1b1b') => {
  const g = new THREE.Group();
  g.add(mesh(sphere, std('#ffffff', 0.3), [x, y, z], [0, 0, 0], r));
  g.add(mesh(sphere, std(iris, 0.2), [x * 1.05, y, z + r * 0.62], [0, 0, 0], r * 0.55));
  g.add(mesh(sphere, std('#ffffff', 0.1, { emissive: '#ffffff', emissiveIntensity: 0.4 }), [x * 1.05 + r * 0.15, y + r * 0.2, z + r * 0.95], [0, 0, 0], r * 0.15));
  return g;
};

export const buildCreatureHead = (kind: NonNullable<Look['creature']>, cy: number) => {
  const g = new THREE.Group();
  if (kind === 'boi') {
    const hood = std('#ffffff', 0.85, { map: fabricTexture({ kind: 'florido', a: '#c8102e', b: '#ffd23f', c: '#2e9e4f' }, 2) });
    g.add(mesh(sphere, std('#f3e3cf', 0.7), [0, cy, 0.03], [0, 0, 0], [0.15, 0.14, 0.14]));
    g.add(mesh(sphere, std('#e9b8a5', 0.6), [0, cy - 0.05, 0.14], [0, 0, 0], [0.09, 0.065, 0.06]));
    for (const s of [1, -1]) {
      g.add(mesh(sphere, std('#5a3d2b'), [s * 0.03, cy - 0.045, 0.195], [0, 0, 0], 0.012));
      g.add(eye(s * 0.06, cy + 0.03, 0.135, 0.032));
      g.add(mesh(sphere, std('#f2a0a8', 0.6), [s * 0.1, cy - 0.02, 0.1], [0, 0, 0], [0.03, 0.02, 0.01]));
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.16, 12), std('#efe2c4', 0.5), [s * 0.12, cy + 0.15, -0.01], [0, 0, s * -0.55]));
      g.add(mesh(sphere, std('#6b4a3a'), [s * 0.17, cy + 0.06, -0.01], [0, 0, s * 0.5], [0.06, 0.025, 0.035]));
    }
    // capuz florido com babado amarelo e azul
    g.add(mesh(new THREE.SphereGeometry(0.17, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hood, [0, cy + 0.02, -0.02], [-0.35, 0, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 28, Math.PI * 1.2), std('#ffd23f'), [0, cy + 0.03, 0.06], [0, 0, -0.1 - Math.PI * 0.1]));
    g.add(mesh(new THREE.TorusGeometry(0.135, 0.012, 8, 28, Math.PI * 1.2), std('#2f6fd6'), [0, cy + 0.03, 0.07], [0, 0, -0.1 - Math.PI * 0.1]));
    const f = smallFlower('#ff4f6d', 0.06);
    f.position.set(0, cy - 0.2, 0.12);
    g.add(f);
  } else if (kind === 'bernunca') {
    const skin = std('#2fae8f', 0.6);
    g.add(mesh(sphere, skin, [0, cy + 0.02, 0], [0, 0, 0], [0.14, 0.14, 0.15]));
    g.add(mesh(sphere, skin, [0, cy + 0.0, 0.17], [0.15, 0, 0], [0.11, 0.075, 0.16]));
    g.add(mesh(sphere, std('#a7d977', 0.6), [0, cy - 0.08, 0.15], [-0.2, 0, 0], [0.1, 0.045, 0.15]));
    g.add(mesh(sphere, std('#8b1e2d', 0.5), [0, cy - 0.045, 0.2], [0, 0, 0], [0.08, 0.03, 0.1]));
    for (const s of [1, -1]) {
      g.add(eye(s * 0.07, cy + 0.08, 0.1, 0.045, '#1b5e7a'));
      g.add(mesh(new THREE.ConeGeometry(0.012, 0.035, 8), std('#ffffff', 0.3), [s * 0.05, cy - 0.04, 0.29], [Math.PI, 0, 0]));
      g.add(mesh(sphere, std('#ff8a5b', 0.6), [s * 0.1, cy - 0.01, 0.16], [0, 0, 0], [0.03, 0.02, 0.01]));
    }
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.ConeGeometry(0.03, 0.08, 8), skin, [0, cy + 0.13 - i * 0.05, -0.1 - i * 0.03], [-0.6 - i * 0.2, 0, 0]));
    // tiara de flores
    const band = std('#ffffff', 0.8, { map: fabricTexture({ kind: 'florido', a: '#e4572e', b: '#ff4f9a', c: '#ffd23f' }, 1) });
    g.add(mesh(new THREE.TorusGeometry(0.135, 0.03, 10, 30), band, [0, cy + 0.1, -0.02], [Math.PI / 2 - 0.35, 0, 0]));
    const f = smallFlower('#ff4f9a', 0.05);
    f.position.set(-0.07, cy + 0.17, 0.06);
    g.add(f);
  } else {
    const silver = std('#c9d2da', 0.35, { metalness: 0.35 });
    g.add(mesh(sphere, silver, [0, cy, 0.04], [0, 0, 0], [0.13, 0.14, 0.2]));
    g.add(mesh(sphere, std('#e8eef2', 0.4), [0, cy - 0.06, 0.08], [0, 0, 0], [0.11, 0.07, 0.17]));
    g.add(mesh(sphere, std('#7b2b33', 0.5), [0, cy - 0.03, 0.235], [0, 0, 0], [0.04, 0.025, 0.02]));
    for (const s of [1, -1]) {
      g.add(eye(s * 0.1, cy + 0.03, 0.1, 0.04, '#1f4f8a'));
      g.add(mesh(new THREE.TorusGeometry(0.06, 0.004, 6, 16, Math.PI), std('#8e9aa6'), [s * 0.12, cy - 0.02, -0.02], [0, s * Math.PI / 2, Math.PI / 2]));
    }
    // barbatana em cima
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.quadraticCurveTo(0.05, 0.14, -0.12, 0.1);
    fin.lineTo(-0.16, 0);
    fin.lineTo(0, 0);
    g.add(mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.01, bevelEnabled: false }), std('#8e9aa6', 0.5, { side: THREE.DoubleSide }), [-0.005, cy + 0.12, 0.08], [0, Math.PI / 2, 0]));
  }
  return g;
};
