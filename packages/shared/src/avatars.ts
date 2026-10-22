/**
 * Personagens de Floripa. São tipos e figuras do folclore manezinho — nada de pessoas
 * reais, para não esbarrar em direito de imagem. Os campos visuais alimentam o retrato
 * SVG do app até a arte definitiva ficar pronta.
 */
export type AvatarHat = 'bone' | 'chapeu' | 'palha' | 'lenco' | 'bruxa' | 'chifres' | 'nenhum' | 'touca' | 'coque';
export type AvatarProp = 'rede' | 'bilro' | 'camarao' | 'prancha' | 'ramo' | 'vassoura' | 'domino' | 'nenhum' | 'fita';

/** Como o personagem soa no blablablá sintetizado (quando não tem fala gravada). */
export interface AvatarVoice {
  /** Tom base em Hz: homem grave ~100, mulher ~220, bicho como quiser. */
  pitch: number;
  /** Sílabas por segundo. */
  rate: number;
  /** Escala dos formantes: abaixo de 1 soa mais encorpado, acima soa mais miúdo. */
  formant: number;
}

export interface Avatar {
  id: string;
  name: string;
  blurb: string;
  skin: string;
  shirt: string;
  background: string;
  hat: AvatarHat;
  hatColor: string;
  prop: AvatarProp;
  voice: AvatarVoice;
  /** Bichos e assombrações não têm rosto humano. */
  creature?: 'boi' | 'bernunca' | 'tainha';
  /** Vitórias (online ou treino) necessárias para liberar. */
  unlockWins?: number;
}

export const AVATARS: readonly Avatar[] = [
  {
    id: 'veterano',
    name: 'Seu Dominó',
    blurb: 'Veterano da Praça XV, de chapéu preto, bigodão branco e camisa amarela. Nunca perdeu uma tarde.',
    skin: '#c98e64',
    shirt: '#f2c230',
    background: '#d9c9a3',
    hat: 'chapeu',
    hatColor: '#1f2a3a',
    prop: 'domino',
    voice: { pitch: 105, rate: 5.5, formant: 0.85 },
  },
  {
    id: 'pescador',
    name: 'Pescador da Barra',
    blurb: 'Vem direto da Barra da Lagoa, de chapéu de palha e camisa azul, ainda cheirando a tainha.',
    skin: '#c08a5f',
    shirt: '#2350b8',
    background: '#9cc6d6',
    hat: 'palha',
    hatColor: '#d8b866',
    prop: 'rede',
    voice: { pitch: 125, rate: 6.5, formant: 0.9 },
  },
  {
    id: 'rendeira',
    name: 'Rendeira de Bilro',
    blurb: 'Da Lagoa da Conceição, de lenço rendado e colete florido: faz renda e conta pedra ao mesmo tempo.',
    skin: '#e3b28f',
    shirt: '#1f3a7a',
    background: '#f1d9c6',
    hat: 'lenco',
    hatColor: '#f4f0e6',
    prop: 'bilro',
    voice: { pitch: 225, rate: 7.5, formant: 1.1 },
  },
  {
    id: 'benzedeira',
    name: 'Benzedeira',
    blurb: 'Lenço florido e ramo de ervas na mão: tira quebranto e olho gordo. Dizem que benze até as pedras.',
    skin: '#b47a54',
    shirt: '#f4f0e6',
    background: '#d7e2c4',
    hat: 'coque',
    hatColor: '#d9d9d9',
    prop: 'ramo',
    voice: { pitch: 250, rate: 4.8, formant: 1.15 },
  },
  {
    id: 'camarao',
    name: 'Seu do Camarão',
    blurb: 'De avental e chapéu de palha, vende camarão no Mercado Público e fiado na mesa de dominó.',
    skin: '#b97f56',
    shirt: '#1f2f5a',
    background: '#f3cf9a',
    hat: 'palha',
    hatColor: '#d8b866',
    prop: 'camarao',
    voice: { pitch: 135, rate: 8.5, formant: 0.9 },
  },
  {
    id: 'surfista',
    name: 'Surfista da Joaca',
    blurb: 'Desceu da Joaquina de roupa de borracha e prancha debaixo do braço, só pra bater uma de carroça.',
    skin: '#c58a5c',
    shirt: '#1d2f5c',
    background: '#bfe6ee',
    hat: 'nenhum',
    hatColor: '#000000',
    prop: 'prancha',
    voice: { pitch: 145, rate: 6, formant: 0.95 },
  },
  {
    id: 'maricota',
    name: 'Maricota',
    blurb: 'A dama do Boi de Mamão, de coroa de flores e vestido rodado: dança e joga com o braço longo.',
    skin: '#9a6440',
    shirt: '#e2457a',
    background: '#f6c7d8',
    hat: 'coque',
    hatColor: '#3a2a20',
    prop: 'fita',
    voice: { pitch: 270, rate: 8, formant: 1.2 },
  },
  {
    id: 'mane',
    name: 'Manezinho da Ilha',
    blurb: 'Ó-lhó-lhó! Chapéu de palha, camisa de flor e a Hercílio Luz no coração. Não aceita perder em casa.',
    skin: '#d39a6c',
    shirt: '#3a9be0',
    background: '#ffd8a8',
    hat: 'palha',
    hatColor: '#d8b866',
    prop: 'nenhum',
    voice: { pitch: 165, rate: 9, formant: 1 },
  },
  {
    id: 'boi',
    name: 'Boi de Mamão',
    blurb: 'Morre e ressuscita a cada mão perdida.',
    skin: '#6b4a3a',
    shirt: '#f4f0e6',
    background: '#e9d3a7',
    hat: 'chifres',
    hatColor: '#efe6cf',
    prop: 'nenhum',
    voice: { pitch: 75, rate: 3, formant: 0.7 },
    creature: 'boi',
    unlockWins: 5,
  },
  {
    id: 'bruxa',
    name: 'Bruxa do Cascaes',
    blurb: 'Saiu das lendas de Franklin Cascaes, de chapéu e capa roxa, pra embaralhar tua mão.',
    skin: '#e3b08a',
    shirt: '#4b2475',
    background: '#b9a8cf',
    hat: 'bruxa',
    hatColor: '#5b2a8c',
    prop: 'vassoura',
    voice: { pitch: 300, rate: 6.5, formant: 1.25 },
    unlockWins: 15,
  },
  {
    id: 'bernunca',
    name: 'Bernunça',
    blurb: 'Bicho-papão do Boi de Mamão: engole criança e pedra de dominó.',
    skin: '#2d6a4f',
    shirt: '#e9c46a',
    background: '#a7d7b8',
    hat: 'nenhum',
    hatColor: '#000000',
    prop: 'nenhum',
    voice: { pitch: 60, rate: 3.5, formant: 0.6 },
    creature: 'bernunca',
    unlockWins: 30,
  },
  {
    id: 'tainha',
    name: 'Tainha',
    blurb: 'Mascote da temporada de pesca. Escorregadia no jogo.',
    skin: '#8fa6b8',
    shirt: '#c9d6df',
    background: '#9fd3e6',
    hat: 'nenhum',
    hatColor: '#000000',
    prop: 'nenhum',
    voice: { pitch: 380, rate: 11, formant: 1.5 },
    creature: 'tainha',
    unlockWins: 50,
  },
];

export const DEFAULT_AVATAR_ID = 'veterano';

export const avatarById = (id: string): Avatar => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;

export const isAvatarUnlocked = (avatar: Avatar, totalWins: number): boolean => totalWins >= (avatar.unlockWins ?? 0);

/** Nomes dos bots que completam a mesa. */
export const BOT_PERSONAS: readonly { nickname: string; avatarId: string }[] = [
  { nickname: 'Seu Zé', avatarId: 'veterano' },
  { nickname: 'Dona Cota', avatarId: 'rendeira' },
  { nickname: 'Tião da Barra', avatarId: 'pescador' },
  { nickname: 'Dona Biluca', avatarId: 'benzedeira' },
  { nickname: 'Nenê do Mercado', avatarId: 'camarao' },
  { nickname: 'Guto', avatarId: 'surfista' },
  { nickname: 'Seu Nado', avatarId: 'mane' },
];
