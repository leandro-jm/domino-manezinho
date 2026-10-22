import type { Move, PlacedTile, Side } from '@domino/engine';

/** Medidas em unidades da mesa: pedra tem 1 de comprimento por 0,5 de largura. */
export const TILE_L = 1;
export const TILE_W = 0.5;
const GAP = 0.05;
const ROW = 1.3;
export const BOARD_HALF_WIDTH = 4.4;

/**
 * Pedra posicionada: centro (x, z), direção do eixo comprido (dx, dz) e os valores de cada
 * metade — `back` fica do lado de trás da direção, `front` do lado da frente.
 */
export interface TileSlot {
  key: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  back: number;
  front: number;
  seat: number;
}

export interface EndSlot {
  side: Side;
  value: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}

interface Arm {
  x: number;
  z: number;
  dx: number;
  rowZ: number;
  /** +1: braço direito dobra para o lado do jogador; -1: o esquerdo dobra para o lado oposto. */
  sign: 1 | -1;
}

/** Calcula onde vai a próxima pedra de um braço e devolve o braço atualizado. */
const step = (arm: Arm, double: boolean): { slot: Omit<TileSlot, 'key' | 'back' | 'front' | 'seat'>; arm: Arm } => {
  const len = double ? TILE_W : TILE_L;
  const far = arm.x + arm.dx * (GAP + len);
  if (Math.abs(far) <= BOARD_HALF_WIDTH) {
    const slot = double
      ? { x: arm.x + arm.dx * (GAP + len / 2), z: arm.rowZ, dx: 0, dz: 1 }
      : { x: arm.x + arm.dx * (GAP + len / 2), z: arm.rowZ, dx: arm.dx, dz: 0 };
    return { slot, arm: { ...arm, x: far } };
  }
  // Chegou na borda: pedra de esquina em pé, e a fileira seguinte volta no sentido contrário.
  const cx = arm.x + arm.dx * (GAP + TILE_W / 2);
  const cz = arm.rowZ + (arm.sign * ROW) / 2;
  const dx = -arm.dx;
  return {
    slot: { x: cx, z: cz, dx: 0, dz: arm.sign },
    arm: { ...arm, x: cx + dx * (TILE_W / 2), dx, rowZ: arm.rowZ + arm.sign * ROW },
  };
};

const firstPlayId = (log: readonly Move[]): number | null => {
  const first = log.find((m) => m.type === 'play');
  return first?.type === 'play' ? first.tileId : null;
};

export interface BoardLayout {
  tiles: TileSlot[];
  ends: EndSlot[];
  /** Retângulo ocupado (para enquadrar a câmera / o SVG). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const layoutBoard = (board: readonly PlacedTile[], log: readonly Move[]): BoardLayout => {
  if (!board.length) {
    return {
      tiles: [],
      ends: [{ side: 'left', value: -1, x: 0, z: 0, dx: 1, dz: 0 }],
      bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    };
  }
  const centerId = firstPlayId(log);
  const c = Math.max(0, board.findIndex((p) => p.tile.id === centerId));
  const center = board[c]!;
  const centerDouble = center.tile.a === center.tile.b;
  const half = (centerDouble ? TILE_W : TILE_L) / 2;

  const tiles: TileSlot[] = [
    centerDouble
      ? { key: center.tile.id, x: 0, z: 0, dx: 0, dz: 1, back: center.left, front: center.right, seat: center.seat }
      : { key: center.tile.id, x: 0, z: 0, dx: 1, dz: 0, back: center.left, front: center.right, seat: center.seat },
  ];

  let right: Arm = { x: half, z: 0, dx: 1, rowZ: 0, sign: 1 };
  for (const p of board.slice(c + 1)) {
    const r = step(right, p.tile.a === p.tile.b);
    right = r.arm;
    tiles.push({ ...r.slot, key: p.tile.id, back: p.left, front: p.right, seat: p.seat });
  }
  let left: Arm = { x: -half, z: 0, dx: -1, rowZ: 0, sign: -1 };
  for (const p of board.slice(0, c).reverse()) {
    const r = step(left, p.tile.a === p.tile.b);
    left = r.arm;
    tiles.push({ ...r.slot, key: p.tile.id, back: p.right, front: p.left, seat: p.seat });
  }

  const nextRight = step(right, false).slot;
  const nextLeft = step(left, false).slot;
  const ends: EndSlot[] = [
    { side: 'left', value: board[0]!.left, ...nextLeft },
    { side: 'right', value: board[board.length - 1]!.right, ...nextRight },
  ];

  const xs = tiles.map((t) => t.x);
  const zs = tiles.map((t) => t.z);
  return {
    tiles,
    ends,
    bounds: { minX: Math.min(...xs) - 1, maxX: Math.max(...xs) + 1, minZ: Math.min(...zs) - 1, maxZ: Math.max(...zs) + 1 },
  };
};
