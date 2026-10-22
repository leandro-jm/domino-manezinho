import type { Object3D } from 'three';

/**
 * Registro compartilhado entre a cena 3D e os balões de fala (DOM). Fica fora de three/ de propósito:
 * a tela de jogo importa isto sem puxar o three.js para o pacote principal.
 */
export const headAnchors = new Map<number, Object3D>();
export const bubbleEls = new Map<number, HTMLElement>();
