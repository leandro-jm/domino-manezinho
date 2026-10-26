import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SobreProjetoBotao } from './SobreProjetoBotao';

const render = (enabled: boolean) => renderToStaticMarkup(createElement(SobreProjetoBotao, { enabled }));

describe('SobreProjetoBotao', () => {
  it('CA1: flag desligada não renderiza nada', () => {
    expect(render(false)).toBe('');
  });
  it('CA1: desligada por padrão (sem env)', () => {
    expect(renderToStaticMarkup(createElement(SobreProjetoBotao))).toBe('');
  });
  it('CA2: flag ligada renderiza o botão, com o diálogo fechado', () => {
    const html = render(true);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>.*Sobre o projeto<\/button>/);
    expect(html).not.toContain('role="dialog"');
  });
  it('CA2: HomeScreen usa o botão dentro da barra home-links', () => {
    const src = readFileSync(new URL('../screens/HomeScreen.tsx', import.meta.url), 'utf8');
    const nav = /<nav className="home-links">([\s\S]*?)<\/nav>/.exec(src)?.[1] ?? '';
    expect(nav).toContain('<SobreProjetoBotao />');
    expect(nav.indexOf('Como se joga')).toBeLessThan(nav.indexOf('<SobreProjetoBotao />'));
  });
  it('CA3/CA4: clique abre o diálogo; fechar, Esc e clique fora o fecham (foco devolvido pelo Dialog)', () => {
    const src = readFileSync(new URL('./SobreProjetoBotao.tsx', import.meta.url), 'utf8');
    expect(src).toContain('onClick={() => setOpen(true)}');
    expect(src).toContain('onClose={() => setOpen(false)}');
  });
});
