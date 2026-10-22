import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ADRO_HEIGHT, Catedral } from './Catedral';
import { Pombos } from './Pombos';
import { useDisposeOnChange } from './dispose';
import { calcadaTexture, concreteTexture } from './textures';

/** Onde os pombos andam: atrás da mesa, sem entrar embaixo dela. */
const POMBOS_AREA = { minX: -2.6, maxX: 2.6, minZ: -3.6, maxZ: -1.1 };

/**
 * Entorno da Praça XV de Novembro, em metros (o grupo pai escala para as unidades da mesa).
 * Peças principais: calçada portuguesa, Figueira Centenária com as escoras de ferro,
 * Catedral Metropolitana no alto, o Palácio Cruz e Sousa rosado, mesas de dominó e pombos.
 * Tudo low-poly e procedural — pode ser trocado por modelos glTF depois.
 */

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function Ground() {
  const tex = calcadaTexture();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  );
}

function Figueira({ position, detail }: { position: [number, number, number]; detail: number }) {
  const canopy = useRef<THREE.InstancedMesh>(null);
  const { blobs, branches } = useMemo(() => {
    const r = rand(42);
    const blobs = Array.from({ length: Math.round(90 * detail) }, () => {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 15;
      return {
        p: new THREE.Vector3(Math.cos(a) * d, 7 + r() * 4 - d * 0.12, Math.sin(a) * d),
        s: 2.8 + r() * 2.6,
        c: new THREE.Color().setHSL(0.26 + r() * 0.07, 0.42 + r() * 0.2, 0.27 + r() * 0.14),
      };
    });
    const branches = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + r() * 0.4;
      const len = 7 + r() * 6;
      return { a, len, h: 3 + r() * 1.5 };
    });
    return { blobs, branches };
  }, [detail]);

  useLayoutEffect(() => {
    const mesh = canopy.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    blobs.forEach((b, i) => {
      m.compose(b.p, new THREE.Quaternion(), new THREE.Vector3(b.s, b.s * 0.6, b.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, b.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blobs]);

  const bark = '#5b4a3a';
  return (
    <group position={position}>
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.6, 5, 10]} />
        <meshStandardMaterial color={bark} roughness={1} />
      </mesh>
      {branches.map((b, i) => {
        const dir = new THREE.Vector3(Math.cos(b.a), 0.18, Math.sin(b.a)).normalize();
        const mid = dir.clone().multiplyScalar(b.len / 2).add(new THREE.Vector3(0, b.h, 0));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const tip = dir.clone().multiplyScalar(b.len * 0.7).add(new THREE.Vector3(0, b.h, 0));
        return (
          <group key={i}>
            <mesh position={mid} quaternion={q} castShadow>
              <cylinderGeometry args={[0.25, 0.55, b.len, 6]} />
              <meshStandardMaterial color={bark} roughness={1} />
            </mesh>
            {/* escoras de ferro que seguram os galhos (nenhuma em cima da nossa mesa, na origem) */}
            {Math.hypot(position[0] + tip.x, position[2] + tip.z) > 2 && (
              <mesh position={[tip.x, tip.y / 2, tip.z]}>
                <cylinderGeometry args={[0.07, 0.07, tip.y, 6]} />
                <meshStandardMaterial color="#1f3b2c" metalness={0.6} roughness={0.5} />
              </mesh>
            )}
          </group>
        );
      })}
      <instancedMesh ref={canopy} args={[undefined, undefined, blobs.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        {/* leve brilho próprio: por baixo, a copa recebe pouca luz e virava um borrão preto */}
        <meshStandardMaterial roughness={0.9} flatShading emissive="#1f3313" emissiveIntensity={0.45} />
      </instancedMesh>
      {/* gradil baixo em volta do tronco */}
      <mesh position={[0, 0.3, 0]}>
        <torusGeometry args={[3, 0.05, 4, 32]} />
        <meshStandardMaterial color="#1f3b2c" metalness={0.5} />
      </mesh>
    </group>
  );
}

/** Palácio Cruz e Sousa, o casarão rosado da praça. */
function Palacio({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 7, 0]} castShadow>
        <boxGeometry args={[34, 14, 16]} />
        <meshStandardMaterial color="#d99aa0" />
      </mesh>
      <mesh position={[0, 14.4, 0]}>
        <boxGeometry args={[35, 0.8, 17]} />
        <meshStandardMaterial color="#f6efe6" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <group key={i}>
          <mesh position={[-14 + i * 3.5, 4, 8.05]}>
            <boxGeometry args={[1.5, 3, 0.1]} />
            <meshStandardMaterial color="#fbf7ef" />
          </mesh>
          <mesh position={[-14 + i * 3.5, 10, 8.05]}>
            <boxGeometry args={[1.5, 3, 0.1]} />
            <meshStandardMaterial color="#fbf7ef" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 16.5, 7.5]}>
        <coneGeometry args={[6, 3.5, 3]} />
        <meshStandardMaterial color="#f6efe6" />
      </mesh>
    </group>
  );
}

/** Grade de janelas desenhada em canvas, repetida por andar. */
const facadeTexture = (kind: 'residencial' | 'vidro', floors: number, cols: number) => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  if (kind === 'vidro') {
    const grad = g.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#9fb3c2');
    grad.addColorStop(1, '#6f8597');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#d9e1e6';
    g.lineWidth = 3;
    for (let x = 0; x <= 256; x += 32) g.strokeRect(x, 0, 0, 256);
    for (let y = 0; y <= 256; y += 64) g.strokeRect(0, y, 256, 0);
  } else {
    g.fillStyle = '#e4d6bd';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) {
      g.fillStyle = '#cdbd9f';
      g.fillRect(0, y + 52, 256, 12);
      for (let x = 0; x < 256; x += 64) {
        g.fillStyle = '#4a5560';
        g.fillRect(x + 12, y + 14, 40, 30);
        g.fillStyle = '#f2ece0';
        g.fillRect(x + 8, y + 44, 48, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(cols / 4, floors / 4);
  return tex;
};

/** Prédios modernos que cercam a catedral (como na foto da praça). */
function Predio({ position, size, kind }: { position: [number, number, number]; size: [number, number, number]; kind: 'residencial' | 'vidro' }) {
  const [w, h, d] = size;
  const mats = useMemo(() => {
    const floors = Math.round(h / 3);
    const front = new THREE.MeshStandardMaterial({ map: facadeTexture(kind, floors, Math.round(w / 3)), roughness: kind === 'vidro' ? 0.25 : 0.85, metalness: kind === 'vidro' ? 0.3 : 0 });
    const side = new THREE.MeshStandardMaterial({ map: facadeTexture(kind, floors, Math.round(d / 3)), roughness: kind === 'vidro' ? 0.25 : 0.85, metalness: kind === 'vidro' ? 0.3 : 0 });
    const top = new THREE.MeshStandardMaterial({ color: '#8d8a84' });
    return [side, side, top, top, front, front];
  }, [w, h, d, kind]);
  // Fachadas são desenhadas para cada prédio: material e textura são dele.
  useDisposeOnChange(mats, true);
  return (
    <mesh position={[position[0], h / 2, position[2]]} material={mats}>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Casario() {
  const houses = useMemo(() => {
    const r = rand(7);
    const colors = ['#f2d16b', '#8fc1b5', '#e8a87c', '#c5d5e4', '#f0e2c4', '#b5c99a', '#e3b5a4'];
    return Array.from({ length: 16 }, (_, i) => {
      const side = i < 8 ? -1 : 1;
      return {
        p: [side * (58 + r() * 4), 0, -60 + (i % 8) * 14] as [number, number, number],
        w: 10 + r() * 4,
        h: 8 + r() * 12,
        c: colors[Math.floor(r() * colors.length)]!,
      };
    });
  }, []);
  return (
    <>
      {houses.map((h, i) => (
        <mesh key={i} position={[h.p[0], h.h / 2, h.p[2]]}>
          <boxGeometry args={[12, h.h, h.w]} />
          <meshStandardMaterial color={h.c} />
        </mesh>
      ))}
    </>
  );
}

function OtherTable({ position }: { position: [number, number, number] }) {
  const concrete = concreteTexture();
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.05, 0.56]} />
        <meshStandardMaterial map={concrete} color="#e4e3de" />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[0.2, 0.72, 0.2]} />
        <meshStandardMaterial map={concrete} color="#dcdbd6" />
      </mesh>
      {[
        [0.55, 0],
        [-0.55, 0],
        [0, 0.55],
        [0, -0.55],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 0.22, z!]} castShadow>
          <cylinderGeometry args={[0.16, 0.13, 0.45, 12]} />
          <meshStandardMaterial map={concrete} color="#e2e1dc" />
        </mesh>
      ))}
    </group>
  );
}

function Lamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 4, 8]} />
        <meshStandardMaterial color="#1e2a24" metalness={0.5} />
      </mesh>
      <mesh position={[0, 4.2, 0]}>
        <sphereGeometry args={[0.28, 12, 8]} />
        <meshStandardMaterial color="#fff6dc" emissive="#ffe7a8" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Bench({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.8, 0.06, 0.45]} />
        <meshStandardMaterial color="#7a5232" />
      </mesh>
      <mesh position={[0, 0.75, -0.2]} castShadow>
        <boxGeometry args={[1.8, 0.35, 0.05]} />
        <meshStandardMaterial color="#7a5232" />
      </mesh>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.08, 0.45, 0.4]} />
          <meshStandardMaterial color="#26302a" metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Palm({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 6, 0]}>
        <cylinderGeometry args={[0.22, 0.32, 12, 8]} />
        <meshStandardMaterial color="#9a8f7c" />
      </mesh>
      {/* folhas: primeiro inclina, depois gira em volta do tronco (ordem YXZ), cada uma pra um lado */}
      {Array.from({ length: 10 }, (_, i) => (
        <group key={i} position={[0, 12, 0]} rotation={[1.25 + (i % 2) * 0.3, (i / 10) * Math.PI * 2, 0, 'YXZ']}>
          <mesh position={[0, 2.4, 0]} scale={[1, 1, 0.3]}>
            <coneGeometry args={[0.55, 4.8, 4]} />
            <meshStandardMaterial color={i % 2 ? '#3f6b38' : '#4c7d3f'} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Praca({ quality }: { quality: 'baixa' | 'media' | 'alta' }) {
  const detail = quality === 'baixa' ? 0.5 : quality === 'media' ? 0.8 : 1;
  return (
    <group>
      <Ground />
      <Figueira position={[-5.5, 0, -6.5]} detail={detail} />
      <Catedral position={[6, ADRO_HEIGHT, -96]} />
      <Predio position={[-34, 0, -98]} size={[20, 45, 16]} kind="residencial" />
      <Predio position={[-56, 0, -92]} size={[16, 33, 16]} kind="residencial" />
      <Predio position={[48, 0, -100]} size={[20, 40, 18]} kind="vidro" />
      <Predio position={[66, 0, -88]} size={[14, 52, 14]} kind="vidro" />
      <Palacio position={[-46, 0, -40]} rotation={0.5} />
      <Casario />
      {[
        [3.5, 0, -4.5],
        [6.5, 0, -9],
        [-11, 0, 3],
        [8, 0, 3],
        [1, 0, -13],
        [12, 0, -15],
        [-4, 0, -16],
      ].map((p, i) => (
        <OtherTable key={i} position={p as [number, number, number]} />
      ))}
      <Bench position={[-14, 0, -8]} rotation={0.4} />
      <Bench position={[14, 0, -10]} rotation={-0.5} />
      <Bench position={[0, 0, -24]} rotation={0} />
      <Lamp position={[-7, 0, -10]} />
      <Lamp position={[9, 0, -12]} />
      <Lamp position={[-3, 0, -30]} />
      <Palm position={[20, 0, -30]} />
      <Palm position={[26, 0, -18]} />
      <Palm position={[-28, 0, -10]} />
      {quality !== 'baixa' && <Pombos count={quality === 'alta' ? 8 : 5} area={POMBOS_AREA} fancy={quality === 'alta'} />}
    </group>
  );
}
