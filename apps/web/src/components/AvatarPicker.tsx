import { AVATARS, isAvatarUnlocked } from '@domino/shared';
import { Avatar } from './Avatar';

export function AvatarPicker({ value, onChange, wins }: { value: string; onChange: (id: string) => void; wins: number }) {
  return (
    <div className="avatar-grid" role="radiogroup" aria-label="Escolhe teu personagem">
      {AVATARS.map((a) => {
        const unlocked = isAvatarUnlocked(a, wins);
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={value === a.id}
            disabled={!unlocked}
            className={`avatar-option ${value === a.id ? 'is-selected' : ''}`}
            onClick={() => onChange(a.id)}
            title={unlocked ? a.blurb : `Libera com ${a.unlockWins} vitórias online`}
          >
            <Avatar id={a.id} size={64} />
            <span>{a.name}</span>
            {!unlocked && <small>🔒 {a.unlockWins} vitórias online</small>}
          </button>
        );
      })}
    </div>
  );
}
