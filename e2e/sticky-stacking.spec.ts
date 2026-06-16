// E2E: sticky-stacking på DESKTOP (F1/T83, #175).
//
// VARFÖR en egen spec: F1 var en ren VISUELL/geometrisk bugg som BARA uppstår vid
// >=sm-bredd EFTER scroll: app-headern (data-app-header) är `sticky top-0` på alla
// brytpunkter, och på desktop blev ÄVEN flik-raden (.vm-tab-bar) `sticky top: 0`.
// Båda pinnade till viewport-topp 0, så vid scroll gled flik-raden UPP och lade sig
// ÖVER headern , två frostade band på varandra blev en grötig strimla. jsdom (Vitest)
// renderar ingen sticky-stacking och de övriga e2e-flödena scrollar inte, så den klassen
// av bugg slank förbi grinden. Den här specen SCROLLAR vid desktop-bredd och asserterar
// geometrin direkt, så ett återfall (top tillbaka till 0, eller en drift i header-höjden)
// failar HÄR i stället för att tyst se grötigt ut i produktion.
//
// Mäter mot det BYGGDA dist:et via vite preview (playwright.config.ts), fixtures-läge.

import { test, expect } from '@playwright/test';
import { openApp, gotoTab } from './helpers';

// Desktop-bredd över sm-brytpunkten (640px); appen lägger då flik-raden i toppen som
// en del av app-baren (mobil har den `fixed bottom-0`, en annan stacking-modell).
const DESKTOP = { width: 1280, height: 800 };

test.describe('sticky-stacking på desktop (F1/T83)', () => {
  test.use({ viewport: DESKTOP });

  test('flik-raden pinnar UNDER headern vid scroll (inget överlapp)', async ({ page }) => {
    await openApp(page);

    // Gör sidan scrollbar nog att tvinga fram sticky-läget och scrolla en bit ner.
    await page.evaluate(() => window.scrollTo(0, 600));

    const geom = await page.evaluate(() => {
      const header = document.querySelector('[data-app-header]') as HTMLElement;
      const tabBar = document.querySelector('[data-tab-bar]') as HTMLElement;
      // Tvinga layout efter scroll innan vi mäter (rect:arna ska spegla det pinnade läget).
      void document.body.offsetHeight;
      const h = header.getBoundingClientRect();
      const t = tabBar.getBoundingClientRect();
      // Sampla en punkt MITT i headerns band (y=20) , det får ALDRIG vara en flik-knapp
      // (då ligger flik-raden ovanpå headern, exakt F1-buggen).
      const elInHeaderBand = document.elementFromPoint(t.left + 40, 20);
      return {
        scrollY: window.scrollY,
        headerTop: Math.round(h.top),
        headerBottom: Math.round(h.bottom),
        tabBarTop: Math.round(t.top),
        tabBarBottom: Math.round(t.bottom),
        tabBarPosition: getComputedStyle(tabBar).position,
        headerPosition: getComputedStyle(header).position,
        hitIsTab: !!elInHeaderBand?.closest('[data-tab]'),
      };
    });

    // Båda är faktiskt sticky (annars testar vi fel sak , en framtida refaktor som tar
    // bort sticky ska tvinga oss att tänka om här, inte tyst passera).
    expect(geom.headerPosition).toBe('sticky');
    expect(geom.tabBarPosition).toBe('sticky');

    // Vi scrollade faktiskt (annars är pinningen inte under test).
    expect(geom.scrollY).toBeGreaterThan(0);

    // Headern pinnar till toppen (top 0) som förr.
    expect(geom.headerTop).toBe(0);

    // KÄRNAN: flik-radens pinnade topp ligger PÅ ELLER UNDER headerns botten , de stackar,
    // de överlappar inte. (>= med 1px tolerans för subpixel-avrundning.)
    expect(geom.tabBarTop).toBeGreaterThanOrEqual(geom.headerBottom - 1);

    // Och visuellt: en punkt i headerns band träffar INTE en flik-knapp (flik-raden ligger
    // inte ovanpå headern). Detta är den direkta F1-regressionsvakten.
    expect(geom.hitIsTab).toBe(false);
  });

  test('sticky "följ-med"-baren klistrar UNDER hela app-baren (inte under flik-raden)', async ({
    page,
  }) => {
    await openApp(page);
    // Resultat-inmatningens långa match-lista (en StickyFollowToggle-konsument, name="results")
    // bor i Turnering-fliken (T83) och renderas i fixtures-läge, så följ-med-baren finns här.
    await gotoTab(page, 'Turnering');

    // Fäll ut match-listan , då blir följ-med-baren sticky (data-sticky="true").
    const topToggle = page.locator('[data-results-toggle][data-results-toggle-position="top"]');
    await topToggle.click();
    await expect(topToggle).toHaveAttribute('aria-expanded', 'true');

    const followBar = page.locator('[data-results-toggle-bar][data-sticky="true"]');
    await expect(followBar).toBeVisible();

    // Scrolla LÅNGT ner så baren passerar sin naturliga position och faktiskt PINNAR på sin
    // sticky-top (annars flyter den ännu med i listan och mäter inte det pinnade läget).
    await page.evaluate(() => window.scrollTo(0, 3000));

    const geom = await page.evaluate(() => {
      void document.body.offsetHeight;
      const tabBar = document.querySelector('[data-tab-bar]') as HTMLElement;
      const bar = document.querySelector(
        '[data-results-toggle-bar][data-sticky="true"]'
      ) as HTMLElement;
      const t = tabBar.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return {
        tabBarBottom: Math.round(t.bottom),
        followBarTop: Math.round(b.top),
        followBarPosition: getComputedStyle(bar).position,
      };
    });

    // Baren är faktiskt sticky-pinnad (inte bara inline-flytande).
    expect(geom.followBarPosition).toBe('sticky');

    // KÄRNAN: följ-med-barens pinnade topp ligger PÅ ELLER UNDER flik-radens botten , den
    // tuckas alltså under HELA app-baren (header + flik-rad), inte mitt i flik-raden.
    // (>= med 1px tolerans för flik-radens subpixel-botten-kant, 0.667px.)
    expect(geom.followBarTop).toBeGreaterThanOrEqual(geom.tabBarBottom - 1);
  });
});
