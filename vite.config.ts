/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildThemeInitScript } from './src/theme/theme-init';

// No-flash tema-injektion. Detta är React + Vites motsvarighet till Astros
// define:vars: i stället för att handkopiera tema-nyckel/attribut/default som
// magiska strängar in i index.html (vilket tyst skulle driva isär från
// theme-constants.ts), GENERERAS det blockerande inline-scriptets innehåll från
// samma konstanter (buildThemeInitScript) och injiceras i <head> här, en sanning.
//
// injectTo: 'head-prepend' lägger scriptet FÖRST i <head>, före stylesheet och
// modul-script, så data-theme sätts på <html> innan CSS:en appliceras och innan
// första paint (ingen FOUC). Object-formen är robustare än sträng-ersättning av
// </head> (Vite äger placeringen). Se docs/decisions.md och theme-init.ts.
function themeNoFlashPlugin(): Plugin {
  return {
    name: 'vm-theme-no-flash',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: buildThemeInitScript(),
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// Vite-konfiguration för VM 2026.
// PWA-skalet ger en installerbar app (manifest + service worker + ikon).
// registerType 'autoUpdate' = nya versioner tas i bruk automatiskt utan att
// användaren måste klicka, vilket passar en vänapp som delas via länk.
// Tema/design sätts i T2; här läggs bara en neutral platshållar-färgton.
export default defineConfig({
  plugins: [
    themeNoFlashPlugin(),
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
