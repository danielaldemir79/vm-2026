// Delade E2E-hjälpare (T25, #25). Håller specarna korta och deras avsikt tydlig.
//
// EN sanning för de stabila krokar sviten litar på (tema-nyckel, sektions-rubriker),
// härledda ur appens faktiska konstanter/markup så ett namnbyte i appen failar HÄR
// i stället för att tyst göra ett test irrelevant.

import type { Page } from '@playwright/test';

// Tema-systemets localStorage-nyckel + attribut. Speglar src/theme/theme-constants.ts
// (THEME_STORAGE_KEY = 'vm2026-theme', THEME_ATTRIBUTE = 'data-theme'). De är ett
// publikt, stabilt kontrakt (no-flash-scriptet läser exakt dessa), så att spegla dem
// här är rimligt, men noteras så en framtida nyckel-ändring uppdaterar båda.
export const THEME_STORAGE_KEY = 'vm2026-theme';
export const THEME_ATTRIBUTE = 'data-theme';

// Onboarding-tourens "sett klart"-flagga (src/features/app-settings/storage-keys.ts,
// ONBOARDING_DONE_KEY). Touren är en z-50 helskärms-overlay vid FÖRSTA besöket som
// täcker hela sidan. För de flesta flödes-scenarier sår vi den som "sedd" så sidan är
// direkt interaktiv (vi testar appen, inte touren). Lämnas osatt bara i det scenario
// som medvetet vill se första-besöks-touren.
export const ONBOARDING_DONE_KEY = 'vm2026-onboarding-done';

// Boolean-flaggornas "sant"-värde i localStorage är EXAKT strängen "1" (FLAG_TRUE i
// src/lib/safe-storage.ts), INTE "true". readStoredFlag läser bara "1" som sant. Att
// skriva "true" här gör att touren ändå öppnas och dess overlay fångar alla klick.
export const FLAG_TRUE = '1';

export type Theme = 'dark' | 'light';

/**
 * Tvinga ett starttema DETERMINISTISKT innan sidan laddas, genom att så
 * localStorage FÖRE appens no-flash-script kör (det läser nyckeln vid första
 * paint). Måste anropas FÖRE page.goto. Utan detta beror temat på maskinens
 * prefers-color-scheme, vilket gör mörk/ljus-assertioner flaky.
 */
export async function seedTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [THEME_STORAGE_KEY, theme] as const
  );
}

/** Markera onboarding-touren som sedd FÖRE laddning, så sidan är direkt interaktiv. */
export async function dismissOnboarding(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [ONBOARDING_DONE_KEY, FLAG_TRUE] as const
  );
}

export interface OpenAppOptions {
  theme?: Theme;
  /** Lämna onboarding-touren synlig (default: dölj den, sidan blir interaktiv). */
  keepOnboarding?: boolean;
}

/**
 * Öppna appen i ett givet tema och vänta tills den faktiskt renderat (hero-h1:an
 * "VM 2026" finns). Döljer onboarding-touren som standard så sidan är interaktiv.
 * Kastar om appen inte kom upp. Använder Playwrights auto-wait (ingen sleep).
 */
export async function openApp(page: Page, options: OpenAppOptions = {}): Promise<void> {
  const { theme = 'dark', keepOnboarding = false } = options;
  await seedTheme(page, theme);
  if (!keepOnboarding) {
    await dismissOnboarding(page);
  }
  await page.goto('/');
  // h1 bär appens tillgängliga namn ("VM 2026", Wordmark as="h1"). Att den finns =
  // React har monterat och första vyn renderat.
  await page.getByRole('heading', { level: 1, name: 'VM 2026' }).waitFor();
}

// De fyra kärn-sektionernas tillgängliga rubrik-namn (h2), i renderings-ordning.
// Härledda ur de faktiska <h2 id="...-rubrik">-elementen i respektive vy. Används
// av "appen laddar + sektioner renderas"-scenariot.
export const SECTION_HEADINGS = [
  'Dagens matcher',
  'Gruppspelet',
  'Vad krävs',
  'Slutspelsträdet',
] as const;
