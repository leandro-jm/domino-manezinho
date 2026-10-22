import { achievementProgress, type PlayerStats } from '@domino/shared';

/** Medalhas: as ganhas coloridas; as que faltam apagadas, com quanto já tem (só no próprio perfil). */
export function Achievements({ stats, onlyDone = false }: { stats: PlayerStats; onlyDone?: boolean }) {
  const all = achievementProgress(stats);
  const shown = onlyDone ? all.filter((a) => a.done) : all;
  if (!shown.length) return onlyDone ? null : <p className="muted">Nenhuma medalha ainda.</p>;
  return (
    <ul className="achievements">
      {shown.map((a) => (
        <li
          key={a.id}
          className={a.done ? 'is-done' : ''}
          title={a.description}
          aria-label={`${a.label}: ${a.description} ${a.done ? 'Conquistada.' : `${a.current} de ${a.goal}.`}`}
        >
          <span className="achievement-icon" aria-hidden="true">
            {a.icon}
          </span>
          <strong>{a.label}</strong>
          {!a.done && (
            <>
              <span className="achievement-bar" aria-hidden="true">
                <span style={{ width: `${(a.current / a.goal) * 100}%` }} />
              </span>
              <small aria-hidden="true">
                {a.current}/{a.goal}
              </small>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
