import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const api = process.env.VITE_DEV_API ?? 'http://localhost:3001';

/** No `vite dev` não tem o servidor pra trocar o endereço público das tags de SEO (ver apps/server/src/seo.ts). */
const devOrigin = (): Plugin => ({
  name: 'origem-dev',
  apply: 'serve',
  transformIndexHtml: (html) => html.replaceAll('__ORIGEM__', 'http://localhost:5173'),
});

export default defineConfig({
  plugins: [
    react(),
    devOrigin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Atualização aplicada pelo app fora de partida (ver main.tsx), não no meio do jogo.
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'] },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Dominó Manezinho — Praça XV',
        short_name: 'Dominó Mané',
        description: 'Dominó online em duplas na mesa de concreto da Praça XV, em Florianópolis: com os amigos ou contra os bots.',
        lang: 'pt-BR',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1d2b24',
        theme_color: '#1d2b24',
        categories: ['games', 'entertainment'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  worker: { format: 'es' },
});
