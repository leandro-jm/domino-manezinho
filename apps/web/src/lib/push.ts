import { api } from './api';

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** No iPhone, push só funciona com o app instalado na tela de início (iOS 16.4+). */
export const pushNeedsInstall = () => isIOS() && !isStandalone();

const keyToBytes = (base64: string) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const currentSubscription = async (): Promise<PushSubscription | null> => {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
};

/** Pede permissão e registra o aparelho no servidor. Devolve mensagem de erro ou null. */
export const enablePush = async (): Promise<string | null> => {
  if (!pushSupported()) return 'Esse navegador não aceita notificações.';
  if (pushNeedsInstall()) return 'No iPhone, instala o app na tela de início primeiro (Compartilhar → Adicionar à Tela de Início).';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Notificações bloqueadas. Libera nas configurações do navegador.';
  const { publicKey } = await api.pushKey();
  if (!publicKey) return 'O servidor ainda não tá mandando notificações.';
  // ready nunca resolve se o service worker não registrou (modo privado, SW desligado).
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);
  if (!reg) return 'O app ainda não terminou de instalar. Recarrega a página e tenta de novo.';
  const key = keyToBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Inscrição feita com outra chave do servidor (chave trocada): o serviço de push recusaria tudo.
  const oldKey = sub?.options.applicationServerKey;
  if (sub && oldKey && !sameBytes(new Uint8Array(oldKey), key)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await sendSubscription(sub);
  return null;
};

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

const sendSubscription = async (sub: PushSubscription) => {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.subscribePush({ endpoint: json.endpoint, keys: json.keys });
};

/**
 * Reenvia a inscrição que o aparelho já tem para o jogador atual (token novo depois de recadastro
 * ou de trazer o perfil de outro aparelho): senão as notificações continuam indo pro jogador antigo.
 */
export const resyncPush = async (): Promise<void> => {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await sendSubscription(sub);
};

export const disablePush = async () => {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
};
