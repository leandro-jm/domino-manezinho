import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { headAnchors } from '../../game/bubbles';
import { resourcesOf } from '../dispose';
import { HEAD, SHARED_ACCESSORY_GEOMETRY, buildBouquet, buildCape, buildCreatureHead, buildGlasses, buildHat, buildMustache, buildSkirt } from './acessorios';
import { METRICS, dressMaterial } from './clothes';
import type { Look } from './looks';

const URL = {
  homem: '/models/corpo-homem.glb',
  mulher: '/models/corpo-mulher.glb',
  cabelos: '/models/cabelos.glb',
  anim: '/models/animacoes.glb',
  peleHomem: '/models/pele-homem-escura.webp',
  peleMulher: '/models/pele-mulher-escura.webp',
};

export const preloadGente = () => [URL.homem, URL.mulher, URL.cabelos, URL.anim].forEach((u) => useGLTF.preload(u));

const darkSkin = (() => {
  const cache = new Map<string, THREE.Texture>();
  return (body: Look['body'], flipY: boolean) => {
    let t = cache.get(body);
    if (!t) {
      t = new THREE.TextureLoader().load(body === 'homem' ? URL.peleHomem : URL.peleMulher);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = flipY;
      cache.set(body, t);
    }
    return t;
  };
})();

/** Cor média das texturas de pele (clara/escura): o tom do look é dividido por ela. */
const SKIN_AVG = { clara: new THREE.Color('#a67858'), escura: new THREE.Color('#9c6e4e') };

const skinColor = (look: Look) => {
  const want = new THREE.Color(look.skin.tint);
  const avg = SKIN_AVG[look.skin.base];
  return new THREE.Color(want.r / avg.r, want.g / avg.g, want.b / avg.b);
};

type V = [number, number, number];
/** Direções (no espaço do personagem: frente +z, esquerda +x) do braço e do antebraço esquerdos; o direito espelha x. */
const ARM_POSES: Record<NonNullable<Look['armPose']>, { upper: [V, V]; fore: [V, V] }> = {
  cruzados: { upper: [[0.28, -0.82, 0.5], [-0.28, -0.8, 0.52]], fore: [[-0.93, 0.1, 0.35], [0.93, 0.2, 0.3]] },
  costas: { upper: [[0.22, -0.86, -0.46], [-0.22, -0.86, -0.46]], fore: [[-0.9, -0.05, -0.42], [0.9, 0.02, -0.42]] },
  queixo: { upper: [[0.28, -0.82, 0.5], [-0.05, -0.5, 0.86]], fore: [[-0.93, 0.1, 0.35], [0.14, 0.97, -0.15]] },
  soltos: { upper: [[0.13, -0.99, 0.04], [-0.13, -0.99, 0.04]], fore: [[0.05, -0.97, 0.24], [-0.05, -0.97, 0.24]] },
};

interface ArmRig {
  bone: THREE.Bone;
  /** Direção do osso em repouso e sua orientação, ambas no espaço do personagem. */
  bindDir: THREE.Vector3;
  bindQuat: THREE.Quaternion;
  target: THREE.Vector3;
}

export type Postura = 'sentado' | 'empe';
export type Gesto = { kind: 'jogar' | 'comemorar'; key: number } | null;

const ARM_OR_SPINE = /^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|spine|neck|Head)/;

/** Recorta uma animação só nos braços e tronco (pra quem está sentado poder "pegar algo na mesa"). */
const upperBodyClip = (clip: THREE.AnimationClip, name: string) =>
  new THREE.AnimationClip(
    name,
    clip.duration,
    clip.tracks.filter((t) => ARM_OR_SPINE.test(t.name.split('.')[0]!)),
  );

interface Props {
  look: Look;
  postura: Postura;
  position: [number, number, number];
  yaw: number;
  talking?: boolean;
  gesto?: Gesto;
  /** Registra um ponto acima da cabeça para o balão de fala (perus). */
  anchorId?: number;
  /** Atraso aleatório da animação, pra ninguém respirar sincronizado. */
  phase?: number;
  /** Projeta sombra (os perus em pé só na qualidade alta: oito bonecos animados na sombra pesam). */
  shadow?: boolean;
}

const tmpQ = new THREE.Quaternion();
const rootQ = new THREE.Quaternion();
const parentQ = new THREE.Quaternion();
const dirW = new THREE.Vector3();
const bindW = new THREE.Vector3();

/** Mira braço e antebraço nas direções da pose (rotação mínima a partir da pose de repouso). */
const aimArms = (root: THREE.Object3D, rig: ArmRig[], weight: number) => {
  if (!rig.length || weight <= 0.001) return;
  root.getWorldQuaternion(rootQ);
  for (const r of rig) {
    dirW.copy(r.target).applyQuaternion(rootQ);
    bindW.copy(r.bindDir).applyQuaternion(rootQ);
    // orientação desejada no mundo = giro(bind→alvo) · orientação de repouso no mundo
    tmpQ.setFromUnitVectors(bindW, dirW).multiply(rootQ.clone().multiply(r.bindQuat));
    r.bone.parent!.getWorldQuaternion(parentQ);
    tmpQ.premultiply(parentQ.invert());
    r.bone.quaternion.slerp(tmpQ, weight);
    r.bone.updateMatrixWorld(true);
  }
};

export function Pessoa({ look, postura, position, yaw, talking = false, gesto = null, anchorId, phase = 0, shadow = true }: Props) {
  const body = useGLTF(URL[look.body]);
  const hair = useGLTF(URL.cabelos);
  const anims = useGLTF(URL.anim);

  const built = useMemo(() => {
    const root = SkeletonUtils.clone(body.scene) as THREE.Group;
    root.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.castShadow = shadow;
      sm.frustumCulled = false;
      const mat = (sm.material as THREE.MeshStandardMaterial).clone();
      sm.material = mat;
      if (/Superhero/i.test(mat.name)) {
        if (look.skin.base === 'escura') mat.map = darkSkin(look.body, mat.map?.flipY ?? false);
        mat.color.copy(skinColor(look));
        dressMaterial(mat, look);
      } else if (/Hair/i.test(mat.name)) {
        mat.map = null;
        mat.color.set(look.eyebrows);
      }
    });
    // Guia de braços (pose T ainda intacta aqui): direção e orientação de repouso de cada osso.
    const armRig: ArmRig[] = [];
    if (look.armPose && postura === 'empe') {
      const pose = ARM_POSES[look.armPose];
      const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
      (['l', 'r'] as const).forEach((side, i) => {
        const upper = bones.get(`upperarm_${side}`)!;
        const lower = bones.get(`lowerarm_${side}`)!;
        const hand = bones.get(`hand_${side}`)!;
        armRig.push(
          { bone: upper, bindDir: at(lower).sub(at(upper)).normalize(), bindQuat: upper.getWorldQuaternion(new THREE.Quaternion()), target: new THREE.Vector3(...pose.upper[i]!).normalize() },
          { bone: lower, bindDir: at(hand).sub(at(lower)).normalize(), bindQuat: lower.getWorldQuaternion(new THREE.Quaternion()), target: new THREE.Vector3(...pose.fore[i]!).normalize() },
        );
      });
    }
    const bone = (n: string) => bones.get(n)!;
    const head = bone('Head');
    const h = HEAD[look.body];
    const m = METRICS[look.body];

    const hairPiece = (name: string, color: string) => {
      const src = hair.scene.getObjectByName(name);
      if (!src) return;
      const piece = src.clone(true);
      piece.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.map = null;
        mat.color.set(color);
        mat.roughness = 0.8;
        mesh.material = mat;
        mesh.castShadow = shadow;
      });
      root.add(piece);
      piece.updateMatrixWorld(true);
      head.attach(piece);
    };
    const attach = (b: THREE.Bone, obj: THREE.Object3D) => {
      root.add(obj);
      obj.updateMatrixWorld(true);
      b.attach(obj);
    };

    if (look.creature) {
      attach(bone('neck_01'), buildCreatureHead(look.creature, h.cy + 0.02));
      head.scale.setScalar(0.001);
    } else {
      // Com chapéu, cabelo comprido e coque ficam; os outros penteados sumiriam dentro do chapéu mesmo.
      if (look.hair) hairPiece(look.hair.style, look.hair.color);
      if (look.beard) hairPiece('Hair_Beard', look.beard);
      if (look.hat) attach(head, buildHat(look.hat, look.body));
      if (look.mustache) attach(head, buildMustache(look.mustache, look.body));
      if (look.glasses) attach(head, buildGlasses(look.body));
    }
    // Em pé, vestido ganha saia rodada; sentado, as pernas ficam debaixo da mesa.
    const skirt = look.skirt ?? (look.bottom.kind === 'vestido' && !look.creature ? look.bottom.pattern : undefined);
    if (skirt && postura === 'empe') attach(bone('pelvis'), buildSkirt(skirt, m.waistY));
    if (look.cape) attach(bone('spine_03'), buildCape(look.cape, m.neckY));
    if (look.bouquet) attach(bone('hand_r'), buildBouquet(m.wristX, m.armY));

    const anchor = new THREE.Object3D();
    anchor.position.set(0, h.top + 0.24, 0);
    attach(head.parent as THREE.Bone, anchor);

    const mixer = new THREE.AnimationMixer(root);
    const clip = (name: string) => {
      const c = THREE.AnimationClip.findByName(anims.animations, name);
      if (!c) throw new Error(`Animação ${name} não está em animacoes.glb`);
      return c;
    };
    const base = mixer.clipAction(clip(postura === 'sentado' ? 'Sitting_Idle_Loop' : 'Idle_Loop'));
    const talk = mixer.clipAction(clip(postura === 'sentado' ? 'Sitting_Talking_Loop' : 'Idle_Talking_Loop'));
    const reach = mixer.clipAction(upperBodyClip(clip('PickUp_Table'), 'reach'));
    reach.setLoop(THREE.LoopOnce, 1);
    const dance = mixer.clipAction(postura === 'sentado' ? upperBodyClip(clip('Dance_Loop'), 'dance-upper') : clip('Dance_Loop'));
    base.play();
    base.time = phase * base.getClip().duration;
    talk.play();
    talk.setEffectiveWeight(0);
    talk.time = phase * talk.getClip().duration;
    return { root, mixer, base, talk, reach, dance, anchor, armRig };
  }, [body, hair, anims, look, postura, phase, shadow]);

  useEffect(() => {
    if (anchorId === undefined) return;
    headAnchors.set(anchorId, built.anchor);
    return () => {
      if (headAnchors.get(anchorId) === built.anchor) headAnchors.delete(anchorId);
    };
  }, [anchorId, built]);

  useEffect(
    () => () => {
      built.mixer.stopAllAction();
      built.mixer.uncacheRoot(built.root);
      // Libera só o que esta pessoa criou: materiais clonados e geometria dos acessórios. A geometria dos
      // GLB e as texturas (pele, tecidos) são compartilhadas e ficam.
      const shared = resourcesOf(body.scene, hair.scene);
      built.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!shared.has(mesh.geometry) && !SHARED_ACCESSORY_GEOMETRY.has(mesh.geometry)) mesh.geometry.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (!shared.has(m)) m.dispose();
      });
    },
    [built, body, hair],
  );

  // Gesto pontual: esticar o braço pra baixar a pedra, ou comemorar.
  const gestoUntil = useRef(0);
  useEffect(() => {
    if (!gesto) return;
    const { reach, dance } = built;
    if (gesto.kind === 'jogar') {
      reach.reset().play();
      gestoUntil.current = performance.now() + reach.getClip().duration * 1000;
    } else {
      dance.reset().play();
      gestoUntil.current = performance.now() + 2600;
    }
  }, [gesto?.key, built]); // eslint-disable-line react-hooks/exhaustive-deps

  const talkWeight = useRef(0);
  useFrame((_, dt) => {
    const { mixer, talk, base, reach, dance } = built;
    talkWeight.current += ((talking ? 1 : 0) - talkWeight.current) * Math.min(1, dt * 4);
    talk.setEffectiveWeight(talkWeight.current);
    base.setEffectiveWeight(1 - talkWeight.current * 0.95);
    // O gesto manda nos braços: peso alto pra sobrepor a pose de base nesses ossos.
    const now = performance.now();
    const left = Math.max(0, gestoUntil.current - now);
    const g = Math.min(1, left / 300, (now - (gestoUntil.current - (reach.isRunning() ? reach.getClip().duration * 1000 : 2600))) / 250);
    const w = Math.max(0, g) * 6;
    reach.setEffectiveWeight(reach.isRunning() ? w : 0);
    dance.setEffectiveWeight(dance.isRunning() ? w : 0);
    if (left <= 0 && dance.isRunning()) dance.stop();
    mixer.update(dt);
    aimArms(built.root, built.armRig, (1 - talkWeight.current) * (dance.isRunning() ? 0 : 1));
  });

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={look.scale ?? 1}>
      <primitive object={built.root} />
    </group>
  );
}
