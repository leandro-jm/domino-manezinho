/**
 * Feature flags do cliente. Tudo nasce desligado. Liga em runtime quando o servidor devolve a flag em /api/flags
 * (FEATURE_FLAGS, separadas por vírgula) ou, opcionalmente, em build com `VITE_FLAG_<NOME>=true`.
 */
export type Flag = 'sobre-projeto-botao';

type Env = Record<string, string | boolean | undefined>;

let runtimeFlags = new Set<string>();

export const setRuntimeFlags = (flags: readonly string[]) => {
  runtimeFlags = new Set(flags);
};

/** Busca as flags do servidor; falha de rede deixa tudo desligado. */
export const loadRuntimeFlags = async (base = ''): Promise<void> => {
  try {
    const res = await fetch(`${base}/api/flags`, { cache: 'no-store' });
    const body = (await res.json()) as { flags?: unknown };
    if (res.ok && Array.isArray(body.flags)) setRuntimeFlags(body.flags.filter((f): f is string => typeof f === 'string'));
  } catch {
    /* offline ou servidor fora: flags desligadas */
  }
};

export const flagEnabled = (flag: Flag, env: Env = import.meta.env as Env): boolean => {
  if (runtimeFlags.has(flag)) return true;
  const v = env[`VITE_FLAG_${flag.toUpperCase().replace(/-/g, '_')}`];
  return v === true || v === 'true' || v === '1';
};

export const sobreProjetoBotao = (env?: Env): boolean => flagEnabled('sobre-projeto-botao', env);
