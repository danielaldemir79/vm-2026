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
  },
  // Build + serve the dist, same as the E2E config, so the shots are of the real
  // deployable artifact. We FORCE fixtures mode by passing the Supabase env vars
  // empty to the build/preview process: the data-source gate treats empty/missing
  // VITE_SUPABASE_* as "not configured" and falls back to fixtures. Without this the
  // build would inherit a developer's shell VITE_SUPABASE_* and could accidentally
  // produce live-mode (non-deterministic) screenshots. (A local .env.local with real
  // values still takes precedence in Vite's env loading, so regenerate without one.)
  webServer: {
    command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
