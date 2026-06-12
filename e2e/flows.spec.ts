// E2E: kritiska användarflöden i FIXTURES-läge (T25, #25).
//
// FOKUSERAD svit, kritiska flöden en oteknisk vän faktiskt rör vid: att appen
// kommer upp + sektionerna renderas, komprimera/expandera-mönstret, dag-bläddringen,
// what-if-simulatorn (öppna + avbryt), lagprofil-modalen (öppna + stäng med Esc),
// och tema-växlingen. Allt mot det BYGGDA dist:et via vite preview (se
// playwright.config.ts). Inga sleeps: vi lutar oss helt på Playwrights auto-wait
// (locator-assertions retas tills de stämmer), så sviten är stabil, inte tids-
// känslig.

import { test, expect } from '@playwright/test';
import { openApp, SECTION_HEADINGS, THEME_ATTRIBUTE } from './helpers';

test.describe('VM 2026 , kritiska flöden (fixtures)', () => {
  test('appen laddar och alla huvudsektioner renderas', async ({ page }) => {
    await openApp(page);

    // Hero-rubriken (h1) bär appens namn.
    await expect(page.getByRole('heading', { level: 1, name: 'VM 2026' })).toBeVisible();

    // De fyra live-tracker-sektionerna finns alla på sidan (en skroll-sida, ingen router).
    for (const heading of SECTION_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('komprimera/expandera: en sektion fäller ut sitt innehåll och tillbaka', async ({
    page,
  }) => {
    await openApp(page);

    // Gruppspels-sektionen bär den delade komprimerings-kontrollen (data-groups-toggle).
    // Den ÖVRE toggeln (position 'top') styr utfällningen via aria-expanded.
    const topToggle = page.locator('[data-groups-toggle][data-groups-toggle-position="top"]');
    await expect(topToggle).toHaveAttribute('aria-expanded', 'false');

    // Expandera.
    await topToggle.click();
    await expect(topToggle).toHaveAttribute('aria-expanded', 'true');

    // I utfällt läge dyker den NEDRE toggeln upp (dubblerad kontroll, #129).
    const bottomToggle = page.locator('[data-groups-toggle][data-groups-toggle-position="bottom"]');
    await expect(bottomToggle).toBeVisible();

    // Komprimera igen via den övre.
    await topToggle.click();
    await expect(topToggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('dag-bläddring: nästa-knappen byter dagsrubrik och bakåt återställer den', async ({
    page,
  }) => {
    await openApp(page);

    const nav = page.getByRole('navigation', { name: 'Datumnavigering' });
    const heading = nav.getByRole('paragraph'); // aria-live dag-rubriken
    const firstDay = (await heading.textContent())?.trim() ?? '';
    expect(firstDay.length).toBeGreaterThan(0);

    // Bläddra framåt (aria-label börjar med "Nästa speldag").
    await nav.getByRole('button', { name: /^Nästa speldag/ }).click();
    await expect(heading).not.toHaveText(firstDay);

    // Bläddra tillbaka , rubriken återställs till första dagen.
    await nav.getByRole('button', { name: /^Föregående speldag/ }).click();
    await expect(heading).toHaveText(firstDay);
  });

  test('what-if-simulering: starta och avbryt återgår till neutralt läge', async ({ page }) => {
    await openApp(page);

    const frame = page.locator('[data-simulation-frame]');
    await expect(frame).toHaveAttribute('data-simulation-active', 'false');

    // Starta simuleringen.
    await page.locator('[data-simulation-enter]').click();
    await expect(frame).toHaveAttribute('data-simulation-active', 'true');
    // Sim-ramen visar "Simuleringsläge"-badgen så ingen förväxlar labbet med riktig data.
    await expect(page.getByText('Simuleringsläge')).toBeVisible();

    // Avbryt (Avsluta simulering) , tillbaka till neutralt läge.
    await page.locator('[data-simulation-exit]').click();
    await expect(frame).toHaveAttribute('data-simulation-active', 'false');
    await expect(page.locator('[data-simulation-enter]')).toBeVisible();
  });

  test('lagprofil-modal: ett lagnamn öppnar profilen och Escape stänger den', async ({ page }) => {
    await openApp(page);

    // Lagnamns-knapparna bär aria-label "Visa lagprofil för X". Ta den första i DOM.
    const teamButton = page.getByRole('button', { name: /^Visa lagprofil för / }).first();
    await teamButton.waitFor();
    await teamButton.click();

    // Profilen är en a11y-dialog (role="dialog" + aria-modal).
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Escape stänger (Modal-kontraktet) , dialogen tas bort ur DOM.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('tema-växling: toggeln byter data-theme på <html> och tillbaka', async ({ page }) => {
    await openApp(page, { theme: 'dark' });

    const html = page.locator('html');
    await expect(html).toHaveAttribute(THEME_ATTRIBUTE, 'dark');

    // I mörkt läge säger toggeln "Byt till ljust läge".
    await page.getByRole('button', { name: 'Byt till ljust läge' }).click();
    await expect(html).toHaveAttribute(THEME_ATTRIBUTE, 'light');

    // Nu säger den "Byt till mörkt läge"; klick tar oss tillbaka.
    await page.getByRole('button', { name: 'Byt till mörkt läge' }).click();
    await expect(html).toHaveAttribute(THEME_ATTRIBUTE, 'dark');
  });

  test('install-yta: erbjuds som ärlig guide-fallback i en vanlig webbläsarflik', async ({
    page,
  }) => {
    // I en headless flik (inte standalone, inget beforeinstallprompt-event, inte iOS)
    // faller install-knappen till GUIDE-läget , aldrig en död knapp, aldrig dold.
    // GATINGEN: i standalone (app-läge) döljs den HELT (testas i enhetstesterna mot
    // detectStandalone); här bevisar vi den synliga, klickbara guide-fallbacken.
    await openApp(page);

    const installButton = page.locator('[data-get-started-open="install"]');
    await expect(installButton).toBeVisible();
    await expect(installButton).toHaveAttribute('aria-label', /Installera som app/);
  });
});
