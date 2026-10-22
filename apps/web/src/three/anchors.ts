import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bubbleEls, headAnchors } from '../game/bubbles';

/** Reposiciona os balões de fala sobre a cabeça de cada peru a cada quadro, sem re-render. */

/** Margens da tela onde o balão não pode entrar (placar e parceiro em cima, mão do jogador embaixo). */
const MARGIN = { top: 122, bottom: 250, side: 110 };
const v = new THREE.Vector3();

// Altura de cada balão sem ler o layout a cada quadro (offsetHeight força o navegador a recalcular):
// mede uma vez e o ResizeObserver avisa quando o texto muda de tamanho.
const heights = new WeakMap<HTMLElement, number>();
const watcher =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => {
        for (const e of entries) heights.set(e.target as HTMLElement, (e.target as HTMLElement).offsetHeight);
      });
const heightOf = (el: HTMLElement) => {
  let h = heights.get(el);
  if (h === undefined) {
    heights.set(el, (h = el.offsetHeight));
    watcher?.observe(el);
  }
  return h;
};
/** Último estilo escrito em cada balão: não reescreve o que não mudou. */
const written = new WeakMap<HTMLElement, string>();

export function BubbleProjector() {
  useFrame(({ camera, size }) => {
    for (const [id, el] of bubbleEls) {
      const anchor = headAnchors.get(id);
      if (!anchor) {
        if (written.get(el) !== 'hidden') {
          el.style.visibility = 'hidden';
          written.set(el, 'hidden');
        }
        continue;
      }
      anchor.getWorldPosition(v);
      v.project(camera);
      const behind = v.z > 1;
      let x = ((v.x + 1) / 2) * size.width;
      let y = ((1 - v.y) / 2) * size.height;
      // Cabeça fora da tela (normal: estão em pé e a câmera olha a mesa): o balão encosta na borda,
      // com o rabinho apontando para a pessoa.
      x = Math.min(size.width - MARGIN.side, Math.max(MARGIN.side, x));
      // o balão cresce pra cima a partir de y: a borda de cima dele não pode passar da margem
      const minY = MARGIN.top + heightOf(el) + 12;
      y = behind ? minY : Math.min(size.height - MARGIN.bottom, Math.max(minY, y));
      const transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (written.get(el) === transform) continue;
      el.style.transform = transform;
      el.style.visibility = 'visible';
      written.set(el, transform);
    }
  });
  return null;
}
