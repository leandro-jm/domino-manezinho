import * as THREE from 'three';
import type { Look, Pattern } from './looks';

/**
 * "Guarda-roupa" no shader: cada vértice conhece sua posição de repouso (pose T, em metros, frente +z),
 * então dá pra decidir se aquele ponto é camisa, manga, calça, sapato, avental… e pintar com estampa.
 * Assim um único corpo CC0 veste qualquer personagem sem modelar roupa.
 */

/** Marcos do corpo em pose T (medidos nos modelos da Quaternius). */
export interface BodyMetrics {
  armY: number;
  shoulderX: number;
  elbowX: number;
  wristX: number;
  neckY: number;
  waistY: number;
  kneeY: number;
  ankleY: number;
  bellyY: number;
}

export const METRICS: Record<Look['body'], BodyMetrics> = {
  homem: { armY: 1.455, shoulderX: 0.2, elbowX: 0.463, wristX: 0.7, neckY: 1.5, waistY: 0.99, kneeY: 0.54, ankleY: 0.1, bellyY: 1.08 },
  mulher: { armY: 1.418, shoulderX: 0.15, elbowX: 0.392, wristX: 0.635, neckY: 1.465, waistY: 0.97, kneeY: 0.535, ankleY: 0.095, bellyY: 1.06 },
};

const PATTERN_ID: Record<Pattern['kind'], number> = { liso: 0, listras: 1, xadrez: 2, florido: 3, escamas: 4, surfe: 5 };

const color = (c?: string) => new THREE.Color(c ?? '#000000');

const patternUniforms = (p: Pattern | undefined, prefix: string) => {
  const any = p as { a?: string; b?: string; c?: string } | undefined;
  return {
    [`${prefix}Kind`]: { value: p ? PATTERN_ID[p.kind] : -1 },
    [`${prefix}A`]: { value: color(any?.a) },
    [`${prefix}B`]: { value: color(any?.b ?? any?.a) },
    [`${prefix}C`]: { value: color(any?.c ?? any?.b ?? any?.a) },
  };
};

const GLSL_COMMON = /* glsl */ `
varying vec3 vBindPos;
uniform float uArmY, uShoulderX, uElbowX, uWristX, uNeckY, uWaistY, uKneeY, uAnkleY;
uniform float uSleeves, uHem, uBottomKind, uShoeKind, uCostume, uApron, uApronBib, uShawl, uOpen;
uniform vec3 uShoe, uApronColor, uShawlColor, uOpenColor;
uniform int uTopKind, uBotKind, uVestKind;
uniform vec3 uTopA, uTopB, uTopC, uBotA, uBotB, uBotC, uVestA, uVestB, uVestC;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// Estampas em coordenadas do corpo (metros): listras verticais, xadrez, flores, escamas, frisos de surfe.
vec3 pattern(int kind, vec3 a, vec3 b, vec3 c, vec3 p) {
  if (kind == 1) return mix(a, b, step(0.5, fract(p.x * 14.0 + 0.25)));
  if (kind == 2) {
    float h = step(0.62, fract(p.x * 11.0)), v = step(0.62, fract(p.y * 11.0));
    float thin = step(0.92, fract(p.x * 33.0)) + step(0.92, fract(p.y * 33.0));
    return mix(mix(a, b, (h + v) * 0.45), a * 0.6, min(thin, 1.0) * 0.35);
  }
  if (kind == 3) {
    vec2 uv = vec2(p.x + p.z * 0.7, p.y) * 7.0;
    vec2 cell = floor(uv), f = fract(uv) - 0.5;
    float r = hash21(cell);
    vec2 o = (vec2(hash21(cell + 7.1), hash21(cell + 3.7)) - 0.5) * 0.25;
    vec2 d = f - o;
    float ang = atan(d.y, d.x);
    float petals = 0.34 + 0.12 * cos(ang * 5.0 + r * 6.28);
    float flower = step(length(d), petals * (0.7 + 0.3 * r));
    float core = step(length(d), 0.09);
    float leaf = step(length(d - vec2(0.3, -0.25)), 0.11) * (1.0 - flower);
    vec3 fc = r > 0.5 ? b : c;
    vec3 col = mix(a, fc, flower);
    col = mix(col, vec3(0.2, 0.55, 0.25), leaf * step(0.4, r));
    return mix(col, vec3(1.0, 0.85, 0.2), core * flower);
  }
  if (kind == 4) {
    vec2 uv = vec2(p.x + p.z, p.y) * 22.0;
    uv.x += step(1.0, mod(floor(uv.y), 2.0)) * 0.5;
    vec2 f = fract(uv) - vec2(0.5, 0.0);
    float arc = smoothstep(0.42, 0.5, length(f)) * (1.0 - smoothstep(0.5, 0.56, length(f)));
    return mix(a, b, arc) * (0.92 + 0.08 * fract(uv.y));
  }
  if (kind == 5) {
    float ax = abs(p.x);
    float seam = ax < uShoulderX ? 1.0 - step(0.008, abs(ax - uShoulderX * 0.82)) : 1.0 - step(0.007, abs(p.y - (uArmY + 0.042)));
    return mix(a, b, seam);
  }
  return a;
}
`;

/** Liga o figurino a um material do corpo. Cada personagem tem seu material (uniforms próprios). */
export const dressMaterial = (material: THREE.MeshStandardMaterial, look: Look) => {
  const m = METRICS[look.body];
  const costume = !!look.creature;
  const uniforms: Record<string, THREE.IUniform> = {
    uArmY: { value: m.armY },
    uShoulderX: { value: m.shoulderX },
    uElbowX: { value: m.elbowX },
    uWristX: { value: m.wristX },
    uNeckY: { value: m.neckY },
    uWaistY: { value: m.waistY },
    uKneeY: { value: m.kneeY },
    uAnkleY: { value: m.ankleY },
    uBellyY: { value: m.bellyY },
    uBelly: { value: look.belly ?? 0 },
    uSleeves: { value: costume ? 1.1 : look.top.sleeves },
    uHem: { value: look.bottom.hem ?? 0 },
    uBottomKind: { value: { calca: 0, bermuda: 1, vestido: 2 }[look.bottom.kind] },
    uShoeKind: { value: { chinelo: 0, sapato: 1, descalco: 2 }[look.shoes.kind] },
    uShoe: { value: color(look.shoes.color) },
    uCostume: { value: costume ? 1 : 0 },
    uApron: { value: look.apron ? 1 : 0 },
    uApronBib: { value: look.apron?.bib ? 1 : 0 },
    uApronColor: { value: color(look.apron?.color) },
    uShawl: { value: look.shawl ? 1 : 0 },
    uShawlColor: { value: color(look.shawl) },
    uOpen: { value: look.top.open ? 1 : 0 },
    uOpenColor: { value: color(look.top.open) },
    ...patternUniforms(look.top.pattern, 'uTop'),
    ...patternUniforms(look.bottom.pattern, 'uBot'),
    ...patternUniforms(look.vest, 'uVest'),
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBindPos;\nuniform float uBelly, uBellyY;`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vBindPos = position;
        // barriguinha: empurra pra frente a região do umbigo, antes do esqueleto deformar
        float bh = (position.y - uBellyY) / 0.17;
        float bw = position.x / 0.16;
        transformed.z += uBelly * 0.075 * exp(-(bh * bh + bw * bw)) * smoothstep(-0.06, 0.06, position.z);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
      // tecido não tem os músculos do corpo-base: aplaina o relevo e deixa mais fosco onde há roupa
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, clothMask * 0.9));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, clothMask);')
      .replace(
      '#include <map_fragment>',
      /* glsl */ `#include <map_fragment>
      float clothMask = 0.0;
      {
        vec3 p = vBindPos;
        float ax = abs(p.x);
        bool arm = ax > uShoulderX * 0.9 && p.y > uArmY - 0.14;
        bool hand = arm && ax > uWristX - 0.005;
        // decote: baixo só perto do pescoço; nos ombros a roupa sobe até cobrir o trapézio
        float neckline = uNeckY - 0.045 + 0.03 * step(p.z, 0.0) + 0.13 * smoothstep(0.055, 0.15, ax);
        bool torso = !arm && p.y >= uWaistY && p.y < neckline;
        bool legs = !arm && p.y < uWaistY;
        bool front = p.z > 0.01;
        vec3 col = diffuseColor.rgb;
        bool dressed = false;

        // pés
        if (p.y < uAnkleY) {
          if (uShoeKind == 1.0 || (uShoeKind == 0.0 && p.y < 0.022)) { col = uShoe; dressed = true; }
          if (uShoeKind == 0.0 && p.y < 0.06 && ax > 0.08 && ax < 0.14 && p.z > 0.06) { col = uShoe; dressed = true; }
        }
        // parte de baixo
        if (legs && p.y >= uAnkleY) {
          float bottomTo = uBottomKind == 0.0 ? uAnkleY : uBottomKind == 1.0 ? uKneeY + 0.05 : uKneeY - uHem;
          if (p.y >= bottomTo) {
            col = uBottomKind == 2.0 ? pattern(uTopKind, uTopA, uTopB, uTopC, p) : pattern(uBotKind, uBotA, uBotB, uBotC, p);
            if (uBottomKind == 2.0 && uBotKind >= 0) col = pattern(uBotKind, uBotA, uBotB, uBotC, p);
            dressed = true;
          }
        }
        // tronco e mangas
        float sleeveTo = uSleeves <= 0.01 ? uShoulderX + 0.035 : uSleeves < 0.75 ? uShoulderX + (uElbowX - uShoulderX) * 0.55 : uWristX - 0.015;
        bool sleeve = arm && ax < sleeveTo && (uSleeves > 0.01 || p.y > uArmY + 0.02);
        if (torso || sleeve || (uCostume > 0.5 && arm)) {
          col = pattern(uTopKind, uTopA, uTopB, uTopC, p);
          if (uSleeves <= 0.01 && torso && ax > uShoulderX * 0.62 && p.y > uArmY - 0.2) col = diffuseColor.rgb; // cava da regata
          if (uOpen > 0.5 && torso && front && ax < 0.06) col = uOpenColor;                                  // camisa aberta sobre camiseta
          if (uVestKind >= 0 && torso && !(front && ax < 0.045)) col = pattern(uVestKind, uVestA, uVestB, uVestC, p);
          if (uShawl > 0.5 && (torso || (sleeve && ax < uShoulderX + 0.09)) && p.y > uNeckY - 0.2 && !(front && ax < 0.05 && p.y < uNeckY - 0.08)) {
            col = mix(uShawlColor, vec3(0.75, 0.15, 0.12), step(abs(p.y - (uNeckY - 0.195)), 0.008));
          }
          dressed = true;
        }
        // avental (com peitilho, se tiver)
        if (uApron > 0.5 && front && ax < 0.17 && p.y < uWaistY + 0.02 && p.y > uKneeY - 0.02) { col = uApronColor; dressed = true; }
        if (uApron > 0.5 && uApronBib > 0.5 && front && torso && ax < 0.12 && p.y < uArmY - 0.06) { col = uApronColor; dressed = true; }
        if (uApron > 0.5 && uApronBib > 0.5 && front && torso && abs(ax - 0.1) < 0.012) { col = uApronColor; dressed = true; }
        // fantasia: luvas da mesma estampa
        if (uCostume > 0.5 && hand) { col = pattern(uTopKind, uTopA, uTopB, uTopC, p) * 0.9; dressed = true; }

        if (dressed) { diffuseColor.rgb = col; clothMask = 1.0; }
      }`,
      );
  };
  material.customProgramCacheKey = () => 'domino-roupa-v1';
  material.needsUpdate = true;
};
