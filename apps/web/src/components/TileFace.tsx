/** Posição dos pontinhos em cada metade (grade 3x3, de -1 a 1). */
export const PIP_LAYOUT: Record<number, [number, number][]> = {
  0: [],
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const Half = ({ value, cy }: { value: number; cy: number }) => (
  <>
    {PIP_LAYOUT[value]!.map(([x, y], i) => (
      <circle key={i} cx={25 + x * 12} cy={cy + y * 12} r={4.6} className="pip" />
    ))}
  </>
);

/** Pedra em pé (vertical) em SVG: `top` em cima, `bottom` embaixo. */
export function TileFace({
  top,
  bottom,
  width = 44,
  back = false,
}: {
  top: number;
  bottom: number;
  width?: number;
  back?: boolean;
}) {
  return (
    <svg viewBox="0 0 50 100" width={width} height={width * 2} className="tile-face" aria-hidden="true">
      <rect x="1.5" y="1.5" width="47" height="97" rx="7" className={back ? 'tile-back' : 'tile-body'} />
      {!back && (
        <>
          <line x1="8" y1="50" x2="42" y2="50" className="tile-line" />
          <circle cx="25" cy="50" r="2.2" className="tile-rivet" />
          <Half value={top} cy={25} />
          <Half value={bottom} cy={75} />
        </>
      )}
    </svg>
  );
}
