import { useId } from 'react';
import { Dialog } from './Dialog';

/** Painel estático "Sobre o projeto": sem rede, funciona offline. O foco volta ao botão ao fechar (via Dialog). */
export function SobreProjetoDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>Sobre o projeto</h2>
      <p>
        O Dominó Manezinho é dedicado a Florianópolis e à sua gente: a mesa de concreto da Praça XV, onde o dominó rola
        à sombra da figueira, e a cultura manezinha que faz da Ilha um lugar único.
      </p>
      <p>Feito com carinho para jogar em dupla com os amigos, na praça ou na tela.</p>
      <button type="button" className="btn primary" onClick={onClose}>
        Fechar
      </button>
    </Dialog>
  );
}
