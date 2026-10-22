import { useMemo } from 'react';
import { useKibitz } from '../../game/kibitz';
import { seatAt } from '../../game/seats';
import { useTable } from '../../store/table';
import { AVATAR_LOOKS, lookForAvatar, PERU_LOOKS } from './looks';
import { Pessoa, type Gesto } from './Pessoa';

/**
 * Gente em volta da mesa (em metros, centro da mesa na origem, chão em y = 0):
 * os outros três jogadores sentados nos banquinhos e os perus em pé olhando.
 */

/** Onde senta cada jogador, pela posição relativa a mim: 1 direita, 2 parceiro (em frente), 3 esquerda. */
const SEATED: Record<1 | 2 | 3, { pos: [number, number, number]; yaw: number }> = {
  1: { pos: [0.6, 0, 0], yaw: -Math.PI / 2 },
  2: { pos: [0, 0, -0.6], yaw: 0 },
  3: { pos: [-0.6, 0, 0], yaw: Math.PI / 2 },
};

/** Perus: atrás do parceiro e nas quinas do fundo, de olho na mesa. */
const SPOTS: [number, number][] = [
  [-0.62, -1.0],
  [0.7, -0.98],
  [1.22, -0.72],
  [-1.24, -0.7],
  [0.05, -1.42],
];

export function Jogadores() {
  const view = useTable((s) => s.view);
  const seats = useTable((s) => s.seats);
  const speaking = useTable((s) => s.speaking);
  const lastMove = useTable((s) => s.lastMove);
  if (!view) return null;
  return (
    <>
      {([1, 2, 3] as const).map((rel) => {
        const seat = seatAt(view.seat, rel);
        const info = seats[seat];
        const spot = SEATED[rel];
        const gesto: Gesto =
          lastMove && lastMove.move.type === 'play' && lastMove.move.seat === seat ? { kind: 'jogar', key: lastMove.key } : null;
        return (
          <Pessoa
            key={`${rel}-${info?.avatarId ?? 'vazio'}`}
            look={lookForAvatar(info?.avatarId ?? 'veterano')}
            postura="sentado"
            position={spot.pos}
            yaw={spot.yaw}
            talking={speaking.includes(seat)}
            gesto={gesto}
            phase={rel * 0.29}
          />
        );
      })}
    </>
  );
}

export function Perus({ count, shadows = true }: { count: number; shadows?: boolean }) {
  const lines = useKibitz((s) => s.lines);
  const result = useTable((s) => s.view?.result);
  // Lá-e-ló e cruzada fazem a roda comemorar.
  const party = useMemo<Gesto>(
    () => (result?.type === 'batida' && (result.kind === 'laelo' || result.kind === 'cruzada') ? { kind: 'comemorar', key: Date.now() } : null),
    [result],
  );
  return (
    <>
      {PERU_LOOKS.slice(0, count).map((look, i) => {
        const [x, z] = SPOTS[i]!;
        return (
          <Pessoa
            key={i}
            look={look}
            postura="empe"
            position={[x, 0, z]}
            yaw={Math.atan2(-x, -z)}
            talking={lines.some((l) => l.peru === i)}
            gesto={party}
            anchorId={i}
            phase={i * 0.37}
            shadow={shadows}
          />
        );
      })}
    </>
  );
}

/** Só em dev (?cena=desfile): os 12 personagens lado a lado, pra conferir os figurinos. */
export function Desfile() {
  const ids = Object.keys(AVATAR_LOOKS);
  return (
    <>
      {ids.map((id, i) => (
        <Pessoa
          key={id}
          look={{ ...AVATAR_LOOKS[id]!, armPose: 'soltos' }}
          postura="empe"
          position={[(i - (ids.length - 1) / 2) * 0.72, 0, -1.6]}
          yaw={0}
          phase={i * 0.13}
        />
      ))}
    </>
  );
}
