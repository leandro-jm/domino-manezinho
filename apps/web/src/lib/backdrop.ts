import { load, save } from './storage';

/** Ilustrações da Praça XV usadas de fundo (geradas por scripts/make-backdrops.mjs). */
export const BACKDROPS = [1, 2, 3, 4].map((n) => `/fundos/praca-${n}.webp`);

/** Sorteia um fundo diferente do último usado (lembrado entre visitas). */
export const randomBackdrop = (): string => {
  const last = load<string | null>('dm:fundo', null);
  const options = BACKDROPS.filter((b) => b !== last);
  const pick = options[Math.floor(Math.random() * options.length)] ?? BACKDROPS[0]!;
  save('dm:fundo', pick);
  return pick;
};

/** Fundo escurecido para o texto claro por cima continuar legível. */
export const backdropStyle = (url: string, dim = 0.55) => ({
  backgroundImage: `linear-gradient(rgba(16, 26, 21, ${dim - 0.15}), rgba(16, 26, 21, ${dim + 0.15})), url(${url})`,
});
