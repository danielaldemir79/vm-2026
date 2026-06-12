// Playwright-konfiguration för VM 2026:s E2E-svit (T25, #25).
//
// VARFÖR mot `vite preview` (det BYGGDA dist:et), inte `vite dev`: E2E ska köra
// mot artefakten som faktiskt deployas (minifierad, code-splittad, SW-precachad),
// så sviten fångar bygg-/chunk-fel som dev-servern döljer. webServer nedan kör
// `npm run build` + `vite preview`, så `npm run test:e2e` är ETT kommando som
// bygger och testar.
//
// FIXTURES-LÄGE I CI (ingen live-DB): vi sätter MEDVETET INGA VITE_SUPABASE_*-env
// här. Datalagrets gata (data-source.ts) faller då till fixtures, och alla sociala
// providers (rum, tips, topplista, admin) är vilande (enabled=false). Sviten testar
// alltså det deterministiska fixtures-skalet, aldrig en nätverks-beroende live-väg,
// så den är stabil i CI och kräver inga hemligheter. Sociala ytor som BARA finns i
// live-läge testas inte här (de har enhets-/integrationstester mot injicerad env).
//
// E2E KÖRS SEPARAT från enhetstesterna: `npm test` (Vitest) rör INTE denna fil
// (testDir 'e2e' ligger utanför Vitest include 'src'), och `npm run test:e2e`
// kör BARA Playwright. Se docs/decisions.md (T25) + README för hur man kör.

import { defineConfig, devices } from '@playwright/test';

// Preview-porten. Vite previews standard är 4173; vi låser den explicit så
// baseURL och webServer.url är EN sanning och inte kan drifta.
const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Ingen .only ska kunna smita in i CI och tysta resten av sviten.
  forbidOnly: !!process.env.CI,
  // Inga tysta omtag som maskerar flakighet: ett rött test ska vara rött. En
  // begränsad retry i CI (1) jämnar bara ut infrastruktur-hick (port/preview-
  // uppstart), inte app-flakighet, lokalt 0 så vi ser sanningen direkt.
  retries: process.env.CI ? 1 : 0,
  // Deterministisk, sekventiell körning lokalt (1 worker) håller loggen läsbar
  // och undviker att flera preview-flikar slåss om samma port-resurs. Sviten är
  // liten (fokuserad), så detta kostar inget nämnvärt.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // Spår + skärmdump bara när ett test FALLERAR, så vi kan felsöka utan att
    // svälla artefakter vid grön körning.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Bygg + servera dist:et automatiskt. reuseExistingServer lokalt så en redan
  // körande preview återanvänds (snabbare iteration); i CI startas alltid en ren.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Bygget kan ta en stund (tsc -b + vite build); generös men inte oändlig.
    timeout: 120_000,
  },
});
