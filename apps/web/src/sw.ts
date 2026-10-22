/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import type { WorkboxPlugin } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// Versão nova espera o app pedir (fora de partida) para assumir: assumir sozinha recarregava a tela no meio do jogo.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
clientsClaim();

/** Só guarda arquivo de verdade: 200 e não HTML (fallback de SPA no lugar de um modelo/som que sumiu). */
const onlyRealFiles: WorkboxPlugin = {
  cacheWillUpdate: async ({ response }) =>
    response.status === 200 && !response.headers.get('content-type')?.includes('text/html') ? response : null,
};
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// App de página única: qualquer navegação abre o index (funciona offline), menos API e socket.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//, /^\/socket\.io\//] }));

// Modelos 3D das pessoas (~3 MB): ficam guardados pra jogar offline. Os nomes não têm hash, então
// revalida em segundo plano (o servidor responde 304 se não mudou) para um modelo novo chegar na próxima abertura.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/models/'),
  new StaleWhileRevalidate({
    cacheName: 'praca-modelos',
    plugins: [onlyRealFiles, new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 })],
  }),
);

// Música e falas gravadas: baixam na primeira vez que tocam e ficam pra jogar offline.
registerRoute(
  ({ url }) => url.origin === self.location.origin && /\.(mp3|m4a|ogg|opus|wav)$/.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'praca-sons',
    plugins: [onlyRealFiles, new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 })],
  }),
);

// Panorama/fotos da praça: cache longo.
registerRoute(
  ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
  new CacheFirst({
    cacheName: 'praca-imagens',
    plugins: [onlyRealFiles, new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 60 })],
  }),
);

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'Dominó Manezinho', body: 'Tem coisa rolando na Praça XV!' };
  try {
    data = { ...data, ...(event.data?.json() as PushPayload) };
  } catch {
    // payload não é JSON: usa o texto padrão
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

// O navegador trocou a inscrição (expirou, chave girou): faz outra na hora. O servidor fica sabendo quando o app
// abrir (o SW não tem o token do jogador para avisar sozinho).
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as ExtendableEvent & { oldSubscription?: PushSubscription | null };
  const key = e.oldSubscription?.options.applicationServerKey;
  if (!key) return;
  e.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then(() => undefined));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string })?.url ?? '/', self.location.origin);
  // Notificação só abre página do próprio app (nada de redirecionar pra fora).
  const url = target.origin === self.location.origin ? target.href : new URL('/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        // navigate() falha em aba que o SW ainda não controla: aí abre uma nova.
        const moved = await existing.navigate(url).catch(() => null);
        if (!moved) await self.clients.openWindow(url);
      } else await self.clients.openWindow(url);
    })(),
  );
});
