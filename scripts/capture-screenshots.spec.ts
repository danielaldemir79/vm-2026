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
//
// WHAT THE SET SHOWS (the current FIVE-TAB app: Idag/Tips/Topplista/Turnering/Mer):
// the views below are chosen to read as a cohesive product tour and to land on what
// fixtures mode actually renders (every shot is a real, populated view, never faked):
//   - Idag, with the LIVE-NOW panel leading (a match is in progress in fixtures, so
//     the daily view leads with the live block, not the static countdown hero), in
//     dark and light theme.
//   - Turnering: the live group tables, and the rich tournament statistics (top
//     scorers + the stats cards), both populated from the bundled demo data.
//   - Topplista: the global (cross-room) leaderboard, populated with the demo field.
//   - A team profile modal.
//   - The mobile layout (the primary surface for friends in a group chat).
//
// HONESTY NOTE (fixtures limits): the "Se höjdpunkter" link only appears on a
// FINISHED match card, and the dynamic knockout bracket only fills once group
// results exist. In fixtures mode every scheduled match has no result, so neither is
// captured here (they are not faked); both are described in the README feature tour.

import { test, expect, type Page } from '@playwright/test';
import { openApp, gotoTab } from '../e2e/helpers';

const OUT = 'docs/screenshots';

/**
 * Dismiss the transient "Klar att användas offline" / "Ny version finns" prompt the
 * built service worker raises on load, so it never sits over the bottom of a shot.
 * It is a real, dismissable UI element (a friend would close it too); closing it is
 * not faking anything. The prompt is fired ASYNCHRONOUSLY by the service worker's
 * offline-ready event, so it can appear AFTER the first page load and even re-render
 * after a tab switch/scroll. We therefore (1) give it a short window to appear, then
 * (2) dismiss it, and call this RIGHT BEFORE each screenshot (after any scroll) so a
 * late prompt never lands in the frame. No-op if it never shows.
 */
async function dismissUpdatePrompt(page: Page): Promise<void> {
  const dismiss = page.locator('[data-update-dismiss]');
  // Give the SW-driven prompt a brief chance to mount (it is async); ignore timeout
  // (it may simply never appear, which is fine).
  await dismiss
    .first()
    .waitFor({ state: 'visible', timeout: 3000 })
    .catch(() => {});
  if ((await dismiss.count()) > 0) {
    await dismiss.first().click();
    await dismiss
      .first()
      .waitFor({ state: 'detached' })
      .catch(() => {});
  }
}

// IDAG, dark: a match is live in fixtures, so the day view LEADS with the live-now
// panel (live clock + scoreline + goalscorers) over the "next kickoff" countdown.
// A viewport shot (not fullPage) frames the above-the-fold: flik-title + live block +
// the next-kickoff pillar, the app's first impression.
test('idag, live panel (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 980 });
  await openApp(page, { theme: 'dark' });
  // Assert the live panel is actually present (the lead this shot is built around) and
  // that its clock shows a real in-play minute (not the "45+"/"Slut" degraded cap), so
  // we never commit a shot of a frozen/capped clock. A live snapshot's elapsed minute is
  // a number like "29'"; we require a digit-led minute, not a boundary/finished label.
  await page.locator('[data-live-now]').waitFor();
  const clock = (
    await page.locator('[data-live-clock], .vm-live-clock').first().innerText()
  ).trim();
  expect(clock).toMatch(/^\d/);
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/01-idag-live-dark.png` });
});

// IDAG, light: same lead, light theme, to show the dual-theme polish.
test('idag, live panel (light)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 980 });
  await openApp(page, { theme: 'light' });
  await page.locator('[data-live-now]').waitFor();
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/02-idag-live-light.png` });
});

// TURNERING, group tables: the live-computed standings for all 12 groups. The
// Turnering tab opens at the top (Grupper section), so a viewport shot frames the
// group cards.
test('turnering, group tables (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openApp(page, { theme: 'dark' });
  await gotoTab(page, 'Turnering');
  const groups = page.locator('#turnering-grupper');
  await groups.waitFor();
  await groups.scrollIntoViewIfNeeded();
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/03-group-stage.png` });
});

// TURNERING, tournament statistics: the rich "fun VM stats" surface. We frame the
// Skytteliga (top scorers) section, which leads straight into the stats cards below,
// both populated from the bundled demo events.
test('turnering, tournament stats (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await openApp(page, { theme: 'dark' });
  await gotoTab(page, 'Turnering');
  const scorer = page.locator('#turnering-skytteligan');
  await scorer.waitFor();
  // Assert the scorer list actually has rows (a populated demo skytteliga), so we never
  // commit an empty stats shot.
  await expect(page.locator('[data-scorer-view] [data-player-id]').first()).toBeVisible();
  await scorer.scrollIntoViewIfNeeded();
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/04-tournament-stats.png` });
});

// TOPPLISTA, global leaderboard: the cross-room ranking, populated with the demo
// field (~240 participants + the highlighted "you" row + your-placing summary).
test('topplista, global leaderboard (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openApp(page, { theme: 'dark' });
  await gotoTab(page, 'Topplista');
  const view = page.locator('[data-total-leaderboard-view]');
  await view.waitFor();
  await view.scrollIntoViewIfNeeded();
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/05-global-leaderboard.png` });
});

// Team profile modal: rankings, star player, trivia, path through the group.
test('team profile modal (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, { theme: 'dark' });
  // Dismiss the SW prompt BEFORE opening the modal: once the dialog overlay is up, the
  // prompt sits behind it (a click would be intercepted), so clear it first.
  await dismissUpdatePrompt(page);
  const teamButton = page.getByRole('button', { name: /^Visa lagprofil för / }).first();
  await teamButton.waitFor();
  await teamButton.click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: `${OUT}/06-team-profile.png` });
});

// Mobile viewport (iPhone-ish): the app is a PWA shared in a group chat, so the
// phone layout is the primary one for friends. Full page on a single mobile tab.
test('mobile idag (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, { theme: 'dark' });
  await page.locator('[data-live-now]').waitFor();
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/07-mobile-idag-dark.png`, fullPage: true });
});
