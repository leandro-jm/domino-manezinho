import { useState } from 'react';
import { sobreProjetoBotao } from '../lib/flags';
import { SobreProjetoDialog } from './SobreProjetoDialog';

/** Botão "Sobre o projeto" da home; não renderiza nada com a flag sobre-projeto-botao desligada. */
export function SobreProjetoBotao({ enabled = sobreProjetoBotao() }: { enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        ℹ️ Sobre o projeto
      </button>
      {open && <SobreProjetoDialog onClose={() => setOpen(false)} />}
    </>
  );
}
