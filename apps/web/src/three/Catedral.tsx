import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Catedral Metropolitana de Florianópolis, em metros, vista da Praça XV (a partir de foto de referência):
 * fachada amarela com frisos brancos, duas torres com campanário e cupulinha, pórtico de colunas brancas,
 * frontão branco com rosácea, relógio no alto entre as torres, anexo amarelo à direita e a escadaria
 * larga de granito com patamar descendo até a praça.
 * Origem: centro da base da fachada, no nível do adro; a fachada olha para +z (a praça).
 */

export const ADRO_HEIGHT = 6;

const STAIRS = { rise: 0.2, tread: 0.45, flights: [14, 16] as const, landing: 3, adroDepth: 6, width: 40 };

/** Profundidade do adro + escadaria, da fachada até o pé da escada. */
export const CATEDRAL_STAIRS_DEPTH =
  STAIRS.adroDepth + (STAIRS.flights[0] + STAIRS.flights[1]) * STAIRS.tread + STAIRS.landing;

const C = {
  wall: '#f2c64c',
  wallShade: '#e6b73d',
  trim: '#f8f5ee',
  granite: '#a9a6a0',
  graniteDark: '#8f8c86',
  roof: '#a4553b',
  dome: '#f1ede3',
  opening: '#2b2621',
  door: '#4d3425',
  glass: '#3b4652',
  gold: '#d6b25a',
};

/** Retângulo com topo em semicírculo, base em y = 0. */
const archShape = (w: number, h: number) => {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
};

function Arch({
  x,
  y,
  z = 0,
  w,
  h,
  fill = C.opening,
  frame = 0.25,
  ry = 0,
}: {
  x: number;
  y: number;
  z?: number;
  w: number;
  h: number;
  fill?: string;
  frame?: number;
  ry?: number;
}) {
  const { inner, border } = useMemo(() => {
    const outer = archShape(w + frame * 2, h + frame);
    outer.holes.push(archShape(w, h) as unknown as THREE.Path);
    return {
      inner: new THREE.ShapeGeometry(archShape(w, h), 16),
      border: new THREE.ExtrudeGeometry(outer, { depth: 0.14, bevelEnabled: false, curveSegments: 16 }),
    };
  }, [w, h, frame]);
  return (
    <group position={[x, y, z]} rotation={[0, ry, 0]}>
      <mesh geometry={inner} position={[0, 0, 0.012]}>
        <meshStandardMaterial color={fill} roughness={0.9} />
      </mesh>
      <mesh geometry={border} castShadow>
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Box({ size, pos, color, rough = 0.85 }: { size: [number, number, number]; pos: [number, number, number]; color: string; rough?: number }) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  );
}

function Triangle({ w, h, depth, pos, color }: { w: number; h: number; depth: number; pos: [number, number, number]; color: string }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, h);
    s.lineTo(-w / 2, 0);
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  }, [w, h, depth]);
  return (
    <mesh geometry={geo} position={pos} castShadow>
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}

function RoundWindow({ pos, r, frame = 0.3 }: { pos: [number, number, number]; r: number; frame?: number }) {
  return (
    <group position={pos}>
      <mesh>
        <circleGeometry args={[r, 32]} />
        <meshStandardMaterial color={C.glass} roughness={0.3} metalness={0.2} />
      </mesh>
      {/* raios da rosácea */}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[0, 0, 0.02]} rotation={[0, 0, (i / 4) * Math.PI]}>
          <boxGeometry args={[r * 2, 0.06, 0.02]} />
          <meshStandardMaterial color={C.trim} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.04]}>
        <torusGeometry args={[r + frame / 2, frame / 2, 8, 32]} />
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Clock({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh>
        <circleGeometry args={[1, 40]} />
        <meshStandardMaterial color="#f7f4ea" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <torusGeometry args={[1.05, 0.12, 8, 40]} />
        <meshStandardMaterial color="#2f2f2f" roughness={0.6} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.82, Math.cos(a) * 0.82, 0.02]} rotation={[0, 0, -a]}>
            <boxGeometry args={[0.05, i % 3 === 0 ? 0.2 : 0.1, 0.02]} />
            <meshStandardMaterial color="#1e1e1e" />
          </mesh>
        );
      })}
      <mesh position={[-0.24, 0.1, 0.04]} rotation={[0, 0, 1.15]}>
        <boxGeometry args={[0.06, 0.5, 0.02]} />
        <meshStandardMaterial color="#1e1e1e" />
      </mesh>
      <mesh position={[0.26, 0.22, 0.05]} rotation={[0, 0, -0.9]}>
        <boxGeometry args={[0.045, 0.72, 0.02]} />
        <meshStandardMaterial color="#1e1e1e" />
      </mesh>
    </group>
  );
}

function Urn({ pos, scale = 1 }: { pos: [number, number, number]; scale?: number }) {
  return (
    <group position={pos} scale={scale}>
      <Box size={[0.5, 0.3, 0.5]} pos={[0, 0.15, 0]} color={C.trim} />
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.25, 12, 10]} />
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <coneGeometry args={[0.1, 0.35, 10]} />
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Torre: fuste amarelo com quinas brancas, campanário em arco e cupulinha branca com cruz. */
function Tower({ x }: { x: number }) {
  const w = 4.6;
  const half = w / 2;
  const corners: [number, number][] = [
    [-half + 0.25, -half + 0.25],
    [half - 0.25, -half + 0.25],
    [-half + 0.25, half - 0.25],
    [half - 0.25, half - 0.25],
  ];
  const outward = Math.sign(x);
  return (
    <group position={[x, 0, -half + 0.3]}>
      <Box size={[w, 19, w]} pos={[0, 9.5, 0]} color={C.wall} />
      {corners.map(([cx, cz], i) => (
        <Box key={i} size={[0.5, 19, 0.5]} pos={[cx, 9.5, cz]} color={C.trim} />
      ))}
      {/* janelas do fuste */}
      <Arch x={0} y={9.6} z={half + 0.01} w={1.2} h={2.4} />
      <Arch x={0} y={4} z={half + 0.01} w={1.1} h={2.2} />
      {/* cornija + campanário */}
      <Box size={[w + 0.6, 0.6, w + 0.6]} pos={[0, 19.2, 0]} color={C.trim} />
      <Box size={[w - 0.4, 4.4, w - 0.4]} pos={[0, 21.7, 0]} color={C.wall} />
      {corners.map(([cx, cz], i) => (
        <Box key={i} size={[0.45, 4.4, 0.45]} pos={[cx * 0.9, 21.7, cz * 0.9]} color={C.trim} />
      ))}
      <Arch x={0} y={19.9} z={half - 0.19} w={1.5} h={3} />
      <Arch x={outward * (half - 0.19)} y={19.9} ry={(outward * Math.PI) / 2} w={1.5} h={3} />
      <Arch x={-outward * (half - 0.19)} y={19.9} ry={(-outward * Math.PI) / 2} w={1.5} h={3} />
      <Box size={[w + 0.3, 0.5, w + 0.3]} pos={[0, 24.1, 0]} color={C.trim} />
      {corners.map(([cx, cz], i) => (
        <Urn key={i} pos={[cx, 24.35, cz]} scale={0.8} />
      ))}
      {/* tambor + cupulinha + lanterna + cruz */}
      <mesh position={[0, 25, 0]} castShadow>
        <cylinderGeometry args={[1.5, 1.6, 1.3, 8]} />
        <meshStandardMaterial color={C.wall} roughness={0.85} />
      </mesh>
      <mesh position={[0, 25.65, 0]} scale={[1, 1.35, 1]} castShadow>
        <sphereGeometry args={[1.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={C.dome} roughness={0.6} />
      </mesh>
      <mesh position={[0, 28, 0]}>
        <cylinderGeometry args={[0.3, 0.38, 0.8, 8]} />
        <meshStandardMaterial color={C.wall} roughness={0.8} />
      </mesh>
      <mesh position={[0, 28.5, 0]}>
        <coneGeometry args={[0.4, 0.7, 8]} />
        <meshStandardMaterial color={C.dome} roughness={0.6} />
      </mesh>
      <group position={[0, 29.6, 0]}>
        <Box size={[0.13, 1.4, 0.13]} pos={[0, 0, 0]} color={C.gold} rough={0.4} />
        <Box size={[0.75, 0.13, 0.13]} pos={[0, 0.25, 0]} color={C.gold} rough={0.4} />
      </group>
    </group>
  );
}

/** Corpo central entre as torres: pórtico de colunas, frontão com rosácea e o relógio no alto. */
function Center() {
  const cols = [-3.3, -1.1, 1.1, 3.3];
  return (
    <group>
      <Box size={[9.9, 13.2, 1]} pos={[0, 6.6, -0.5]} color={C.wall} />
      <Box size={[10.4, 0.6, 1.4]} pos={[0, 13.1, -0.35]} color={C.trim} />
      {/* portas atrás do pórtico */}
      <Arch x={0} y={0} z={0.01} w={2.6} h={4.8} fill={C.door} frame={0.35} />
      <Arch x={-2.8} y={0} z={0.01} w={1.4} h={3.4} fill={C.door} />
      <Arch x={2.8} y={0} z={0.01} w={1.4} h={3.4} fill={C.door} />
      {/* pórtico de colunas brancas */}
      <Box size={[9.4, 0.4, 3.4]} pos={[0, 0.2, 1.6]} color={C.granite} />
      {cols.map((x) => (
        <group key={x}>
          <mesh position={[x, 3.3, 2.8]} castShadow>
            <cylinderGeometry args={[0.32, 0.36, 5.8, 16]} />
            <meshStandardMaterial color={C.trim} roughness={0.6} />
          </mesh>
          <Box size={[0.85, 0.35, 0.85]} pos={[x, 0.55, 2.8]} color={C.trim} />
          <Box size={[0.85, 0.35, 0.85]} pos={[x, 6.3, 2.8]} color={C.trim} />
        </group>
      ))}
      <Box size={[9.6, 1, 3.6]} pos={[0, 6.95, 1.5]} color={C.trim} />
      <Triangle w={9.8} h={1.7} depth={0.6} pos={[0, 7.45, 2.65]} color={C.trim} />
      <Box size={[9.6, 0.25, 3.4]} pos={[0, 7.55, 1.4]} color={C.roof} />
      {/* janela sobre o pórtico */}
      <Arch x={0} y={9} z={0.01} w={1.8} h={2.8} />
      {/* frontão branco com a rosácea */}
      <Triangle w={10.6} h={4.6} depth={0.9} pos={[0, 13.4, -0.6]} color={C.trim} />
      <RoundWindow pos={[0, 15.1, 0.32]} r={1.05} />
      {/* parede alta entre as torres, de topo em arco, com o relógio */}
      <mesh position={[0, 17.2, -1.1]} castShadow>
        <shapeGeometry args={[archShape(6.4, 6.2), 24]} />
        <meshStandardMaterial color={C.wall} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <Box size={[6.4, 4.4, 0.6]} pos={[0, 17.2 + 2.2, -1.45]} color={C.wallShade} />
      <Clock pos={[0, 20.2, -1.05]} />
      <Urn pos={[0, 23.3, -1.3]} />
    </group>
  );
}

function Nave() {
  const roof = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-9.6, 0);
    s.lineTo(9.6, 0);
    s.lineTo(0, 4.6);
    s.lineTo(-9.6, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 38, bevelEnabled: false });
  }, []);
  return (
    <group position={[0, 0, -4.6]}>
      <Box size={[18.4, 13, 38]} pos={[0, 6.5, -19]} color={C.wall} />
      <Box size={[19, 0.5, 38.4]} pos={[0, 13.1, -19]} color={C.trim} />
      <mesh geometry={roof} position={[0, 13.3, -38]} castShadow>
        <meshStandardMaterial color={C.roof} roughness={0.9} />
      </mesh>
      {[-1, 1].map((side) =>
        [-6, -13, -20, -27, -34].map((z) => (
          <group key={`${side}${z}`}>
            <Arch x={side * 9.21} y={6.5} z={z} ry={(side * Math.PI) / 2} w={1.5} h={3.2} />
            <Box size={[0.3, 12.4, 0.7]} pos={[side * 9.25, 6.5, z + 3.5]} color={C.trim} />
          </group>
        )),
      )}
    </group>
  );
}

/** Ala amarela mais baixa ao lado da igreja, com pilastras brancas. */
function Wing({ x0, x1, height }: { x0: number; x1: number; height: number }) {
  const w = Math.abs(x1 - x0);
  const left = Math.min(x0, x1);
  const bays = Math.max(1, Math.round(w / 3.2));
  return (
    <group>
      <Box size={[w, height, 12]} pos={[left + w / 2, height / 2, -6.5]} color={C.wall} />
      <Box size={[w + 0.3, 0.5, 12.3]} pos={[left + w / 2, height, -6.5]} color={C.trim} />
      {Array.from({ length: bays + 1 }, (_, i) => (
        <Box key={i} size={[0.35, height, 0.3]} pos={[left + (i * w) / bays, height / 2, -0.4]} color={C.trim} />
      ))}
      {Array.from({ length: bays }, (_, i) => {
        const x = left + ((i + 0.5) * w) / bays;
        return (
          <group key={i}>
            <Arch x={x} y={1.5} z={-0.48} w={1.2} h={2.4} />
            <Arch x={x} y={5.6} z={-0.48} w={1.1} h={2.2} />
          </group>
        );
      })}
    </group>
  );
}

/** Escadaria larga de granito com patamar, do adro até a praça. */
function Escadaria() {
  const { rise, tread, flights, landing, adroDepth, width } = STAIRS;
  const ref = useRef<THREE.InstancedMesh>(null);

  // Degraus (e o patamar) como caixas instanciadas, do chão da praça até o piso de cada um.
  const steps = useMemo(() => {
    const list: { z: number; top: number; depth: number }[] = [];
    let z = adroDepth;
    let top = 0;
    flights.forEach((n, f) => {
      for (let i = 0; i < n; i++) {
        top -= rise;
        list.push({ z: z + tread / 2, top, depth: tread });
        z += tread;
      }
      if (f === 0) {
        list.push({ z: z + landing / 2, top, depth: landing });
        z += landing;
      }
    });
    return list;
  }, [adroDepth, flights, landing, rise, tread]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    steps.forEach((s, i) => {
      const h = Math.max(ADRO_HEIGHT + s.top, 0.01);
      m.compose(new THREE.Vector3(0, -ADRO_HEIGHT + h / 2, s.z), new THREE.Quaternion(), new THREE.Vector3(width, h, s.depth));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [steps, width]);

  const run = CATEDRAL_STAIRS_DEPTH - adroDepth;
  const firstFlightTop = -flights[0] * rise;
  return (
    <group>
      {/* adro: plataforma diante da igreja (e por baixo dela) */}
      <Box size={[64, ADRO_HEIGHT, 66]} pos={[0, -ADRO_HEIGHT / 2, adroDepth - 33]} color={C.graniteDark} />
      <instancedMesh ref={ref} args={[undefined, undefined, steps.length]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={C.granite} roughness={0.9} />
      </instancedMesh>
      {/* muretas laterais rebocadas de amarelo */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[1.2, ADRO_HEIGHT, run]} pos={[s * (width / 2 + 0.6), -ADRO_HEIGHT / 2, adroDepth + run / 2]} color={C.wall} />
          <Box size={[1.4, 0.25, run]} pos={[s * (width / 2 + 0.6), 0.12, adroDepth + run / 2]} color={C.trim} />
        </group>
      ))}
      {/* postes no patamar */}
      {[-12, 12].map((x) => (
        <group key={x} position={[x, firstFlightTop, adroDepth + flights[0] * tread + landing / 2]}>
          <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.07, 0.1, 4, 8]} />
            <meshStandardMaterial color="#1e2a24" metalness={0.5} />
          </mesh>
          <mesh position={[0, 4.15, 0]}>
            <sphereGeometry args={[0.28, 12, 8]} />
            <meshStandardMaterial color="#fff6dc" emissive="#ffe7a8" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Catedral({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Escadaria />
      <Nave />
      <Center />
      <Tower x={-7.25} />
      <Tower x={7.25} />
      <Wing x0={9.55} x1={24} height={10} />
      <Wing x0={-9.55} x1={-14} height={9} />
    </group>
  );
}
