/**
 * Figurino de cada personagem em 3D, a partir das ilustrações dos avatares (art/avatares) e dos perus.
 * As roupas são pintadas no corpo pelo shader (clothes.ts); chapéus, lenços, bigodes e cabeças de
 * fantasia são peças presas aos ossos (acessorios.ts).
 */

export type Pattern =
  | { kind: 'liso'; a: string }
  | { kind: 'listras' | 'xadrez'; a: string; b: string }
  | { kind: 'florido'; a: string; b: string; c: string }
  | { kind: 'escamas'; a: string; b: string }
  /** Roupa de borracha: cor base com frisos nas costuras. */
  | { kind: 'surfe'; a: string; b: string };

export type HairStyle = 'Hair_Buns' | 'Hair_Buzzed' | 'Hair_BuzzedFemale' | 'Hair_Long' | 'Hair_SimpleParted';

export type Hat =
  | { kind: 'palha'; band: string; flower?: string; flag?: boolean }
  | { kind: 'fedora'; color: string; band: string }
  | { kind: 'bone'; color: string }
  | { kind: 'bruxa'; color: string; band: string }
  | { kind: 'lenco'; color: string; flowers: string; edge: string }
  | { kind: 'coroa-flores' };

export interface Look {
  body: 'homem' | 'mulher';
  /** Tom de pele: textura clara ou escura, multiplicada pelo tom. */
  skin: { base: 'clara' | 'escura'; tint: string };
  hair?: { style: HairStyle; color: string };
  eyebrows: string;
  beard?: string;
  mustache?: string;
  glasses?: boolean;
  /** Parte de cima. `sleeves`: 0 regata, 0.5 manga curta, 1 manga comprida. */
  top: { pattern: Pattern; sleeves: number; open?: string };
  /** Parte de baixo: calça até o tornozelo, bermuda até o joelho, ou o vestido continua até `hem`. */
  bottom: { kind: 'calca' | 'bermuda' | 'vestido'; pattern: Pattern; hem?: number };
  shoes: { kind: 'chinelo' | 'sapato' | 'descalco'; color: string };
  vest?: Pattern;
  shawl?: string;
  apron?: { color: string; bib: boolean };
  /** Saia rodada (malha) por cima das pernas. */
  skirt?: Pattern;
  cape?: string;
  hat?: Hat;
  /** Cabeça de fantasia (bicho do Boi de Mamão ou mascote). Corpo vira fantasia inteira. */
  creature?: 'boi' | 'bernunca' | 'tainha';
  /** Ramo de ervas na mão (benzedeira). */
  bouquet?: boolean;
  belly?: number;
  scale?: number;
  /** Pose dos braços de quem está em pé (os perus). */
  armPose?: 'cruzados' | 'costas' | 'queixo' | 'soltos';
}

const SANDAL = '#2a5aa0';

/** Avatares jogáveis, na ordem/ids de packages/shared/src/avatars.ts. */
export const AVATAR_LOOKS: Record<string, Look> = {
  veterano: {
    body: 'homem',
    skin: { base: 'clara', tint: '#d39a72' },
    hair: { style: 'Hair_SimpleParted', color: '#efefea' },
    eyebrows: '#cfc8bd',
    mustache: '#f4f4f0',
    top: { pattern: { kind: 'liso', a: '#f2c230' }, sleeves: 0.5 },
    bottom: { kind: 'calca', pattern: { kind: 'liso', a: '#c9b48c' } },
    shoes: { kind: 'sapato', color: '#3a2a20' },
    hat: { kind: 'fedora', color: '#1f2a3a', band: '#16203a' },
    belly: 0.7,
    scale: 0.96,
  },
  pescador: {
    body: 'homem',
    skin: { base: 'clara', tint: '#c98d62' },
    hair: { style: 'Hair_SimpleParted', color: '#1c1714' },
    eyebrows: '#1c1714',
    top: { pattern: { kind: 'liso', a: '#2350b8' }, sleeves: 0.5 },
    bottom: { kind: 'bermuda', pattern: { kind: 'liso', a: '#b9a57e' } },
    shoes: { kind: 'chinelo', color: SANDAL },
    hat: { kind: 'palha', band: '#1f4aa8' },
  },
  rendeira: {
    body: 'mulher',
    skin: { base: 'clara', tint: '#f0cdb0' },
    hair: { style: 'Hair_Buns', color: '#ecebe6' },
    eyebrows: '#bdb8b0',
    top: { pattern: { kind: 'liso', a: '#f7f5ef' }, sleeves: 1 },
    vest: { kind: 'florido', a: '#1f3a7a', b: '#ef6aa0', c: '#4caf50' },
    bottom: { kind: 'vestido', pattern: { kind: 'liso', a: '#1f3a7a' }, hem: 0.25 },
    apron: { color: '#f2a7c3', bib: false },
    shoes: { kind: 'sapato', color: '#1b1b1b' },
    hat: { kind: 'lenco', color: '#fbfaf6', flowers: '#ef6aa0', edge: '#1f3a7a' },
    belly: 0.3,
    scale: 0.94,
  },
  benzedeira: {
    body: 'mulher',
    skin: { base: 'escura', tint: '#e2b08c' },
    hair: { style: 'Hair_Buns', color: '#b9b6b1' },
    eyebrows: '#6d6862',
    top: { pattern: { kind: 'liso', a: '#f7f3ea' }, sleeves: 1 },
    shawl: '#2f7d3b',
    bottom: { kind: 'vestido', pattern: { kind: 'liso', a: '#f7f3ea' }, hem: 0.12 },
    shoes: { kind: 'chinelo', color: '#7a4b2a' },
    hat: { kind: 'lenco', color: '#f6efd9', flowers: '#d6362e', edge: '#c0392b' },
    bouquet: true,
    belly: 0.4,
    scale: 0.93,
  },
  camarao: {
    body: 'homem',
    skin: { base: 'clara', tint: '#c3875d' },
    hair: { style: 'Hair_Buzzed', color: '#16110e' },
    eyebrows: '#16110e',
    beard: '#16110e',
    top: { pattern: { kind: 'liso', a: '#1f2f5a' }, sleeves: 0.5 },
    apron: { color: '#f4f2ec', bib: true },
    bottom: { kind: 'bermuda', pattern: { kind: 'liso', a: '#1f2f5a' } },
    shoes: { kind: 'chinelo', color: '#2e7d32' },
    hat: { kind: 'palha', band: '#1f8f3a', flag: true },
    belly: 0.5,
  },
  surfista: {
    body: 'homem',
    skin: { base: 'clara', tint: '#cc915f' },
    hair: { style: 'Hair_SimpleParted', color: '#1a120d' },
    eyebrows: '#1a120d',
    // roupa de borracha inteira, com o friso amarelo
    top: { pattern: { kind: 'surfe', a: '#1d2f5c', b: '#f2c230' }, sleeves: 1 },
    bottom: { kind: 'calca', pattern: { kind: 'surfe', a: '#1d2f5c', b: '#f2c230' } },
    shoes: { kind: 'descalco', color: '#000' },
    scale: 0.95,
  },
  maricota: {
    body: 'mulher',
    skin: { base: 'escura', tint: '#d79d74' },
    hair: { style: 'Hair_Long', color: '#120d0b' },
    eyebrows: '#120d0b',
    top: { pattern: { kind: 'florido', a: '#ec3b7c', b: '#ffcf33', c: '#f7f2ea' }, sleeves: 0.5 },
    bottom: { kind: 'vestido', pattern: { kind: 'florido', a: '#ec3b7c', b: '#ffcf33', c: '#f7f2ea' }, hem: 0.2 },
    skirt: { kind: 'florido', a: '#f7f2ea', b: '#ec3b7c', c: '#ff8a1f' },
    shoes: { kind: 'chinelo', color: '#ff8a1f' },
    hat: { kind: 'coroa-flores' },
  },
  mane: {
    body: 'homem',
    skin: { base: 'clara', tint: '#dca274' },
    hair: { style: 'Hair_SimpleParted', color: '#2a1b12' },
    eyebrows: '#2a1b12',
    mustache: '#2a1b12',
    top: { pattern: { kind: 'florido', a: '#3a9be0', b: '#f7fbff', c: '#cfe8c8' }, sleeves: 0.5, open: '#f7f7f2' },
    bottom: { kind: 'bermuda', pattern: { kind: 'liso', a: '#d8c7a2' } },
    shoes: { kind: 'chinelo', color: '#f2c14e' },
    hat: { kind: 'palha', band: '#2f9e44', flower: '#fffdf2' },
  },
  boi: {
    body: 'homem',
    skin: { base: 'clara', tint: '#d9a07a' },
    eyebrows: '#000',
    top: { pattern: { kind: 'florido', a: '#c8102e', b: '#ffd23f', c: '#2e9e4f' }, sleeves: 1 },
    bottom: { kind: 'calca', pattern: { kind: 'florido', a: '#c8102e', b: '#ffd23f', c: '#2f6fd6' } },
    shoes: { kind: 'sapato', color: '#7a1a1a' },
    creature: 'boi',
  },
  bruxa: {
    body: 'mulher',
    skin: { base: 'clara', tint: '#f0c3a0' },
    hair: { style: 'Hair_Long', color: '#3a2316' },
    eyebrows: '#3a2316',
    top: { pattern: { kind: 'liso', a: '#4b2475' }, sleeves: 1 },
    bottom: { kind: 'vestido', pattern: { kind: 'liso', a: '#4b2475' }, hem: 0.08 },
    cape: '#5b2a8c',
    shoes: { kind: 'sapato', color: '#2a1838' },
    hat: { kind: 'bruxa', color: '#5b2a8c', band: '#d6b25a' },
    scale: 0.95,
  },
  bernunca: {
    body: 'homem',
    skin: { base: 'clara', tint: '#d9a07a' },
    eyebrows: '#000',
    top: { pattern: { kind: 'florido', a: '#7b3fbf', b: '#ff8a1f', c: '#2fb0d6' }, sleeves: 1 },
    bottom: { kind: 'calca', pattern: { kind: 'florido', a: '#2457c5', b: '#ff4f9a', c: '#ffd23f' } },
    shoes: { kind: 'sapato', color: '#2e8f6e' },
    creature: 'bernunca',
  },
  tainha: {
    body: 'homem',
    skin: { base: 'clara', tint: '#d9a07a' },
    eyebrows: '#000',
    top: { pattern: { kind: 'escamas', a: '#c9d2da', b: '#8e9aa6' }, sleeves: 1 },
    bottom: { kind: 'calca', pattern: { kind: 'escamas', a: '#c9d2da', b: '#8e9aa6' } },
    shoes: { kind: 'sapato', color: '#8e9aa6' },
    creature: 'tainha',
  },
};

/** Perus em pé em volta da mesa, na ordem de PERUS em game/kibitz.ts. */
export const PERU_LOOKS: Look[] = [
  {
    // Seu Valmor: veterano de boné e camisa xadrez, bigodão branco
    armPose: 'costas',
    body: 'homem',
    skin: { base: 'clara', tint: '#e2b08a' },
    hair: { style: 'Hair_Buzzed', color: '#e7e5df' },
    eyebrows: '#c9c1b6',
    mustache: '#f2f1ec',
    top: { pattern: { kind: 'xadrez', a: '#4f74a0', b: '#e9e4d8' }, sleeves: 0.5 },
    bottom: { kind: 'calca', pattern: { kind: 'liso', a: '#bfae8a' } },
    shoes: { kind: 'sapato', color: '#3a2a20' },
    hat: { kind: 'bone', color: '#2f3b4c' },
    belly: 1,
    scale: 0.95,
  },
  {
    // Dona Nilza: coque grisalho, óculos, vestido listrado
    armPose: 'cruzados',
    body: 'mulher',
    skin: { base: 'escura', tint: '#e0ab86' },
    hair: { style: 'Hair_Buns', color: '#b9b4ad' },
    eyebrows: '#8a847c',
    glasses: true,
    top: { pattern: { kind: 'listras', a: '#c2577a', b: '#f3dbe3' }, sleeves: 0.5 },
    bottom: { kind: 'vestido', pattern: { kind: 'listras', a: '#c2577a', b: '#f3dbe3' }, hem: 0.18 },
    skirt: { kind: 'listras', a: '#c2577a', b: '#f3dbe3' },
    shoes: { kind: 'sapato', color: '#5a3b2c' },
    belly: 0.5,
    scale: 0.92,
  },
  {
    // Tonho: camisa listrada do Avaí, bermuda, chinelo
    armPose: 'queixo',
    body: 'homem',
    skin: { base: 'escura', tint: '#d9a585' },
    hair: { style: 'Hair_Buzzed', color: '#16110e' },
    eyebrows: '#16110e',
    top: { pattern: { kind: 'listras', a: '#1f5fa8', b: '#f4f4f4' }, sleeves: 0.5 },
    bottom: { kind: 'bermuda', pattern: { kind: 'liso', a: '#2f3e57' } },
    shoes: { kind: 'chinelo', color: '#f2c14e' },
    belly: 0.3,
  },
  {
    // Zeca: pescador de chapéu de palha e regata
    armPose: 'soltos',
    body: 'homem',
    skin: { base: 'escura', tint: '#c98f6a' },
    hair: { style: 'Hair_Buzzed', color: '#120e0b' },
    eyebrows: '#120e0b',
    top: { pattern: { kind: 'liso', a: '#f2f0ea' }, sleeves: 0 },
    bottom: { kind: 'bermuda', pattern: { kind: 'liso', a: '#6b7a5a' } },
    shoes: { kind: 'chinelo', color: SANDAL },
    hat: { kind: 'palha', band: '#6b4a2a' },
  },
  {
    // Seu Ademir: careca de óculos com a camisa do Figueirense
    armPose: 'cruzados',
    body: 'homem',
    skin: { base: 'clara', tint: '#eab894' },
    hair: { style: 'Hair_Buzzed', color: '#8f8a84' },
    eyebrows: '#8f8a84',
    glasses: true,
    top: { pattern: { kind: 'listras', a: '#1b1b1b', b: '#f4f4f4' }, sleeves: 0.5 },
    bottom: { kind: 'calca', pattern: { kind: 'liso', a: '#4b4f57' } },
    shoes: { kind: 'sapato', color: '#1f1f1f' },
    belly: 0.85,
  },
];

export const lookForAvatar = (avatarId: string): Look => AVATAR_LOOKS[avatarId] ?? AVATAR_LOOKS.veterano!;
