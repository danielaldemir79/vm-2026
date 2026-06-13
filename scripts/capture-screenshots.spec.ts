// One-off screenshot capture for the README (run manually, not part of CI).
//
// WHY a Playwright test file and not part of e2e/: it reuses the exact same
// fixtures-mode setup as the E2E suite (openApp: deterministic theme, onboarding
// dismissed, fixtures data, no Supabase env) so the shots reflect the real built
// app, but it lives under scripts/ so the CI E2E suite (testDir: 'e2e') never picks
// it up. Run with:
//   npx playwright test scripts/capture-screenshots.spec.ts --config scripts/screenshots.config.ts
//
// Output goes to docs/screenshots/. The shots are committed so the README renders
// on GitHub long after the live site is gone (the whole point of this task).

import { test } from '@playwright/test';
import { openApp } from '../e2e/helpers';

const OUT = 'docs/screenshots';

// Desktop, dark theme: the full scroll-page (every section in one tall image) gives
// a reviewer the complete surface at a glance.
test('home, full page (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, { theme: 'dark' });
  await page.screenshot({ path: `${OUT}/01-home-full-dark.png`, fullPage: true });
});

// Above-the-fold hero + daily matches (dark): the first impression.
test('hero + daily matches (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, { theme: 'dark' });
  await page.screenshot({ path: `${OUT}/02-hero-daily-dark.png` });
});

// Light theme above-the-fold: prove the dual-theme polish.
test('hero + daily matches (light)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, { theme: 'light' });
  await page.screenshot({ path: `${OUT}/03-hero-daily-light.png` });
});

// Group stage, expanded: the live tables surface.
test('group stage tables', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openApp(page, { theme: 'dark' });
  const topToggle = page.locator('[data-groups-toggle][data-groups-toggle-position="top"]');
  await topToggle.waitFor();
  // Expandera BARA om sektionen är hopfälld (toggeln erbjuder "expand" då); klicka aldrig
  // en redan utfälld sektion (det skulle fälla ihop den). Vänta tills expansionen satt sig
  // (toggeln flippar till "collapse") innan skärmdumpen, så vi inte fångar den mitt i.
  if ((await topToggle.getAttribute('data-groups-toggle')) === 'expand') {
    await topToggle.click();
    await page
      .locator(
        '[data-groups-toggle][data-groups-toggle-position="top"][data-groups-toggle="collapse"]'
      )
      .waitFor();
  }
  const heading = page.getByRole('heading', { name: 'Gruppspelet', exact: true });
  await heading.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/04-group-stage.png` });
});

// Team profile modal: rankings, star players, trivia.
test('team profile modal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, { theme: 'dark' });
  const teamButton = page.getByRole('button', { name: /^Visa lagprofil för / }).first();
  await teamButton.waitFor();
  await teamButton.click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: `${OUT}/05-team-profile.png` });
});

// Mobile viewport (iPhone-ish): the app is a PWA shared in a group chat, so the
// phone layout is the primary one for friends.
test('mobile home (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, { theme: 'dark' });
  await page.screenshot({ path: `${OUT}/06-mobile-home-dark.png`, fullPage: true });
});
