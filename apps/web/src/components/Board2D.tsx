import type { Side } from '@domino/engine';
import type { BoardLayout } from '../game/layout';
import { BOARD_HALF_WIDTH, TILE_L, TILE_W } from '../game/layout';
import { TEAM_ASPECT, TEAM_SPOTS, teamCanvas } from '../game/teams';
import { PIP_LAYOUT } from './TileFace';

const deg = (dx: number, dz: number) => (Math.atan2(dz, dx) * 180) / Math.PI;

const Pips = ({ value, cx }: { value: number; cx: number }) => (
  <>
    {PIP_LAYOUT[value]!.map(([x, y], i) => (
      <circle key={i} cx={cx + x * 0.12} cy={y * 0.12} r={0.045} className="b2-pip" />
    ))}
  </>
);

/** Metade do tampo da mesa em volta das pedras (unidades de pedra). */
const TABLE = BOARD_HALF_WIDTH + 1.4;

/** Mesa vista de cima em SVG — para aparelhos sem WebGL ou quem escolhe "Mesa 2D". */
export function Board2D({
  layout,
  pickableSides,
  onPickSide,
  lastPlayedId,
}: {
  layout: BoardLayout;
  pickableSides: Side[];
  onPickSide: (side: Side) => void;
  lastPlayedId: number | null;
}) {
  const b = layout.bounds;
  // O tampo cresce o quanto a cobrinha precisar, em largura e em altura.
  const hx = Math.max(TABLE, b.maxX + 0.8, -b.minX + 0.8);
  const hz = Math.max(TABLE * 0.62, b.maxZ + 0.8, -b.minZ + 0.8);
  const ends = layout.tiles.length ? layout.ends.filter((e) => pickableSides.includes(e.side)) : pickableSides.length ? layout.ends : [];
  const pad = 0.6;

  return (
    <svg
      className="board-2d"
      viewBox={`${-hx - pad} ${-hz - pad} ${(hx + pad) * 2} ${(hz + pad) * 2}`}
      // Grupo, não imagem: as pontas de jogar são botões aqui dentro (e imagem não pode ter botão).
      role="group"
      aria-label="Mesa de dominó vista de cima"
    >
      <defs>
        <pattern id="b2-granito" width="0.6" height="0.6" patternUnits="userSpaceOnUse">
          <rect width="0.6" height="0.6" fill="#8c8e8b" />
          <circle cx="0.1" cy="0.15" r="0.025" fill="#a3a5a1" />
          <circle cx="0.42" cy="0.08" r="0.02" fill="#767874" />
          <circle cx="0.3" cy="0.4" r="0.03" fill="#a9aaa6" />
          <circle cx="0.52" cy="0.5" r="0.018" fill="#6f716d" />
          <circle cx="0.12" cy="0.5" r="0.02" fill="#9a9c98" />
        </pattern>
      </defs>
      {/* tampo de granilite com a faixa branca, como as mesas da Praça XV */}
      <rect x={-hx + 0.08} y={-hz + 0.14} width={hx * 2} height={hz * 2} rx={0.25} className="b2-shade" />
      <rect x={-hx} y={-hz} width={hx * 2} height={hz * 2} rx={0.25} fill="url(#b2-granito)" />
      <rect
        x={-hx + 0.35}
        y={-hz + 0.35}
        width={hx * 2 - 0.7}
        height={hz * 2 - 0.7}
        rx={0.08}
        fill="none"
        stroke="#ecebe5"
        strokeWidth={0.12}
      />

      {/* emblemas do Avaí e do Figueirense pintados nos cantos do fundo */}
      {TEAM_SPOTS.map((spot) => {
        const w = 1.2;
        const cx = spot.x * (hx - 1.05);
        const cz = spot.z * (hz - 1.2);
        return (
          <image
            key={spot.team}
            href={teamCanvas(spot.team).toDataURL()}
            x={cx - w / 2}
            y={cz - (w * TEAM_ASPECT) / 2}
            width={w}
            height={w * TEAM_ASPECT}
            opacity={0.88}
            transform={`rotate(${(spot.rot * 180) / Math.PI} ${cx} ${cz})`}
            aria-hidden="true"
          />
        );
      })}

      {layout.tiles.map((t) => (
        // Sombra desenhada (retângulo escuro deslocado): filtro de SVG some no Safari com essas unidades pequenas.
        <g key={t.key} transform={`translate(${t.x} ${t.z}) rotate(${deg(t.dx, t.dz)})`}>
          <rect x={-TILE_L / 2 + 0.03} y={-TILE_W / 2 + 0.05} width={TILE_L} height={TILE_W} rx={0.07} className="b2-shade" />
          <rect
            x={-TILE_L / 2}
            y={-TILE_W / 2}
            width={TILE_L}
            height={TILE_W}
            rx={0.07}
            className={`b2-tile ${t.key === lastPlayedId ? 'is-last' : ''}`}
          />
          <line x1={0} y1={-0.19} x2={0} y2={0.19} className="b2-line" />
          <Pips value={t.back} cx={-0.25} />
          <Pips value={t.front} cx={0.25} />
        </g>
      ))}

      {ends.map((e) => (
        <g
          key={e.side}
          className="b2-end"
          onClick={() => onPickSide(e.side)}
          role="button"
          tabIndex={0}
          aria-label={e.value >= 0 ? `Jogar na ponta ${e.value}` : 'Sair aqui'}
          onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onPickSide(e.side)}
        >
          <g transform={`translate(${e.x} ${e.z}) rotate(${deg(e.dx, e.dz)})`}>
            <rect x={-TILE_L / 2} y={-TILE_W / 2} width={TILE_L} height={TILE_W} rx={0.07} />
          </g>
          <text x={e.x} y={e.z - 0.45} textAnchor="middle" className="b2-end-label">
            {e.value >= 0 ? `ponta ${e.value}` : 'sai aqui'}
          </text>
        </g>
      ))}
    </svg>
  );
}
