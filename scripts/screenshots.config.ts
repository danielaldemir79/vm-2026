// Playwright config for the one-off README screenshot capture (run manually).
//
// Mirrors playwright.config.ts exactly for the parts that matter (build + vite
// preview against the BUILT dist, FIXTURES mode with no Supabase env, Desktop
// Chrome), but points testDir at scripts/ so it only runs the capture spec, never
// the real E2E suite. Kept separate so the deterministic CI E2E config stays clean.

import { defineConfig, devices } from '@playwright/test';

const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: 'capture-screenshots.spec.ts',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    ...devices['Desktop Chrome'],
    // Force reduced motion så alla transitioner (kollaps-expansion, modal-öppning) blir
    // momentana , skärmdumparna committas och ska vara stabila, inte fångade mitt i en
    // animation (timing-känsligt). Speglar appens egen reduced-motion-väg (WCAG 2.3.3).
    reducedMotion: 'reduce',
  },
  // Build + serve the dist, same as the E2E config, so the shots are of the real
  // deployable artifact. We FORCE fixtures mode by passing the Supabase env vars
  // empty to the build/preview process: the data-source gate treats empty/missing
  // VITE_SUPABASE_* as "not configured" and falls back to fixtures. These explicit
  // process.env values WIN over a developer's shell vars AND over a local .env.local
  // (Vite's loadEnv lets prefixed process.env override .env files), so fixtures mode
  // is guaranteed regardless of the developer's environment.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    // Always start our OWN build/preview (never reuse a server already on the port):
    // a reused server would skip the forced-empty Supabase env below and could serve
    // stale or live-mode (non-deterministic) screenshots (Copilot, PR #164).
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
