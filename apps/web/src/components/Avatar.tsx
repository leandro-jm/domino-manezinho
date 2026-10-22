import { useState } from 'react';
import { avatarById, type Avatar as AvatarData } from '@domino/shared';

const Hat = ({ a }: { a: AvatarData }) => {
  switch (a.hat) {
    case 'bone':
      return (
        <g fill={a.hatColor}>
          <path d="M30 38 Q50 18 70 38 Z" />
          <rect x="28" y="36" width="44" height="5" rx="2" />
          <path d="M66 38 Q82 38 84 43 L66 42 Z" />
        </g>
      );
    case 'chapeu':
      return (
        <g fill={a.hatColor}>
          <ellipse cx="50" cy="36" rx="28" ry="6" />
          <path d="M34 35 Q35 18 50 18 Q65 18 66 35 Z" />
        </g>
      );
    case 'palha':
      return (
        <g fill={a.hatColor} stroke="#a8873d" strokeWidth="1">
          <ellipse cx="50" cy="38" rx="32" ry="7" />
          <path d="M34 37 Q36 20 50 20 Q64 20 66 37 Z" />
          <rect x="35" y="31" width="30" height="4" fill="#7a4b2a" stroke="none" />
        </g>
      );
    case 'lenco':
      return <path d="M28 44 Q30 18 50 18 Q70 18 72 44 Q62 32 50 32 Q38 32 28 44 Z" fill={a.hatColor} />;
    case 'bruxa':
      return (
        <g fill={a.hatColor}>
          <ellipse cx="50" cy="36" rx="30" ry="5" />
          <path d="M36 35 L56 2 L64 35 Z" />
          <rect x="38" y="30" width="25" height="4" fill="#7b3fa0" />
        </g>
      );
    case 'chifres':
      return (
        <g fill={a.hatColor} stroke="#bba77a" strokeWidth="1">
          <path d="M30 34 Q14 28 16 12 Q24 26 36 28 Z" />
          <path d="M70 34 Q86 28 84 12 Q76 26 64 28 Z" />
        </g>
      );
    case 'touca':
      return (
        <g fill={a.hatColor}>
          <path d="M30 40 Q30 18 50 18 Q70 18 70 40 Z" />
          <circle cx="50" cy="16" r="5" />
          <rect x="29" y="36" width="42" height="6" rx="3" fill="#f2c14e" />
        </g>
      );
    case 'coque':
      return (
        <g fill={a.hatColor}>
          <circle cx="50" cy="20" r="9" />
          <path d="M31 42 Q32 24 50 24 Q68 24 69 42 Q60 30 50 30 Q40 30 31 42 Z" />
        </g>
      );
    default:
      return <path d="M32 40 Q34 24 50 24 Q66 24 68 40 Q60 31 50 32 Q40 31 32 40 Z" fill="#3a2a20" />;
  }
};

const Prop = ({ a }: { a: AvatarData }) => {
  switch (a.prop) {
    case 'domino':
      return (
        <g transform="translate(70 66) rotate(-15)">
          <rect width="12" height="22" rx="2" fill="#f4ecd6" stroke="#333" strokeWidth="1" />
          <line x1="1" y1="11" x2="11" y2="11" stroke="#333" strokeWidth="1" />
          <circle cx="6" cy="5.5" r="1.6" fill="#222" />
          <circle cx="3.5" cy="14" r="1.4" fill="#222" />
          <circle cx="8.5" cy="19" r="1.4" fill="#222" />
        </g>
      );
    case 'rede':
      return (
        <g stroke="#7a5c3a" strokeWidth="1" fill="none" transform="translate(66 64)">
          <path d="M0 0 L22 0 L18 26 L4 26 Z" />
          {[6, 12, 18].map((y) => (
            <line key={y} x1={y / 6} y1={y} x2={22 - y / 6} y2={y} />
          ))}
          {[7, 11, 15].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="26" />
          ))}
        </g>
      );
    case 'bilro':
      return (
        <g transform="translate(72 66)">
          {[0, 6, 12].map((x) => (
            <g key={x}>
              <rect x={x} y="0" width="3" height="18" rx="1.5" fill="#b07a45" />
              <circle cx={x + 1.5} cy="20" r="2.5" fill="#8a5a2b" />
            </g>
          ))}
        </g>
      );
    case 'camarao':
      return <path d="M70 76 Q76 62 88 68 Q82 70 84 76 Q78 74 74 82 Z" fill="#f08a4b" stroke="#c25a1d" strokeWidth="1" />;
    case 'prancha':
      return <ellipse cx="80" cy="70" rx="5" ry="22" fill="#f6f1e1" stroke="#2aa3a1" strokeWidth="2" transform="rotate(18 80 70)" />;
    case 'ramo':
      return (
        <g transform="translate(74 62)" fill="#4f8a3a">
          <line x1="4" y1="0" x2="4" y2="26" stroke="#5a3d22" strokeWidth="1.5" />
          <ellipse cx="0" cy="6" rx="4" ry="2" />
          <ellipse cx="8" cy="10" rx="4" ry="2" />
          <ellipse cx="0" cy="14" rx="4" ry="2" />
          <ellipse cx="8" cy="18" rx="4" ry="2" />
        </g>
      );
    case 'vassoura':
      return (
        <g transform="translate(76 52) rotate(20)">
          <rect x="0" y="0" width="3" height="34" fill="#7a4b2a" />
          <path d="M-5 34 L8 34 L11 48 L-8 48 Z" fill="#d8b866" />
        </g>
      );
    case 'fita':
      return <path d="M68 64 Q76 72 70 80 Q80 76 86 86" stroke="#f2c14e" strokeWidth="3" fill="none" />;
    default:
      return null;
  }
};

const Human = ({ a }: { a: AvatarData }) => (
  <>
    <path d="M18 100 Q20 70 50 68 Q80 70 82 100 Z" fill={a.shirt} />
    {a.id === 'veterano' && (
      <g stroke="#2f4b6b" strokeWidth="1.5" opacity="0.6">
        <line x1="30" y1="76" x2="30" y2="100" />
        <line x1="42" y1="70" x2="42" y2="100" />
        <line x1="58" y1="70" x2="58" y2="100" />
        <line x1="70" y1="76" x2="70" y2="100" />
        <line x1="20" y1="86" x2="80" y2="86" />
      </g>
    )}
    <rect x="44" y="58" width="12" height="12" fill={a.skin} />
    <ellipse cx="50" cy="44" rx="18" ry="20" fill={a.skin} />
    <circle cx="43" cy="44" r="2.2" fill="#222" />
    <circle cx="57" cy="44" r="2.2" fill="#222" />
    <path d="M43 54 Q50 59 57 54" stroke="#6b3a2a" strokeWidth="2" fill="none" strokeLinecap="round" />
    {a.id === 'veterano' && <path d="M40 52 Q50 50 60 52" stroke="#ddd" strokeWidth="3" fill="none" />}
    {a.id === 'bruxa' && <path d="M50 46 L54 52 L49 52 Z" fill="#7d9663" />}
    <Hat a={a} />
  </>
);

const Creature = ({ a }: { a: AvatarData }) => {
  if (a.creature === 'boi')
    return (
      <>
        <path d="M18 100 Q20 72 50 70 Q80 72 82 100 Z" fill={a.shirt} />
        <path d="M18 100 Q20 72 50 70 Q80 72 82 100" fill="none" stroke="#d64b7c" strokeWidth="3" strokeDasharray="4 4" />
        <ellipse cx="50" cy="46" rx="20" ry="22" fill={a.skin} />
        <ellipse cx="50" cy="60" rx="13" ry="9" fill="#f1dcc6" />
        <circle cx="45" cy="60" r="2" fill="#5a3d2b" />
        <circle cx="55" cy="60" r="2" fill="#5a3d2b" />
        <circle cx="42" cy="42" r="3" fill="#fff" />
        <circle cx="58" cy="42" r="3" fill="#fff" />
        <circle cx="42" cy="42" r="1.6" fill="#111" />
        <circle cx="58" cy="42" r="1.6" fill="#111" />
        <Hat a={a} />
      </>
    );
  if (a.creature === 'bernunca')
    return (
      <>
        <path d="M14 100 Q16 66 50 62 Q84 66 86 100 Z" fill={a.shirt} />
        <path d="M20 46 Q50 10 80 46 Q76 74 50 74 Q24 74 20 46 Z" fill={a.skin} />
        <path d="M28 52 Q50 82 72 52 Q50 62 28 52 Z" fill="#8b1e2d" />
        {[34, 42, 50, 58, 66].map((x) => (
          <path key={x} d={`M${x - 3} 54 L${x} 60 L${x + 3} 55 Z`} fill="#fff" />
        ))}
        <circle cx="38" cy="36" r="5" fill="#f2e94e" />
        <circle cx="62" cy="36" r="5" fill="#f2e94e" />
        <circle cx="38" cy="36" r="2" fill="#111" />
        <circle cx="62" cy="36" r="2" fill="#111" />
      </>
    );
  return (
    <>
      <path d="M14 56 Q40 26 74 50 L90 36 L88 70 L74 60 Q40 86 14 56 Z" fill={a.skin} stroke="#5c7385" strokeWidth="1.5" />
      <path d="M30 50 Q48 44 66 52" stroke={a.shirt} strokeWidth="3" fill="none" />
      <path d="M30 58 Q48 64 66 58" stroke={a.shirt} strokeWidth="2" fill="none" />
      <circle cx="26" cy="52" r="3.5" fill="#fff" />
      <circle cx="26" cy="52" r="1.8" fill="#111" />
      <path d="M16 58 Q20 60 22 58" stroke="#333" strokeWidth="1.5" fill="none" />
    </>
  );
};

/** Retrato do personagem: a ilustração oficial (public/avatars); se não carregar, o desenho SVG simples. */
export function Avatar({ id, size = 56, title }: { id: string; size?: number; title?: string }) {
  const a = avatarById(id);
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src={`/avatars/${a.id}.webp`}
        width={size}
        height={size}
        alt={title ?? a.name}
        className="avatar"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title ?? a.name} className="avatar">
      <defs>
        <clipPath id={`clip-${a.id}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${a.id})`}>
        <rect width="100" height="100" fill={a.background} />
        {a.creature ? <Creature a={a} /> : <Human a={a} />}
        <Prop a={a} />
      </g>
    </svg>
  );
}
