/** localStorage que nunca quebra o app (modo privado, armazenamento bloqueado etc.). */
export const load = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

export const save = (key: string, value: unknown): void => {
  try {
    if (value === undefined || value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sem armazenamento: segue só em memória
  }
};
