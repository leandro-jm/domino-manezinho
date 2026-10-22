// Gera os modelos 3D de gente (public/models/) a partir dos pacotes CC0 da Quaternius:
//   - "Universal Base Characters [Standard]"  https://quaternius.itch.io/universal-base-characters
//   - "Universal Animation Library [Standard]" https://quaternius.itch.io/universal-animation-library
// Uso: node scripts/build-characters.mjs <pasta-com-os-dois-pacotes-descompactados>
//
// Saída:
//   corpo-homem.glb / corpo-mulher.glb  corpo + olhos + sobrancelhas, texturas 1024 WebP
//   pele-<homem|mulher>-escura.webp      textura da pele escura, para trocar em tempo real
//   cabelos.glb                          penteados e barba (malhas soltas, presas à cabeça no app)
//   animacoes.glb                        só as animações que a mesa usa, já ajustadas aos corpos
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, quantize, resample, textureCompress, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';

const SRC = process.argv[2];
if (!SRC || !existsSync(SRC)) {
  console.error('Informe a pasta com "Universal Base Characters[Standard]" e "Animation Library[Standard]" descompactados.');
  process.exit(1);
}
const OUT = new URL('../public/models/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const find = (dir, name) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = find(p, name);
      if (hit) return hit;
    } else if (entry.name === name) return p;
  }
  return null;
};
const need = (name) => {
  const p = find(SRC, name);
  if (!p) throw new Error(`Não achei ${name} em ${SRC}`);
  return p;
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const TEX = { encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 };

/** Algumas referências do pacote apontam para "<nome>_png.png", que não existe: cria a cópia. */
const fixMissingImages = (gltfPath) => {
  const dir = gltfPath.slice(0, gltfPath.lastIndexOf('/'));
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.png') && !f.endsWith('_png.png')) {
      const alias = join(dir, f.replace(/\.png$/, '_png.png'));
      if (!existsSync(alias)) copyFileSync(join(dir, f), alias);
    }
  }
};

// ---------- corpos ----------
const BODIES = [
  { id: 'homem', file: 'Superhero_Male_FullBody.gltf', dark: 'T_Superhero_Male_Dark.png', light: 'T_Superhero_Male_Ligh.png' },
  { id: 'mulher', file: 'Superhero_Female_FullBody.gltf', dark: 'T_Superhero_Female_Dark_BaseColor.png', light: 'T_Superhero_Female_Light_BaseColor.png' },
];

for (const body of BODIES) {
  const path = need(body.file);
  fixMissingImages(path);
  const doc = await io.read(path);
  const root = doc.getRoot();
  for (const mat of root.listMaterials()) {
    // Mapa de rugosidade pesa e quase não aparece: vale um número fixo.
    mat.setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.75);
    // A pele embutida é a clara; a escura vai como arquivo à parte.
    const base = mat.getBaseColorTexture();
    if (base && base.getURI().includes('Dark')) {
      base.setImage(await sharp(need(body.light)).png().toBuffer()).setURI(body.light);
    }
  }
  // Posição fica sem quantizar: o app desenha as roupas pela posição de repouso de cada vértice (em metros).
  await doc.transform(prune(), dedup(), textureCompress(TEX), quantize({ pattern: /^(?!POSITION)/ }));
  await io.write(join(OUT, `corpo-${body.id}.glb`), doc);
  await sharp(need(body.dark)).resize(1024, 1024).webp({ quality: 82 }).toFile(join(OUT, `pele-${body.id}-escura.webp`));
  console.log(`corpo-${body.id}.glb ok`);
}

// ---------- cabelos ----------
const HAIRS = ['Hair_Buns', 'Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_Long', 'Hair_SimpleParted', 'Hair_Beard', 'Eyebrows_Regular', 'Eyebrows_Female'];
const hairDoc = await io.read(need(`${HAIRS[0]}.gltf`));
fixMissingImages(need(`${HAIRS[0]}.gltf`));
const scene = hairDoc.getRoot().getDefaultScene() ?? hairDoc.getRoot().listScenes()[0];

for (const name of HAIRS.slice(1)) {
  const other = await io.read(need(`${name}.gltf`));
  const map = mergeDocuments(hairDoc, other);
  for (const s of other.getRoot().listScenes()) for (const n of s.listChildren()) scene.addChild(map.get(n));
}
for (const s of hairDoc.getRoot().listScenes()) if (s !== scene) s.dispose();
await hairDoc.transform(prune(), dedup(), textureCompress(TEX), quantize(), unpartition());
await io.write(join(OUT, 'cabelos.glb'), hairDoc);
console.log('cabelos.glb ok');

// ---------- animações ----------
const KEEP = ['Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Idle_Loop', 'Idle_Talking_Loop', 'PickUp_Table', 'Interact', 'Dance_Loop', 'Hit_Head'];
const tmp = mkdtempSync(join(tmpdir(), 'domino-anim-'));
const fbx = need('AL_Standard.fbx');
const bin = new URL('../node_modules/fbx2gltf/bin/Darwin/FBX2glTF', import.meta.url).pathname;
const converter = existsSync(bin) ? bin : 'FBX2glTF';
execFileSync(converter, ['--binary', '--input', fbx, '--output', join(tmp, 'anim')], { stdio: 'ignore' });
const anim = await io.read(join(tmp, 'anim.glb'));
const bodyRef = await io.read(need(BODIES[0].file));
const restLen = (doc, name) => {
  const t = doc.getRoot().listNodes().find((n) => n.getName() === name).getTranslation();
  return Math.hypot(...t);
};
// Translação da bacia: animação em cm dentro de um nó escalado ×100, corpo em metros e mais alto.
const pelvisScale = restLen(bodyRef, 'pelvis') / restLen(anim, 'pelvis');

for (const clip of anim.getRoot().listAnimations()) {
  const name = clip.getName().replace(/^.*\|/, '');
  if (!KEEP.includes(name)) {
    clip.dispose();
    continue;
  }
  clip.setName(name);
  for (const ch of clip.listChannels()) {
    const node = ch.getTargetNode().getName();
    const path = ch.getTargetPath();
    // Raiz: a rotação de -90° do corpo mora nela, não pode ser sobrescrita.
    // Translação/escala dos ossos: o corpo tem proporções próprias; só a bacia se move.
    if (node === 'root' || path === 'scale' || (path === 'translation' && node !== 'pelvis')) {
      ch.getSampler().dispose();
      ch.dispose();
      continue;
    }
    if (path === 'translation') {
      const out = ch.getSampler().getOutput();
      const arr = out.getArray().slice();
      for (let i = 0; i < arr.length; i++) arr[i] *= pelvisScale;
      out.setArray(arr);
    }
  }
}
// Sem malha: o arquivo só carrega o esqueleto (os nós que as trilhas referenciam) e as animações.
for (const node of anim.getRoot().listNodes()) node.setMesh(null).setSkin(null);
for (const mesh of anim.getRoot().listMeshes()) mesh.dispose();
await anim.transform(resample({ tolerance: 0.0005 }), prune({ keepLeaves: true }), dedup(), unpartition());
await io.write(join(OUT, 'animacoes.glb'), anim);
console.log(`animacoes.glb ok (${KEEP.length} animações, escala da bacia ${pelvisScale.toFixed(2)})`);

writeFileSync(
  join(OUT, 'LICENCA.txt'),
  `Modelos e animações de gente: Quaternius (https://quaternius.com), licença CC0 1.0 (domínio público).
- Universal Base Characters [Standard]
- Universal Animation Library [Standard]
Gerados por apps/web/scripts/build-characters.mjs.
`,
);
