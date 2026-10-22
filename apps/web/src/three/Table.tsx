import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TEAM_ASPECT, TEAM_SPOTS, teamCanvas } from '../game/teams';
import { useDisposeOnChange } from './dispose';
import { concreteTexture, tableTopTexture } from './textures';

/** Medidas em unidades da mesa (1 = comprimento de uma pedra, ~4,5 cm). */
export const TABLE_HALF = 8.6;
/** Metade da área de jogo (mesa + pedras dos outros): é o que a câmera enquadra, não a mesa inteira. */
export const PLAY_HALF = 6.4;
export const TABLE_HEIGHT = 16.5;
const TOP_THICKNESS = 0.7;

/** Sombra das folhas da figueira balançando no tampo — barato e dá muita vida à cena. */
function LeafShadows() {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 8 + Math.random() * 26;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 512);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  useDisposeOnChange(tex);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    tex.offset.set(Math.sin(t * 0.25) * 0.02 + t * 0.002, Math.cos(t * 0.21) * 0.02);
  });

  return (
    <mesh ref={ref} position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[TABLE_HALF * 2, TABLE_HALF * 2]} />
      <meshBasicMaterial map={tex} transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

/** Emblemas do Avaí e do Figueirense pintados nos cantos do fundo do tampo. */
function TeamDecals() {
  const textures = useMemo(
    () =>
      TEAM_SPOTS.map((spot) => {
        const tex = new THREE.CanvasTexture(teamCanvas(spot.team));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        return tex;
      }),
    [],
  );
  useDisposeOnChange(textures);
  const w = 2.3;
  return (
    <>
      {TEAM_SPOTS.map((spot, i) => (
        <mesh
          key={spot.team}
          position={[spot.x * (TABLE_HALF - 1.95), 0.006, spot.z * (TABLE_HALF - 2.05)]}
          rotation={[-Math.PI / 2, 0, -spot.rot]}
          renderOrder={2}
        >
          <planeGeometry args={[w, w * TEAM_ASPECT]} />
          <meshStandardMaterial map={textures[i]} transparent opacity={0.88} roughness={0.75} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </>
  );
}

function Stool({ position }: { position: [number, number, number] }) {
  const concrete = concreteTexture();
  return (
    <group position={position}>
      <mesh position={[0, -TABLE_HEIGHT + 4.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.6, 2.1, 9, 24]} />
        <meshStandardMaterial map={concrete} color="#e2e1dc" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Mesa de concreto da Praça XV: tampo granilite com faixas brancas sobre um pé quadrado. */
export function Table({ shadows, leaves }: { shadows: boolean; leaves: boolean }) {
  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: concreteTexture(), color: '#dcdbd6', roughness: 0.85 });
    const top = new THREE.MeshStandardMaterial({ map: tableTopTexture(), roughness: 0.6 });
    return [side, side, top, side, side, side];
  }, []);
  // Texturas de concreto e tampo vêm de cache: só os materiais são desta mesa.
  useDisposeOnChange(materials);

  return (
    <group>
      <mesh position={[0, -TOP_THICKNESS / 2, 0]} material={materials} receiveShadow={shadows} castShadow={shadows}>
        <boxGeometry args={[TABLE_HALF * 2, TOP_THICKNESS, TABLE_HALF * 2]} />
      </mesh>
      <mesh position={[0, -(TABLE_HEIGHT + TOP_THICKNESS) / 2, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[4.5, TABLE_HEIGHT - TOP_THICKNESS, 4.5]} />
        <meshStandardMaterial map={concreteTexture()} color="#d6d5d0" roughness={0.9} />
      </mesh>
      <TeamDecals />
      {leaves && <LeafShadows />}
      <Stool position={[0, 0, -(TABLE_HALF + 4.4)]} />
      <Stool position={[0, 0, TABLE_HALF + 4.4]} />
      <Stool position={[TABLE_HALF + 4.4, 0, 0]} />
      <Stool position={[-(TABLE_HALF + 4.4), 0, 0]} />
    </group>
  );
}
