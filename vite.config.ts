/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Vite-konfiguration för VM 2026.
// PWA-skalet ger en installerbar app (manifest + service worker + ikon).
// registerType 'autoUpdate' = nya versioner tas i bruk automatiskt utan att
// användaren måste klicka, vilket passar en vänapp som delas via länk.
// Tema/design sätts i T2; här läggs bara en neutral platshållar-färgton.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Tar med statiska tillgångar som inte importeras av appen i precachen.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'VM 2026',
        short_name: 'VM 2026',
        description:
          'Följ fotbolls-VM 2026 tillsammans: matcher, tabeller, slutspelsträd och tips.',
        lang: 'sv',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
