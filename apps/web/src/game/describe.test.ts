import { describe, expect, it } from 'vitest';
import { applyMove, createMatch, legalMoves, SENA } from '@domino/engine';
import { hintText, mistakeText, moveText, resultText } from './describe';

describe('jogadas em palavras', () => {
  it('saída, ponta e passe', () => {
    let m = createMatch({}, 7);
    const open = legalMoves(m, m.hand.turn)[0]!;
    expect(moveText(open, 'Tião', m.hand.board)).toBe('Tião saiu com 6-6');
    expect(open.type === 'play' && open.tileId).toBe(SENA.id);
    m = applyMove(m, open);
    const next = legalMoves(m, m.hand.turn)[0]!;
    if (next.type === 'play') expect(moveText(next, 'Zé', m.hand.board)).toMatch(/^Zé jogou \d-6 na ponta do 6$/);
    else expect(moveText(next, 'Zé', m.hand.board)).toBe('Zé passou (toc-toc)');
    expect(moveText({ type: 'pass', seat: 0 }, 'Tião')).toBe('Tião passou (toc-toc)');
  });

  it('resultado do ponto de vista da dupla', () => {
    const names = ['Eu', 'Ele', 'Parceiro', 'Outro'];
    expect(resultText({ type: 'batida', seat: 2, team: 0, kind: 'laelo', points: 3, galo: [0, 0] }, names, 0)).toBe(
      'Lá-e-ló! — Parceiro bateu, +3 pra nós',
    );
    expect(resultText({ type: 'trancado', team: 1, pips: [20, 10], points: 1, galo: [0, 0] }, names, 0)).toBe('Trancou: +1 pra eles');
    expect(resultText({ type: 'trancado', team: null, pips: [10, 10], points: 0, galo: [0, 0] }, names, 1)).toBe('Trancou e empatou: ninguém marca');
  });
});

describe('dica em palavras', () => {
  it('diz a pedra e a ponta', () => {
    let m = createMatch({}, 7);
    const open = legalMoves(m, m.hand.turn)[0]!;
    expect(hintText(open, m.hand.board)).toBe('Sai com o 6-6.');
    m = applyMove(m, open);
    // Pontas iguais (6 e 6): não precisa dizer qual.
    const next = legalMoves(m, m.hand.turn).find((x) => x.type === 'play');
    if (next) expect(hintText(next, m.hand.board)).toMatch(/^Joga o \d-6\.$/);
    expect(hintText({ type: 'pass', seat: 0 }, m.hand.board)).toBe('Não tem jeito: toc-toc.');
  });
});

describe('lance pra pensar', () => {
  it('diz o que jogou, o que era melhor e quanto custou', () => {
    let m = createMatch({}, 7);
    m = applyMove(m, legalMoves(m, m.hand.turn)[0]!);
    const board = m.hand.board;
    const played = { type: 'play', seat: 0, tileId: 0, side: 'left' } as const;
    const best = { type: 'play', seat: 0, tileId: 1, side: 'right' } as const;
    // Pontas iguais (6 e 6): sem dizer a ponta.
    expect(mistakeText(played, best, board, 1.234)).toBe('Jogaste o 0-0; melhor era o 0-1 (−1,2 pt)');
  });
});
