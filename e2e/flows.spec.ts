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
import { openApp, gotoTab, IDAG_HEADINGS, TURNERING_HEADINGS, THEME_ATTRIBUTE } from './helpers';

test.describe('VM 2026 , kritiska flöden (fixtures)', () => {
  test('appen laddar och huvudsektionerna renderas i rätt flik (T83)', async ({ page }) => {
    await openApp(page);

    // Hero-rubriken (h1) bär appens namn (Idag-fliken är default).
    await expect(page.getByRole('heading', { level: 1, name: 'VM 2026' })).toBeVisible();

    // FLIK-IA (T83): "Dagens matcher" finns i Idag-fliken (default).
    for (const heading of IDAG_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }

    // Turnerings-sektionerna (gruppspel/"vad krävs"/slutspelsträd) finns i Turnering-fliken
    // , byt flik och bevisa att de renderas där (= vy-växlingen kopplar in rätt vyer).
    await gotoTab(page, 'Turnering');
    for (const heading of TURNERING_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('komprimera/expandera: en sektion fäller ut sitt innehåll och tillbaka', async ({
    page,
  }) => {
    await openApp(page);
    // Gruppspels-sektionen bor i Turnering-fliken (T83).
    await gotoTab(page, 'Turnering');

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
    // What-if-kontrollen (SimulationBanner) bor i Turnering-fliken (T83), vid tabeller/träd.
    await gotoTab(page, 'Turnering');

    // Turnering-flikens sim-ram (det finns en frame per simulerad flik; ta Turnering-flikens
    // panel-scope så vi mäter rätt). Scopa till den aktiva Turnering-panelen.
    const turnering = page.locator('[data-tab-panel="turnering"]');
    const frame = turnering.locator('[data-simulation-frame]');
    await expect(frame).toHaveAttribute('data-simulation-active', 'false');

    // Starta simuleringen.
    await turnering.locator('[data-simulation-enter]').click();
    await expect(frame).toHaveAttribute('data-simulation-active', 'true');
    // Sim-ramen visar "Simuleringsläge"-badgen så ingen förväxlar labbet med riktig data.
    await expect(turnering.getByText('Simuleringsläge')).toBeVisible();

    // Avbryt (Avsluta simulering) , tillbaka till neutralt läge.
    await turnering.locator('[data-simulation-exit]').click();
    await expect(frame).toHaveAttribute('data-simulation-active', 'false');
    await expect(turnering.locator('[data-simulation-enter]')).toBeVisible();
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

    // U2 (design-frontend, #175): install-knappen flyttades från Idag till Mer , den är
    // en åtgärd/inställning, inte dagens-innehåll, så Idag avlastas. Den ärliga guide-
    // fallbacken finns alltså i Mer-fliken nu. (Den ALLTID nåbara install-vägen via
    // kugghjuls-portalen finns kvar oberoende; här bevisar vi flik-ytans fallback.)
    await gotoTab(page, 'Mer');

    const installButton = page.locator('[data-get-started-open="install"]');
    await expect(installButton).toBeVisible();
    await expect(installButton).toHaveAttribute('aria-label', /Installera som app/);
  });
});
