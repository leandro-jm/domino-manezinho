import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { flagEnabled, sobreProjetoBotao } from '../lib/flags';
import { SobreProjetoDialog } from './SobreProjetoDialog';

const html = renderToStaticMarkup(createElement(SobreProjetoDialog, { onClose: () => {} }));

describe('flag sobre-projeto-botao', () => {
  it('desligada por padrão', () => {
    expect(sobreProjetoBotao({})).toBe(false);
    expect(flagEnabled('sobre-projeto-botao', { VITE_FLAG_SOBRE_PROJETO_BOTAO: 'false' })).toBe(false);
  });
  it('liga com true/1', () => {
    expect(sobreProjetoBotao({ VITE_FLAG_SOBRE_PROJETO_BOTAO: 'true' })).toBe(true);
    expect(sobreProjetoBotao({ VITE_FLAG_SOBRE_PROJETO_BOTAO: '1' })).toBe(true);
  });
});

describe('SobreProjetoDialog', () => {
  it('CA3: mostra o texto sobre Florianópolis', () => {
    expect(html).toContain('Florianópolis');
    expect(html).toContain('Praça XV');
  });
  it('CA4: tem botão Fechar (Esc e clique fora vêm do Dialog, que devolve o foco)', () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Fechar<\/button>/);
    const dialog = readFileSync(new URL('./Dialog.tsx', import.meta.url), 'utf8');
    expect(dialog).toContain("e.key === 'Escape'");
    expect(dialog).toContain('e.target === e.currentTarget');
    expect(dialog).toContain('before?.focus');
  });
  it('CA5: role=dialog, aria-modal e título associado', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<h2 id="${id}">Sobre o projeto</h2>`);
  });
  it('CA6: conteúdo estático, sem chamada de rede', () => {
    const src = readFileSync(new URL('./SobreProjetoDialog.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|socket\.io|api'/);
  });
});
