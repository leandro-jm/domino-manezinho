import type { ErrorCode } from '@domino/shared';

/** Erro de regra da mesa: a mensagem vai direto para o cliente no ack. */
export class RoomError extends Error {
  constructor(
    message: string,
    /** Código estável para o cliente decidir o que fazer. */
    readonly code?: ErrorCode,
  ) {
    super(message);
  }
}

export const ERR = {
  playing: 'A mesa já tá rolando',
  full: 'A mesa tá cheia, mané!',
  notOwner: 'Só o dono da mesa pode fazer isso.',
  notWaiting: 'Agora não dá, a partida tá rolando.',
  seatTaken: 'Essa cadeira já tá ocupada.',
  seatHuman: 'Essa cadeira tem gente, não dá pra botar bot.',
  needFour: 'Precisa de quatro na mesa pra começar.',
  notSeated: 'Tu não tá sentado nessa mesa.',
  otherTab: 'Essa mesa tá aberta noutra aba.',
  noMatch: 'Não tem partida rolando.',
  notYourTurn: 'Não é tua vez, calma!',
  handOver: 'Essa mão já acabou, espera a próxima.',
  illegal: 'Jogada inválida, mané!',
  notFinished: 'A partida ainda não acabou.',
  rematchMissing: 'Falta gente na mesa pra revanche.',
} as const;

export const CLOSE_REASONS = {
  abandoned: 'Todo mundo foi embora, a mesa fechou.',
  empty: 'Não sobrou ninguém na mesa.',
  otherTab: 'Tu abriste essa mesa noutra aba.',
  shutdown: 'O servidor foi reiniciar, já volta!',
} as const;
