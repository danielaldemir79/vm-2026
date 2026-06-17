/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildThemeInitScript } from './src/theme/theme-init';
import { VM_2026_MANIFEST } from './src/pwa/app-manifest';
import { resolveBuildInfo } from './src/pwa/build-info';

// Läs git-HEAD vid bygge. FAIL-SOFT (inte fatalt): ett bygge utan git-historik
// (Cloudflare grund-clone, nedladdad tarball) ska INTE krascha, bara sakna den
// lokala vägen och falla till CF_PAGES_COMMIT_SHA eller "unknown". Felet sväljs
// därför HÄR men ger null så build-info ser frånvaron (ingen maskerad default).
function readGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// Bygg-stämpeln (commit-SHA + byggtid) löses EN gång per bygge: Cloudflare sätter
// CF_PAGES_COMMIT_SHA (auktoritativ i produktion), annars git rev-parse lokalt,
// annars "unknown". Den injiceras som define-konstanter nedan så appen kan visa
// exakt vilket bygge som är live (debug-agentens "är det live?"-förbättring, #74).
// Node-läsningarna (git, process.env) bor HÄR; regeln + fallbacken i den rena,
// testbara build-info.ts. Se docs/decisions.md.
const BUILD_INFO = resolveBuildInfo(process.env.CF_PAGES_COMMIT_SHA, readGitSha());

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
//
// UPPDATERINGS-MODELL (HOTFIX, ersätter T43:s 'prompt'): TYST AUTO-UPPDATERING.
// registerType 'autoUpdate' + workbox skipWaiting:true + clientsClaim:true. En ny
// SW INSTALLERAS, AKTIVERAS direkt (skipWaiting) och TAR ÖVER alla öppna flikar
// (clientsClaim). register-sw.ts laddar sedan om sidan EN gång när den nya SW:n tar
// kontroll (controllerchange), så användaren ser senaste versionen UTAN något
// manuellt handgrepp (ingen "rensa cache", ingen klick-prompt).
//
// VARFÖR bytet från 'prompt' (Daniels krav): 'prompt' visar en "ny version finns"-
// ruta som användaren klickar. Men den rutan finns BARA i den nya kodens UI, och
// den koden kör inte förrän man redan tagit i bruk den nya versionen, en moment-22:
// själva FÖRSTA hoppet in i en ny version kan inte visa någon prompt och fastnar
// (gammal SW serverar gammalt skal). Det drabbade Daniels enhet. Appen ska delas
// med OTEKNISKA vänner, så uppdateringen MÅSTE ske autonomt. skipWaiting+clientsClaim
// gör att den nya SW:n tar över av sig själv, oberoende av vilken kod som råkar köra.
//
// injectRegister: null = vi registrerar SJÄLVA via virtual:pwa-register
// (register-sw.ts), där controllerchange -> reload bor. cleanupOutdatedCaches städar
// gamla precaches när den nya SW:n tar över.
export default defineConfig({
  define: {
    // Bygg-stämpel injiceras som string-literaler (define), lästa via app-version.ts.
    // JSON.stringify så värdet blir en korrekt citerad literal i bundeln.
    __APP_SHA__: JSON.stringify(BUILD_INFO.sha),
    __APP_BUILT_AT__: JSON.stringify(BUILD_INFO.builtAt),
  },
  build: {
    // CODE-SPLITTING (T25, KA-F4-pinnen från T13 "manualChunks om LCP-problem"):
    // bundlen var EN monolitisk chunk (~895 kB / ~246 kB gzip), så ALLT, app-koden
    // OCH alla tunga vendor-paket, laddades och parsades som ett enda block. Vi
    // delar de STORA, SÄLLAN-ÄNDRADE vendor-paketen till egna chunks så att:
    //   1. app-koden (den som ändras varje deploy) inte invaliderar vendor-cachen
    //      vid varje release, en återbesökare hämtar bara den lilla app-delta:n.
    //   2. de tre vendorerna laddas parallellt i stället för seriellt-inbäddat.
    // VARFÖR just dessa tre: react/react-dom (renderaren, tyngst), motion
    // (animations-motorn) och @supabase/supabase-js (live-klienten) är de enda
    // riktigt tunga, tredjeparts-beroendena. supabase-js dras dessutom bara in via
    // dynamisk import (data-source.ts) i live-läge, så i fixtures-bygget hamnar den
    // i en egen, vilande chunk som aldrig laddas. INGEN per-vy-lazy-load: appen är
    // EN skroll-sida där alla sektioner renderas direkt (ingen router), så att
    // Suspense-dela mitt-på-sidan-sektioner skulle lägga till komplexitet utan att
    // krympa det INITIALA innehållet (de syns redan vid laddning). Vendor-splitten
    // är den värdefulla, låg-risk-vinsten. Före/efter-siffror: docs/decisions.md (T25).
    rollupOptions: {
      output: {
        manualChunks: {
          // Matchar både 'react'/'react-dom' OCH deras interna djup (react-dom/client,
          // scheduler dras in transitivt) genom att Rollup grupperar allt vars
          // modul-id faller under dessa paket-rötter. Nyckeln blir chunk-filnamnet.
          'react-vendor': ['react', 'react-dom'],
          'motion-vendor': ['motion'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
  plugins: [
    themeNoFlashPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
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
        // PUSH-HANTERARE (T85, #177): vi BEHÅLLER generateSW (byter INTE till
        // injectManifest), och injicerar våra egna push-/notificationclick-lyssnare i
        // den genererade service workern via importScripts. custom-push-sw.js ligger i
        // public/ (kopieras till dist-roten), så sökvägen är rot-relativ. Den importeras
        // FÖRST i den genererade SW:n, så lyssnarna registreras i samma SW-scope som
        // workbox-precachen. Källa: vite-plugin-pwa / workbox generateSW importScripts-
        // docs. Se docs/decisions.md (T85).
        importScripts: ['custom-push-sw.js'],
        // Vilka filtyper som precachas. woff2 läggs till explicit så det
        // självhostade typsnittet är tillgängligt offline (annars faller texten
        // tillbaka till systemfonten utan nät, fungerande men inte premium).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // NAVIGATION FALLBACK: en single-page app utan router, alla rutter ska
        // serveras av index.html (det precachade skalet). Så en hård
        // omladdning/djuplänk offline visar appen i stället för webbläsarens
        // dino-sida. Source: vite-plugin-pwa / workbox generateSW-docs.
        navigateFallback: 'index.html',
        // Städa bort gamla precache-poster när en ny version tas i bruk, så cachen
        // inte växer obegränsat.
        cleanupOutdatedCaches: true,
        // TYST AUTO-UPPDATERING (hotfix, källa: workbox/vite-plugin-pwa autoUpdate):
        // den nya SW:n hoppar över "waiting"-läget och AKTIVERAS direkt (skipWaiting),
        // och TAR ÖVER de redan öppna sidorna (clientsClaim). Tillsammans med
        // controllerchange -> reload i register-sw.ts ser en användare den nya
        // versionen utan något manuellt handgrepp. Detta är det avgörande som gör
        // uppdateringen autonom även för otekniska vänner (Daniels krav).
        skipWaiting: true,
        clientsClaim: true,
      },
      // Manifestet bor i en egen ren modul (src/pwa/app-manifest.ts) så dess
      // WebAPK-mintningskrav (id, separat maskable-ikon, 192+512) kan källankras
      // av ett test utan att bygga dist. Se T30/#50 + decisions.md.
      manifest: VM_2026_MANIFEST,
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // Vitest äger BARA enhets-/komponenttesterna under src/. E2E-sviten (e2e/*.spec.ts)
    // körs av Playwright via `npm run test:e2e`, ALDRIG av Vitest (T25): Playwrights
    // test.describe kraschar under Vitest ("did not expect test.describe() to be called
    // here"). Default-globben skulle annars plocka upp e2e/*.spec.ts. Vi pinnar därför
    // include till src/ så de två svitarna är helt åtskilda. Se docs/decisions.md (T25).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Sviten har vuxit (689+ tester) och flera är render-tunga integrationstester
    // (full ResultsProvider + 12 grupptabeller + inmatning). Under full parallell
    // fork-last kan en sådan rendering + async-seedning legitimt ta > 5 s, så
    // default-timeouten (5000) ger sporadiska timeouts som INTE är äkta hängningar.
    // Höjd till 15 s för marginal; isolerat kör samma tester på 1-3 s.
    testTimeout: 15000,
  },
});
