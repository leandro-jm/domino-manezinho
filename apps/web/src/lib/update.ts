import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';

/** Versão nova baixada e esperando: a tela mostra o aviso com o botão de atualizar. */
export const useUpdate = create<{ ready: boolean }>(() => ({ ready: false }));

// Versão nova do app: nunca troca (e recarrega) no meio da partida. Fora dela, troca sozinha só quando o
// app vai pro fundo (ninguém vê a tela piscar); com o app na frente, o aviso deixa a pessoa escolher a hora.
export const inGame = () => /^\/(sala\/|treino\/jogo)/.test(window.location.pathname);
let updateReady = false;
/** O servidor recusou este app por ser velho: troca assim que a versão nova baixar, mesmo em partida. */
let forced = false;
let registration: ServiceWorkerRegistration | undefined;

const applyUpdate = () => {
  if (updateReady && (forced || !inGame())) void updateSW(true);
};

/** Botão do aviso: atualiza agora (fora de partida). */
export const updateNow = applyUpdate;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true;
    useUpdate.setState({ ready: true });
    if (forced) applyUpdate();
  },
  onRegisteredSW(_url, reg) {
    registration = reg;
  },
});
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && applyUpdate());

const RELOAD_KEY = 'dm:update-reload';

/** Busca a versão nova agora e recarrega com ela. */
export const forceUpdate = () => {
  forced = true;
  if (updateReady) return applyUpdate();
  if (registration) {
    void registration.update().catch(() => undefined);
    return;
  }
  // Sem service worker: recarrega uma vez só (se o servidor seguir recusando, não fica em laço).
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return;
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    return;
  }
  window.location.reload();
};
