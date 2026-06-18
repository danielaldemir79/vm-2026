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
//   - Idag, framed on the upcoming match cards ("Nästa avspark" countdown + the day's
//     scheduled matches with kickoff time, Swedish TV channel, venue and FIFA ranking),
//     in dark and light theme.
//   - Turnering: the live group tables, and the rich tournament statistics (top
//     scorers + the stats cards), both populated from the bundled demo data.
//   - Topplista: the global (cross-room) leaderboard, populated with the demo field.
//   - A team profile modal.
//   - The mobile layout (the primary surface for friends in a group chat).
//
// WHY NOT LEAD WITH THE LIVE-NOW PANEL: in fixtures mode the bundled live snapshot is
// a 0-0 in-play scoreline carrying a rich event blob borrowed from a DIFFERENT match
// (goalscorers from the wrong teams, a 90+' event under a sub-30' clock). With real
// live data the panel is coherent; in fixtures it reads as a data bug, so the Idag
// shots are framed on the upcoming-match surface (the "Nästa avspark" pillar onwards),
// which is internally consistent. The live-now panel sits above that frame and is
// described in the README feature tour rather than shown.
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

/**
 * Scroll the Idag view so it is framed on the UPCOMING-match surface and capture a
 * viewport shot. We anchor the "Nästa avspark" countdown pillar just below the sticky
 * header band: that places the coherent surface (countdown -> day navigation -> the
 * day's scheduled match cards with TV channel / venue / FIFA ranking) in frame, and
 * pushes the fixtures live-now panel (the incoherent 0-0-with-foreign-goalscorers
 * artefact) ABOVE the frame. We assert the day list actually has a populated match card
 * so we never commit an empty frame. The countdown pillar only exists while a match is
 * live (in fixtures it always is), so we wait for it, then scroll it into place.
 *
 * The app header is `position: sticky; top: 0` on every breakpoint, so a plain
 * scrollIntoView({ block: 'start' }) would tuck the pillar's top edge UNDER it
 * (clipping the countdown tiles). On DESKTOP the tab bar is also sticky directly under
 * the header (so the top band = header + tab bar); on MOBILE the tab bar is a FIXED
 * BOTTOM bar (not part of the top band). We therefore measure the TOP sticky band's
 * bottom from the DOM (the header always, plus the tab bar only when it sits at the
 * top) and scroll so the pillar's top lands a small gap below it, so the "Nästa
 * avspark" pillar reads in full on both layouts (no magic numbers, no clipping).
 */
async function frameUpcomingMatches(page: Page): Promise<void> {
  const pillar = page.locator('[data-next-kickoff]');
  await pillar.waitFor();
  // Assert a real, populated match card is in the day list (never an empty frame).
  await expect(page.locator('[data-match-card]').first()).toBeVisible();
  await pillar.evaluate((el) => {
    const GAP = 16; // breathing room below the sticky band
    const header = document.querySelector('[data-app-header]');
    let bandBottom = header ? header.getBoundingClientRect().bottom : 0;
    // Include the tab bar in the top band only when it sits at the TOP (desktop sticky
    // row), not when it is the fixed BOTTOM bar (mobile): a top-positioned tab bar has
    // its top within the upper region of the viewport.
    const tabBar = document.querySelector('[role="tablist"]');
    if (tabBar) {
      const rect = tabBar.getBoundingClientRect();
      if (rect.top < window.innerHeight / 2) {
        bandBottom = Math.max(bandBottom, rect.bottom);
      }
    }
    const pillarTop = el.getBoundingClientRect().top;
    // Move the page so the pillar top lands GAP px under the top sticky band's bottom.
    window.scrollBy({ top: pillarTop - bandBottom - GAP, behavior: 'instant' });
  });
}

// IDAG, dark: framed on the upcoming matches. The "Nästa avspark" countdown leads,
// followed by the day navigation and the day's scheduled match cards (kickoff time,
// Swedish TV channel, venue, FIFA ranking). A viewport shot (not fullPage) frames this
// coherent surface; the fixtures live-now panel sits above the frame (see header note).
test('idag, upcoming matches (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 980 });
  await openApp(page, { theme: 'dark' });
  await frameUpcomingMatches(page);
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/01-idag-dark.png` });
});

// IDAG, light: same framing, light theme, to show the dual-theme polish.
test('idag, upcoming matches (light)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 980 });
  await openApp(page, { theme: 'light' });
  await frameUpcomingMatches(page);
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/02-idag-light.png` });
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
// phone layout is the primary one for friends. Framed (like the desktop Idag shots) on
// the upcoming-match surface: a VIEWPORT shot (not fullPage) anchored on the "Nästa
// avspark" countdown so the day's scheduled match cards lead and the fixtures live-now
// panel is scrolled above the frame (see header note). fullPage would re-include the
// panel at the top, so we deliberately use a single-viewport clip here.
test('mobile idag (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, { theme: 'dark' });
  await frameUpcomingMatches(page);
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: `${OUT}/07-mobile-idag-dark.png` });
});
