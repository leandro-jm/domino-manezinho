import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE_L, TILE_W } from '../game/layout';
import { tileFaceTexture } from './textures';

export const TILE_H = 0.2;
const IVORY = '#efe5c8';

// Uma geometria e um material de corpo pra todas as pedras (eram 49 cópias de cada na mesa cheia).
// Ficam vivos o tempo todo, como as texturas das faces: dispose={null} impede o R3F de descartar.
const bodies = new Map<number, THREE.BufferGeometry>();
const bodyGeometry = (smoothness: number) => {
  let g = bodies.get(smoothness);
  if (!g) bodies.set(smoothness, (g = new RoundedBoxGeometry(TILE_L, TILE_H, TILE_W, smoothness, 0.05)));
  return g;
};
const FACE = new THREE.PlaneGeometry(TILE_L - 0.07, TILE_W - 0.07);
const BODY = new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.35 });
const BODY_GLOW = new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.35, emissive: '#ffb347', emissiveIntensity: 0.35 });

interface DominoProps {
  back: number;
  front: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  rotationOrder?: THREE.EulerOrder;
  /** Cai de cima até a posição final (pedra recém-jogada). */
  drop?: boolean;
  /** Pedra virada para baixo (mão dos outros). */
  hidden?: boolean;
  glow?: boolean;
  highContrast?: boolean;
  smoothness?: number;
  shadows?: boolean;
}

export function Domino({
  back,
  front,
  position,
  rotation = [0, 0, 0],
  rotationOrder = 'XYZ',
  drop = false,
  hidden = false,
  glow = false,
  highContrast = false,
  smoothness = 3,
  shadows = true,
}: DominoProps) {
  const ref = useRef<THREE.Group>(null);
  const lift = useRef(drop ? 3 : 0);
  const face = useMemo(() => (hidden ? null : tileFaceTexture(back, front, highContrast)), [back, front, hidden, highContrast]);
  // Material da face é só desta pedra (a textura vem do cache e fica): descarta ao sair da mesa.
  const faceMat = useMemo(
    () =>
      face &&
      new THREE.MeshStandardMaterial({ map: face, roughness: 0.4, emissive: glow ? '#ffb347' : '#000000', emissiveIntensity: glow ? 0.25 : 0 }),
    [face, glow],
  );
  useEffect(() => () => faceMat?.dispose(), [faceMat]);

  useFrame((_, dt) => {
    if (!ref.current || lift.current <= 0) return;
    lift.current = Math.max(0, lift.current - dt * 14);
    ref.current.position.y = position[1] + lift.current;
  });

  return (
    <group ref={ref} position={[position[0], position[1] + lift.current, position[2]]} rotation={[...rotation, rotationOrder]}>
      <mesh geometry={bodyGeometry(smoothness)} material={glow ? BODY_GLOW : BODY} castShadow={shadows} receiveShadow={shadows} dispose={null} />
      {faceMat && (
        <mesh
          geometry={FACE}
          material={faceMat}
          position={[0, TILE_H / 2 + 0.002, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow={shadows}
          dispose={null}
        />
      )}
    </group>
  );
}

/** Ângulo em torno de Y que leva o eixo comprido da pedra (local +x) para a direção (dx, dz). */
export const yawFor = (dx: number, dz: number) => Math.atan2(-dz, dx);
