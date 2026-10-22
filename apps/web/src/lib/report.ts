import type { ClientErrorBody, ClientErrorKind } from '@domino/shared';
import { API_BASE } from './api';

/** Por sessão: o mesmo erro só vai uma vez, e no máximo isso no total (laço de erro não vira enxurrada). */
const MAX_PER_SESSION = 20;
const sent = new Set<string>();

/**
 * Manda o erro pro servidor (log e métrica) sem atrapalhar nada: sem rede, sem servidor ou com o
 * navegador fechando a aba, só não vai. Usa sendBeacon quando dá, que sobrevive à aba fechando.
 */
export const reportError = (kind: ClientErrorKind, err: unknown): void => {
  const e = err instanceof Error ? err : null;
  const message = (e?.message ?? String(err)).slice(0, 500);
  const fingerprint = `${kind}:${message}`;
  if (sent.has(fingerprint) || sent.size >= MAX_PER_SESSION) return;
  sent.add(fingerprint);
  const body: ClientErrorBody = { kind, message, stack: e?.stack?.slice(0, 4000), path: window.location.pathname };
  const url = `${API_BASE}/api/client-errors`;
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.(url, new Blob([json], { type: 'application/json' }))) return;
  } catch {
    // cai no fetch
  }
  void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(() => undefined);
};

/** Erros que escapam de tudo (script e promessa sem catch). */
export const watchGlobalErrors = (): void => {
  window.addEventListener('error', (e) => reportError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason));
};
