import { Environment, OrbitControls, PerformanceMonitor, Sky } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import type * as THREE from 'three';
import type { PlayerView, Side, Tile } from '@domino/engine';
import type { BoardLayout, EndSlot } from '../game/layout';
import { TILE_L, TILE_W } from '../game/layout';
import { seatAt } from '../game/seats';
import { Domino, TILE_H, yawFor } from './Domino';
import { labelTexture } from './textures';
import { BubbleProjector } from './anchors';
import { Desfile, Jogadores, Perus } from './gente/Gente';
import { preloadGente } from './gente/Pessoa';

preloadGente();
import { SceneBoundary } from '../components/SceneBoundary';
import { reportError } from '../lib/report';
import { Praca } from './Praca';
import { PLAY_HALF, TABLE_HEIGHT, Table } from './Table';

type Quality = 'baixa' | 'media' | 'alta';
const PANORAMA = import.meta.env.VITE_PANORAMA_URL as string | undefined;
const METER = 22;

/** Direção de quem está sentado para o centro da mesa. */
const SEAT_DIR: Record<1 | 2 | 3, [number, number]> = { 1: [-1, 0], 2: [0, 1], 3: [1, 0] };

type Controls = { target: THREE.Vector3; update: () => void; enabled: boolean };

/** Plano de abertura: câmera baixa mirando a Figueira e a Catedral antes de descer pra mesa. */
const INTRO_FROM = { position: new Vector3(310, 24, 90), target: new Vector3(150, 300, -2090) };
const INTRO_SECONDS = 3.4;

/** Só em dev: ?cena=pombos|catedral|praca congela a câmera num ponto, para conferir o cenário de perto. */
const PREVIEWS: Record<string, { position: Vector3; target: Vector3 }> = {
  pombos: { position: new Vector3(14, -4, -18), target: new Vector3(0, -15.5, -50) },
  catedral: { position: new Vector3(120, 40, -1000), target: new Vector3(176, 330, -2090) },
  praca: INTRO_FROM,
  perus: { position: new Vector3(0, 12, 34), target: new Vector3(0, 8, -20) },
  desfile: { position: new Vector3(0, 6, 110), target: new Vector3(0, 6, -35) },
  'desfile-a': { position: new Vector3(-47, 10, 22), target: new Vector3(-47, 8, -35) },
  'desfile-b': { position: new Vector3(47, 10, 22), target: new Vector3(47, 8, -35) },
};
const DESFILE =
  import.meta.env.DEV && (new URLSearchParams(location.search).get('cena') ?? sessionStorage.getItem('dm:cena') ?? '').startsWith('desfile');
const PREVIEW = import.meta.env.DEV ? (PREVIEWS[new URLSearchParams(location.search).get('cena') ?? sessionStorage.getItem('dm:cena') ?? ''] ?? null) : null;

type Pose = { position: Vector3; target: Vector3 };

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Câmera: plano de abertura na entrada e voos suaves entre enquadramentos
 * (mesa, vista de cima, olhar a roda). Durante o voo o arrastar fica desligado.
 */
function CameraRig({ topView, lookAround }: { topView: boolean; lookAround: boolean }) {
  const { camera, size, controls } = useThree();
  const flight = useRef<{ from: Pose; to: Pose; t: number; seconds: number } | null>(null);
  const started = useRef(false);

  const goal = useMemo<Pose>(() => {
    if (PREVIEW) return PREVIEW;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    if (lookAround) {
      // Olhar a roda: de pé atrás da cadeira, mirando a altura do rosto de quem está em volta.
      return aspect < 0.8
        ? { position: new Vector3(0, 26, 110), target: new Vector3(0, 14, -24) }
        : { position: new Vector3(0, 16, 34), target: new Vector3(0, 10, -22) };
    }
    const tanHalf = Math.tan(((cam.fov / 2) * Math.PI) / 180);
    const needW = (PLAY_HALF + 2.2) / (tanHalf * aspect);
    const needH = (PLAY_HALF + 1.5) / tanHalf;
    const dist = Math.max(needW, needH) * (topView ? 1 : aspect < 0.8 ? 1.0 : 0.95);
    // Em paisagem a câmera fica mais baixa, como quem está sentado.
    const elevation = topView ? 1.55 : aspect < 0.8 ? 1.1 : 0.68;
    const target = new Vector3(0, 0, topView ? 0 : aspect < 0.8 ? 1.2 : 0.4);
    return { position: new Vector3(0, Math.sin(elevation) * dist, target.z + Math.cos(elevation) * dist), target };
  }, [camera, size, topView, lookAround]);

  const place = (pose: Pose) => {
    camera.position.copy(pose.position);
    const ctl = controls as unknown as Controls | null;
    if (ctl) {
      ctl.target.copy(pose.target);
      ctl.update();
    } else camera.lookAt(pose.target);
  };

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.5;
    cam.far = 9000;
    cam.updateProjectionMatrix();
    const ctl = controls as unknown as Controls | null;
    if (!started.current) {
      // Primeira vez: plano de abertura saindo da praça (se o movimento não incomodar).
      started.current = true;
      if (!PREVIEW && !REDUCED_MOTION) {
        flight.current = { from: INTRO_FROM, to: goal, t: 0, seconds: INTRO_SECONDS };
        place(INTRO_FROM);
        return;
      }
    }
    if (REDUCED_MOTION || PREVIEW) {
      place(goal);
      return;
    }
    const from = { position: camera.position.clone(), target: ctl ? ctl.target.clone() : goal.target.clone() };
    flight.current = { from, to: goal, t: 0, seconds: 0.9 };
  }, [camera, controls, goal]);

  useFrame((_, dt) => {
    const f = flight.current;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / f.seconds);
    const k = easeInOut(f.t);
    camera.position.lerpVectors(f.from.position, f.to.position, k);
    const target = new Vector3().lerpVectors(f.from.target, f.to.target, k);
    const ctl = controls as unknown as Controls | null;
    if (ctl) {
      ctl.enabled = f.t >= 1;
      ctl.target.copy(target);
      ctl.update();
    } else camera.lookAt(target);
    if (f.t >= 1) flight.current = null;
  });
  return null;
}

function EndMarker({ end, onPick }: { end: EndSlot; onPick: (side: Side) => void }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.opacity = 0.35 + Math.sin(clock.elapsedTime * 5) * 0.2;
  });
  // Clicar tira o marcador de baixo do ponteiro sem disparar onPointerOut: devolve o cursor ao sumir.
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  return (
    <group position={[end.x, TILE_H / 2, end.z]} rotation={[0, yawFor(end.dx, end.dz), 0]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onPick(end.side);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[TILE_L, TILE_H, TILE_W]} />
        <meshStandardMaterial ref={ref} color="#ffcf4a" emissive="#ffb000" emissiveIntensity={0.6} transparent opacity={0.5} />
      </mesh>
      <sprite position={[0, 0.9, 0]} scale={[1.6, 0.5, 1]}>
        <spriteMaterial map={labelTexture(end.value >= 0 ? `ponta ${end.value}` : 'sai aqui')} depthTest={false} transparent />
      </sprite>
    </group>
  );
}

/** Pedras dos outros: em pé de costas pra gente; no fim da mão, deitadas e reveladas. */
function Rack({ rel, count, revealed, shadows }: { rel: 1 | 2 | 3; count: number; revealed: Tile[] | null; shadows: boolean }) {
  const [dx, dz] = SEAT_DIR[rel];
  const dist = PLAY_HALF - 0.8;
  const cx = -dx * dist;
  const cz = -dz * dist;
  // eixo ao longo da borda da mesa
  const ax = -dz;
  const az = dx;
  const n = revealed ? revealed.length : count;
  const spacing = revealed ? TILE_W + 0.12 : TILE_W + 0.08;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const off = (i - (n - 1) / 2) * spacing;
        const x = cx + ax * off;
        const z = cz + az * off;
        if (revealed) {
          const t = revealed[i]!;
          return <Domino key={t.id} back={t.a} front={t.b} position={[x, TILE_H / 2, z]} rotation={[0, yawFor(dx, dz), 0]} shadows={shadows} />;
        }
        // em pé, com a face virada para o dono
        return (
          <group key={i} position={[x, TILE_L / 2, z]} rotation={[0, Math.atan2(-dx, -dz), 0]}>
            <Domino back={0} front={0} hidden position={[0, 0, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]} rotationOrder="ZYX" shadows={shadows} />
          </group>
        );
      })}
    </group>
  );
}

export interface SceneProps {
  view: PlayerView;
  layout: BoardLayout;
  pickableSides: Side[];
  onPickSide: (side: Side) => void;
  lastPlayedId: number | null;
  quality: Quality;
  highContrast: boolean;
  topView: boolean;
  /** Quantos perus em pé em volta da mesa. */
  perus: number;
  /** Câmera levantada para ver quem está em volta. */
  lookAround: boolean;
  /** O navegador derrubou o WebGL (memória de vídeo, driver, contextos demais). */
  onContextLost?: () => void;
}

const onPeopleError = (err: unknown) => {
  console.warn('[mesa 3D] bonecos não carregaram; a mesa segue sem eles', err);
  reportError('models', err);
};

/** Com frameloop "demand", pede um quadro a cada 1/fps s: a animação segue fluida (usa o tempo real), só desenha menos. */
function FrameCap({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const t = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(t);
  }, [fps, invalidate]);
  return null;
}

export function Scene({ view, layout, pickableSides, onPickSide, lastPlayedId, quality, highContrast, topView, perus, lookAround, onContextLost }: SceneProps) {
  const lostRef = useRef(onContextLost);
  lostRef.current = onContextLost;
  const shadows = quality !== 'baixa';
  const smoothness = quality === 'baixa' ? 1 : 3;
  // Memória de vídeo: em tela Retina grande, resolução dobrada + MSAA passa fácil de 200 MB e alguns
  // navegadores derrubam o WebGL. Limita a ~4 Mpx e só usa MSAA quando a tela não é Retina.
  const maxDpr = quality === 'baixa' ? 1 : quality === 'media' ? 1.5 : 2;
  const screenPx = window.innerWidth * window.innerHeight;
  const dprCap = Math.max(1, Math.min(maxDpr, window.devicePixelRatio || 1, Math.sqrt(4_100_000 / Math.max(1, screenPx))));
  // Resolução adaptativa: se os quadros começam a atrasar, baixa um pouco; sobrando fôlego, volta.
  const [dprNow, setDprNow] = useState(dprCap);
  const antialias = quality !== 'baixa' && dprCap < 1.5;
  const ends = useMemo(
    () => (layout.tiles.length ? layout.ends.filter((e) => pickableSides.includes(e.side)) : pickableSides.length ? layout.ends : []),
    [layout, pickableSides],
  );

  return (
    <Canvas
      shadows={shadows}
      dpr={Math.min(dprNow, dprCap)}
      // Baixa: no máximo 30 quadros por segundo (metade do trabalho da GPU num celular simples, mesma animação).
      frameloop={quality === 'baixa' ? 'demand' : 'always'}
      camera={{ fov: 42, position: [0, 18, 14] }}
      gl={{ antialias, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          console.warn('[mesa 3D] contexto WebGL perdido');
          reportError('webgl-lost', new Error(`contexto WebGL perdido (qualidade ${quality})`));
          lostRef.current?.();
        });
      }}
    >
      {quality === 'baixa' && <FrameCap fps={30} />}
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDprNow((d) => Math.max(1, d - 0.25))}
        onIncline={() => setDprNow((d) => Math.min(dprCap, d + 0.25))}
        onFallback={() => setDprNow(1)}
      />
      <CameraRig topView={topView} lookAround={lookAround} />
      {!PREVIEW && <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minPolarAngle={0.05}
        maxPolarAngle={1.42}
        minAzimuthAngle={-0.6}
        maxAzimuthAngle={0.6}
        minDistance={10}
        maxDistance={lookAround ? 200 : 60}
      />}
      <hemisphereLight args={['#e3edf7', '#6b5f4b', 0.9]} />
      <directionalLight
        castShadow={shadows}
        position={[-12, 24, 20]}
        intensity={2.3}
        color="#ffe3bd"
        shadow-mapSize={[quality === 'alta' ? 2048 : 1024, quality === 'alta' ? 2048 : 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
      />
      <fog attach="fog" args={['#dfe5e6', 900, 7000]} />
      {PANORAMA ? (
        <Suspense fallback={null}>
          <Environment files={PANORAMA} background />
        </Suspense>
      ) : (
        <Sky distance={450000} sunPosition={[-1, 0.32, 0.55]} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} />
      )}

      <Table shadows={shadows} leaves={quality !== 'baixa'} />
      <group position={[0, -TABLE_HEIGHT, 0]} scale={METER}>
        <Praca quality={quality} />
        {/* Modelo dos bonecos que não baixou (primeira vez sem rede) tira só a gente da mesa, não o 3D todo. */}
        <SceneBoundary onError={onPeopleError}>
          <Suspense fallback={null}>
            {DESFILE ? (
              <Desfile />
            ) : (
              <>
                <Jogadores />
                <Perus count={perus} shadows={quality === 'alta'} />
              </>
            )}
          </Suspense>
        </SceneBoundary>
      </group>
      <BubbleProjector />

      {layout.tiles.map((t) => (
        <Domino
          key={t.key}
          back={t.back}
          front={t.front}
          position={[t.x, TILE_H / 2, t.z]}
          rotation={[0, yawFor(t.dx, t.dz), 0]}
          drop={t.key === lastPlayedId}
          glow={t.key === lastPlayedId}
          highContrast={highContrast}
          smoothness={smoothness}
          shadows={shadows}
        />
      ))}
      {ends.map((e) => (
        <EndMarker key={e.side} end={e} onPick={onPickSide} />
      ))}

      {([1, 2, 3] as const).map((rel) => {
        const seat = seatAt(view.seat, rel);
        return <Rack key={rel} rel={rel} count={view.handCounts[seat]} revealed={view.revealedHands?.[seat] ?? null} shadows={shadows} />;
      })}
    </Canvas>
  );
}
