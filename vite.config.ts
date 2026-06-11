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
// UPPDATERINGS-MODELL (T43/#74): registerType 'prompt' i stället för 'autoUpdate'.
// Appen ändras ofta och delas brett, och en TYST auto-omladdning kan rycka undan
// vyn mitt i något. Med 'prompt' installeras en ny SW men VÄNTAR; appen visar en
// diskret "ny version finns, ladda om"-prompt (UpdatePrompt) och användaren tar
// den i bruk med ETT klick (updateSW(true) -> skipWaiting + reload). Så ingen
// fastnar på en gammal cache OCH ingen får en oväntad omladdning. injectRegister:
// null = vi registrerar SJÄLVA via virtual:pwa-register (register-sw.ts), annars
// skulle pluginet auto-injicera en andra registrering vid sidan av prompt-hooken.
//
// VIKTIGT (källa: vite-plugin-pwa-docs, prompt-for-update): med registerType
// 'prompt' sätts INTE workbox skipWaiting/clientsClaim. skipWaiting skulle
// aktivera den nya SW:n direkt och kringgå prompten (då blir det de facto
// auto-update). I prompt-läget är det användarens klick (updateSW(true)) som
// posterar SKIP_WAITING och laddar om, dvs takeovern sker direkt VID klicket, inte
// först när alla flikar stängts. cleanupOutdatedCaches städar gamla precaches.
export default defineConfig({
  define: {
    // Bygg-stämpel injiceras som string-literaler (define), lästa via app-version.ts.
    // JSON.stringify så värdet blir en korrekt citerad literal i bundeln.
    __APP_SHA__: JSON.stringify(BUILD_INFO.sha),
    __APP_BUILT_AT__: JSON.stringify(BUILD_INFO.builtAt),
  },
  plugins: [
    themeNoFlashPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
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
        // Vilka filtyper som precachas. woff2 läggs till explicit så det
        // självhostade typsnittet är tillgängligt offline (annars faller texten
        // tillbaka till systemfonten utan nät, fungerande men inte premium).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // NAVIGATION FALLBACK: en single-page app utan router, alla rutter ska
        // serveras av index.html (det precachade skalet). Så en hård
        // omladdning/djuplänk offline visar appen i stället för webbläsarens
        // dino-sida. Source: vite-plugin-pwa / workbox generateSW-docs.
        navigateFallback: 'index.html',
        // Städa bort gamla precache-poster när en ny version tas i bruk (efter
        // att användaren laddat om via prompten), så cachen inte växer obegränsat.
        cleanupOutdatedCaches: true,
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
    // Sviten har vuxit (689+ tester) och flera är render-tunga integrationstester
    // (full ResultsProvider + 12 grupptabeller + inmatning). Under full parallell
    // fork-last kan en sådan rendering + async-seedning legitimt ta > 5 s, så
    // default-timeouten (5000) ger sporadiska timeouts som INTE är äkta hängningar.
    // Höjd till 15 s för marginal; isolerat kör samma tester på 1-3 s.
    testTimeout: 15000,
  },
});
