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
      // Tar med statiska tillgångar som inte importeras av appen i precachen
      // (favicon, apple-touch-icon, det självhostade typsnittet). Allt under
      // public/ kopieras till dist-roten och fångas av workbox glob nedan, men
      // includeAssets gör de icke-importerade assetsen explicit precachade.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'fonts/space-grotesk.woff2'],
      // OFFLINE-STRATEGI (T13): appen är fixtures-driven, ALL data ligger i
      // bundlen, så ren PRECACHE räcker, det finns ingen server-data att hämta
      // förrän T14 (Supabase). workbox genererar en service worker som precachar
      // hela byggets statiska skal (JS/CSS/HTML/ikoner/typsnitt).
      workbox: {
        // Vilka filtyper som precachas. woff2 läggs till explicit så det
        // självhostade typsnittet är tillgängligt offline (annars faller texten
        // tillbaka till systemfonten utan nät, fungerande men inte premium).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // NAVIGATION FALLBACK: en single-page app utan router, alla rutter ska
        // serveras av index.html (det precachade skalet). Så en hård
        // omladdning/djuplänk offline visar appen i stället för webbläsarens
        // dino-sida. Source: vite-plugin-pwa / workbox generateSW-docs.
        navigateFallback: 'index.html',
        // Städa bort gamla precache-poster när en ny version tas i bruk
        // (registerType: autoUpdate), så cachen inte växer obegränsat.
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'VM 2026',
        short_name: 'VM 2026',
        description:
          'Följ fotbolls-VM 2026 tillsammans: matcher, tabeller, slutspelsträd och tips.',
        lang: 'sv',
        theme_color: '#091310',
        background_color: '#091310',
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
    // Sviten har vuxit (689+ tester) och flera är render-tunga integrationstester
    // (full ResultsProvider + 12 grupptabeller + inmatning). Under full parallell
    // fork-last kan en sådan rendering + async-seedning legitimt ta > 5 s, så
    // default-timeouten (5000) ger sporadiska timeouts som INTE är äkta hängningar.
    // Höjd till 15 s för marginal; isolerat kör samma tester på 1-3 s.
    testTimeout: 15000,
  },
});
