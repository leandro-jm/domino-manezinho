import { useEffect } from 'react';
import type * as THREE from 'three';

type Disposable = { dispose: () => void };

const isDisposable = (v: unknown): v is Disposable => typeof (v as Disposable | null)?.dispose === 'function';

/**
 * Libera da GPU o que um componente criou em `useMemo` quando ele sai de cena ou o memo é recriado.
 * O R3F só descarta sozinho o que declara em JSX; objeto passado por prop fica para trás.
 * `ownMaps`: também descarta as texturas (`map`) dos materiais — só quando não vêm de cache compartilhado.
 */
export const useDisposeOnChange = (value: unknown, ownMaps = false): void => {
  useEffect(
    () => () => {
      const seen = new Set<Disposable>();
      const walk = (v: unknown) => {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) return v.forEach(walk);
        if (isDisposable(v)) {
          seen.add(v);
          const map = (v as Partial<THREE.MeshStandardMaterial>).map;
          if (ownMaps && map) seen.add(map);
          return;
        }
        Object.values(v).forEach(walk);
      };
      walk(value);
      seen.forEach((d) => d.dispose());
    },
    [value, ownMaps],
  );
};

/** Geometrias e materiais de cenas carregadas (GLB em cache): quem clona reaproveita, então não descartar. */
export const resourcesOf = (...roots: THREE.Object3D[]): Set<unknown> => {
  const out = new Set<unknown>();
  for (const r of roots) {
    r.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) out.add(mesh.geometry);
      for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) out.add(m);
    });
  }
  return out;
};
