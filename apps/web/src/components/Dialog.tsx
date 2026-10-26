import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal: o foco entra (no botão principal), o Tab fica dentro, Esc e toque fora fecham, e ao
 * fechar o foco volta pra onde estava. Sem `onClose`, só fecha pelos botões de dentro.
 */
export function Dialog({
  label,
  labelledBy,
  onClose,
  className = '',
  children,
}: {
  label?: string;
  /** id do título dentro do diálogo; tem precedência sobre `label`. */
  labelledBy?: string;
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = box.current!;
    const focusables = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !x.hasAttribute('disabled'));
    (el.querySelector<HTMLElement>('[autofocus], .btn.primary') ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && close.current) {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);

  return (
    <div
      className={`overlay ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onClick={(e) => e.target === e.currentTarget && close.current?.()}
    >
      <div className="overlay-card" ref={box}>
        {children}
      </div>
    </div>
  );
}
