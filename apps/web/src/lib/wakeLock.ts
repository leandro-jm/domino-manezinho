import { useEffect } from 'react';

/** Tela não apaga enquanto o componente está montado (e volta a pedir quando o app volta pra frente). */
export function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let done = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = () =>
      nav.wakeLock
        ?.request('screen')
        .then((l) => {
          // Saiu da tela antes do pedido voltar: solta na hora, senão a tela fica acesa fora do jogo.
          if (done) return void l.release().catch(() => undefined);
          void lock?.release().catch(() => undefined);
          lock = l;
        })
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
