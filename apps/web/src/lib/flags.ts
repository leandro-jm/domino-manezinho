/** Feature flags do cliente. Tudo nasce desligado; liga-se em build com `VITE_FLAG_<NOME>=true`. */
export type Flag = 'sobre-projeto-botao';

type Env = Record<string, string | boolean | undefined>;

export const flagEnabled = (flag: Flag, env: Env = import.meta.env as Env): boolean => {
  const v = env[`VITE_FLAG_${flag.toUpperCase().replace(/-/g, '_')}`];
  return v === true || v === 'true' || v === '1';
};

export const sobreProjetoBotao = (env?: Env): boolean => flagEnabled('sobre-projeto-botao', env);
