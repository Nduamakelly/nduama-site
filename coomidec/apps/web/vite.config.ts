import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // jamais de rechargement pendant une saisie
      includeAssets: ['icone-192.png', 'icone-512.png'],
      manifest: {
        name: 'COOMIDEC — Gestion de site',
        short_name: 'COOMIDEC',
        description: 'Saisie des opérations de site minier, hors ligne',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f1f2f1',
        theme_color: '#a2501c',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Prend le contrôle dès la première installation : sans cela, une
        // tablette neuve ne serait hors-ligne-capable qu'au lancement suivant.
        clientsClaim: true,
        // …mais jamais d'activation forcée d'une nouvelle version : elle
        // rechargerait l'application pendant qu'un agent saisit une opération.
        skipWaiting: false,
        // Les écritures ne passent JAMAIS par le réseau : rien à mettre en cache
        // côté POST. Seules les lectures de référentiels sont servies au réseau
        // d'abord, avec repli sur le cache quand la connexion manque.
        runtimeCaching: [
          {
            urlPattern: /\/api\/(matieres|sites|unites|creuseurs|parametres)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'referentiels',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
});
