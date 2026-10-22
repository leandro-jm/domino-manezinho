import { useEffect, useRef, useState } from 'react';
import { EMOTES } from '@domino/shared';

export function EmoteMenu({ onSend }: { onSend: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Fecha com Esc ou tocando fora, como qualquer menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  return (
    <div className="emote-menu" ref={box}>
      <button className="btn icon" aria-label="Frases rápidas" aria-expanded={open} onClick={() => setOpen(!open)}>
        💬
      </button>
      {open && (
        <ul className="emote-list">
          {EMOTES.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => {
                  onSend(e.id);
                  setOpen(false);
                }}
              >
                {e.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
