import type { PracticeResultBody } from '@domino/shared';
import { ApiError, api } from '../lib/api';
import { load, save } from '../lib/storage';
import { useProfile } from '../store/profile';

const KEY = 'dm:practice:pending';
/** Treino jogado offline por muito tempo: guarda os mais recentes. */
const MAX_PENDING = 20;
/** O servidor aceita um treino a cada 30 s por jogador. */
const COOLDOWN_RETRY_MS = 31_000;

const pending = (): PracticeResultBody[] => {
  const list = load<unknown>(KEY, []);
  return Array.isArray(list) ? (list as PracticeResultBody[]) : [];
};

let flushing = false;
let retry: ReturnType<typeof setTimeout> | null = null;

/** Guarda o resultado do treino e tenta mandar; sem rede, vai na próxima vez que o app sincronizar. */
export const reportPractice = (result: PracticeResultBody): Promise<void> => {
  save(KEY, [...pending(), result].slice(-MAX_PENDING));
  return flushPracticeResults();
};

/** Manda os treinos pendentes, um por vez e em ordem. */
export const flushPracticeResults = async (): Promise<void> => {
  if (flushing || !useProfile.getState().token) return;
  flushing = true;
  try {
    for (let list = pending(); list.length; list = pending()) {
      try {
        useProfile.getState().setProfile(await api.practice(list[0]!));
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 400) {
          // Sem rede, servidor fora ou token velho: fica para depois. Devagar demais: espera o intervalo.
          if (err instanceof ApiError && err.status === 429 && !retry) {
            retry = setTimeout(() => {
              retry = null;
              void flushPracticeResults();
            }, COOLDOWN_RETRY_MS);
          }
          return;
        }
        // Recusado de vez: não adianta mandar de novo.
      }
      save(KEY, pending().slice(1));
    }
  } finally {
    flushing = false;
  }
};
