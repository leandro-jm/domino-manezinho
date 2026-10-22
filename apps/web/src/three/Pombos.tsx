import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useDisposeOnChange } from './dispose';

/**
 * Pombo-comum (Columba livia), em metros: ~32 cm do bico à cauda.
 * Eixo +x é a frente do bicho. Andam com o balanço de cabeça típico (a cabeça "trava" no ar
 * enquanto o corpo passa, depois dá o tranco à frente), ciscam e olham em volta.
 */

const PLUMAGE = '#7f8898';
const WING = '#98a0ac';
const DARK = '#2b2d33';

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Sombra de contato macia (a sombra do sol não alcança tão longe da mesa). */
const blobTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

interface PigeonParts {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: [THREE.Group, THREE.Group];
}

interface PigeonState {
  x: number;
  z: number;
  heading: number;
  targetX: number;
  targetZ: number;
  mode: 'walk' | 'peck' | 'look';
  until: number;
  phase: number;
  look: number;
}

function Pigeon({ tint, partsRef, fancy }: { tint: THREE.Color; partsRef: (p: PigeonParts | null) => void; fancy: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);

  const mats = useMemo(() => {
    const plumage = new THREE.MeshStandardMaterial({ color: new THREE.Color(PLUMAGE).lerp(tint, 0.35), roughness: 0.85 });
    return {
      plumage,
      wing: new THREE.MeshStandardMaterial({ color: new THREE.Color(WING).lerp(tint, 0.3), roughness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.9 }),
      bar: new THREE.MeshStandardMaterial({ color: '#363940', roughness: 0.9 }),
      primaries: new THREE.MeshStandardMaterial({ color: new THREE.Color('#5d626c').lerp(tint, 0.2), roughness: 0.85 }),
      // Pescoço furta-cor: verde e roxo conforme o ângulo da luz.
      // Pescoço furta-cor (verde/roxo): material físico só na qualidade alta, que é caro pra GPU.
      neck: fancy ? new THREE.MeshPhysicalMaterial({
        color: '#4f6360',
        roughness: 0.45,
        iridescence: 1,
        iridescenceIOR: 1.6,
        iridescenceThicknessRange: [250, 650],
        sheen: 0.6,
        sheenColor: new THREE.Color('#8b5fa8'),
      }) : new THREE.MeshStandardMaterial({ color: '#4f6360', roughness: 0.45 }),
      beak: new THREE.MeshStandardMaterial({ color: '#3a3436', roughness: 0.5 }),
      cere: new THREE.MeshStandardMaterial({ color: '#ebe6df', roughness: 0.9 }),
      eye: new THREE.MeshStandardMaterial({ color: '#e0791f', roughness: 0.3 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.2 }),
      leg: new THREE.MeshStandardMaterial({ color: '#c8605f', roughness: 0.7 }),
    };
  }, [tint, fancy]);

  const sphere = useMemo(() => new THREE.SphereGeometry(1, 18, 14), []);
  useDisposeOnChange(mats);
  useDisposeOnChange(sphere);

  // Leque fino da cauda: alarga para trás; a faixa escura fica nos últimos 2 cm.
  const tail = useMemo(() => {
    const fan = (x0: number, x1: number, w0: number, w1: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(x0, -w0);
      sh.lineTo(x1, -w1);
      sh.quadraticCurveTo(x1 - 0.008, 0, x1, w1);
      sh.lineTo(x0, w0);
      sh.lineTo(x0, -w0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.003, 0);
      return g;
    };
    return { base: fan(0.02, -0.085, 0.02, 0.031), band: fan(-0.084, -0.106, 0.031, 0.034) };
  }, []);
  useDisposeOnChange(tail);

  const setRefs = () => {
    if (root.current && body.current && head.current && legL.current && legR.current) {
      partsRef({ root: root.current, body: body.current, head: head.current, legs: [legL.current, legR.current] });
    }
  };

  const Leg = ({ z, refObj }: { z: number; refObj: React.RefObject<THREE.Group | null> }) => (
    <group ref={refObj} position={[0.005, 0.055, z]}>
      <mesh position={[0, -0.027, 0]} material={mats.leg}>
        <cylinderGeometry args={[0.0045, 0.004, 0.055, 6]} />
      </mesh>
      {[-0.5, 0, 0.5].map((a) => (
        <mesh key={a} position={[0.012 * Math.cos(a), -0.054, 0.012 * Math.sin(a)]} rotation={[0, -a, 0]} material={mats.leg}>
          <boxGeometry args={[0.024, 0.003, 0.004]} />
        </mesh>
      ))}
    </group>
  );

  return (
    <group ref={(g) => ((root.current = g), setRefs())}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.01, 0.002, 0]}>
        <planeGeometry args={[0.36, 0.2]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} />
      </mesh>

      <group ref={(g) => ((body.current = g), setRefs())}>
        {/* corpo em gota, levemente empinado */}
        <mesh geometry={sphere} material={mats.plumage} position={[0, 0.115, 0]} rotation={[0, 0, 0.22]} scale={[0.125, 0.074, 0.068]} castShadow={fancy} />
        {/* peito estufado */}
        <mesh geometry={sphere} material={mats.plumage} position={[0.065, 0.12, 0]} scale={[0.07, 0.07, 0.064]} castShadow={fancy} />
        {/* asas dobradas com as duas faixas pretas */}
        {[1, -1].map((s) => (
          <group key={s} position={[-0.015, 0.128, s * 0.052]} rotation={[s * 0.12, 0, -0.12]}>
            <mesh geometry={sphere} material={mats.wing} scale={[0.115, 0.048, 0.022]} castShadow={fancy} />
            <mesh geometry={sphere} material={mats.bar} position={[0.004, -0.004, s * 0.0045]} scale={[0.007, 0.032, 0.0185]} />
            <mesh geometry={sphere} material={mats.bar} position={[-0.028, -0.006, s * 0.0045]} scale={[0.007, 0.03, 0.0185]} />
            {/* rêmiges mais escuras nas pontas */}
            <mesh geometry={sphere} material={mats.primaries} position={[-0.088, -0.004, 0]} scale={[0.04, 0.026, 0.0205]} />
          </group>
        ))}
        {/* cauda em leque, com a faixa escura na ponta */}
        <group position={[-0.1, 0.1, 0]} rotation={[0, 0, 0.2]}>
          <mesh geometry={tail.base} material={mats.plumage} castShadow={fancy} />
          <mesh geometry={tail.band} material={mats.dark} />
        </group>
      </group>

      {/* pescoço + cabeça: é o que balança */}
      <group ref={(g) => ((head.current = g), setRefs())} position={[0.085, 0.15, 0]}>
        <mesh geometry={sphere} material={mats.neck} position={[0.012, 0.022, 0]} rotation={[0, 0, -0.5]} scale={[0.04, 0.06, 0.042]} castShadow={fancy} />
        <group position={[0.035, 0.07, 0]}>
          <mesh geometry={sphere} material={mats.plumage} scale={[0.034, 0.03, 0.029]} castShadow={fancy} />
          <mesh material={mats.cere} position={[0.03, 0.002, 0]} scale={[0.009, 0.007, 0.008]} geometry={sphere} />
          <mesh material={mats.beak} position={[0.046, -0.003, 0]} rotation={[0, 0, -Math.PI / 2 - 0.15]}>
            <coneGeometry args={[0.0065, 0.024, 8]} />
          </mesh>
          {[1, -1].map((s) => (
            <group key={s} position={[0.012, 0.008, s * 0.024]}>
              <mesh geometry={sphere} material={mats.eye} scale={0.0068} />
              <mesh geometry={sphere} material={mats.pupil} position={[0.001, 0, s * 0.0035]} scale={0.0037} />
            </group>
          ))}
        </group>
      </group>

      <Leg z={0.02} refObj={legL} />
      <Leg z={-0.02} refObj={legR} />
    </group>
  );
}

/** Bando de pombos andando pela calçada atrás da mesa, sem invadir a mesa nem o tronco da figueira. */
export function Pombos({ count, area, fancy = false }: { count: number; area: { minX: number; maxX: number; minZ: number; maxZ: number }; fancy?: boolean }) {
  const parts = useRef<(PigeonParts | null)[]>([]);
  const birds = useMemo(() => {
    const r = rand(1234);
    const tints = ['#7f8898', '#6f7686', '#8a8f9b', '#5f5a5c', '#9aa0aa', '#7a7f90'];
    return Array.from({ length: count }, (_, i) => ({
      tint: new THREE.Color(tints[i % tints.length]!),
      state: {
        x: area.minX + r() * (area.maxX - area.minX),
        z: area.minZ + r() * (area.maxZ - area.minZ),
        heading: r() * Math.PI * 2,
        targetX: 0,
        targetZ: 0,
        mode: 'peck',
        until: r() * 3,
        phase: r(),
        look: 0,
      } as PigeonState,
      rng: rand(99 + i * 31),
    }));
  }, [count, area]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    birds.forEach((bird, i) => {
      const p = parts.current[i];
      if (!p) return;
      const s = bird.state;
      const r = bird.rng;

      if (t > s.until) {
        // Escolhe a próxima ação: andar até um ponto, ciscar ou olhar em volta.
        const roll = r();
        if (roll < 0.5) {
          s.mode = 'walk';
          s.targetX = Math.min(area.maxX, Math.max(area.minX, s.x + (r() - 0.5) * 1.6));
          s.targetZ = Math.min(area.maxZ, Math.max(area.minZ, s.z + (r() - 0.5) * 1.2));
          s.until = t + 6;
        } else if (roll < 0.82) {
          s.mode = 'peck';
          s.until = t + 1 + r() * 2.5;
        } else {
          s.mode = 'look';
          s.look = (r() - 0.5) * 1.6;
          s.until = t + 0.8 + r() * 1.5;
        }
      }

      let speed = 0;
      if (s.mode === 'walk') {
        const dx = s.targetX - s.x;
        const dz = s.targetZ - s.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.03) s.until = t;
        else {
          const want = Math.atan2(-dz, dx);
          let diff = want - s.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          s.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 4);
          speed = Math.abs(diff) < 0.6 ? 0.28 : 0.06;
          s.x += Math.cos(s.heading) * speed * dt;
          s.z -= Math.sin(s.heading) * speed * dt;
        }
      }

      p.root.position.set(s.x, 0, s.z);
      p.root.rotation.y = s.heading;

      // Passos: ~4 por segundo andando.
      s.phase = (s.phase + dt * (speed > 0.1 ? 4.2 : speed > 0 ? 1.5 : 0)) % 1;
      const step = Math.sin(s.phase * Math.PI * 2);
      p.legs[0].rotation.z = step * 0.45 * Math.min(1, speed * 5);
      p.legs[1].rotation.z = -step * 0.45 * Math.min(1, speed * 5);
      p.body.position.y = Math.abs(step) * 0.004 * Math.min(1, speed * 5);
      p.body.rotation.x = step * 0.04 * Math.min(1, speed * 5);

      // Balanço de cabeça: segura parada no mundo (recua em relação ao corpo) e depois dá o tranco.
      const hold = 0.7;
      const amp = (speed * (1 / 4.2) * hold) / 2;
      const bob = s.phase < hold ? amp - (s.phase / hold) * 2 * amp : -amp + ((s.phase - hold) / (1 - hold)) * 2 * amp;
      let headX = 0.085 + bob;
      let headY = 0.15;
      let pitch = 0;
      let yaw = 0;
      if (s.mode === 'peck') {
        const k = Math.max(0, Math.sin(t * 9 + i)) ** 3;
        // gira o pescoço a partir da base: a cabeça desce até o chão
        headX += 0.012 * k;
        headY -= 0.025 * k;
        pitch = -1.25 * k;
      } else if (s.mode === 'look') {
        yaw = s.look * Math.min(1, (s.until - t) * 2);
        pitch = 0.15;
      }
      p.head.position.set(headX, headY, 0);
      p.head.rotation.set(0, yaw, pitch);
    });
  });

  return (
    <group>
      {birds.map((b, i) => (
        <Pigeon key={i} tint={b.tint} fancy={fancy} partsRef={(p) => (parts.current[i] = p)} />
      ))}
    </group>
  );
}
