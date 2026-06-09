// EN sanning för tema-systemets nycklar och värden.
//
// Allt som måste vara identiskt mellan tre platser, React-providern, den rena
// resolve-logiken och det blockerande inline-scriptet i index.html, bor HÄR och
// bara här. Inline-scriptet får inte importera en ES-modul (då tappar det sin
// no-flash-egenskap, se docs/decisions.md), men nyckel/attribut/default får
// inte heller dupliceras som magiska strängar som tyst driver isär. Lösningen:
// inline-scriptet genereras från dessa konstanter (se theme-init.ts) och ett
// test vaktar att de är i synk.

/** De två temana appen stödjer. Lagrings-värde + DOM-attributvärde i ett. */
export const THEMES = ['dark', 'light'] as const;

/** Temat som en union-typ, härledd från THEMES så listan är enda sanningen. */
export type Theme = (typeof THEMES)[number];

/**
 * Default-tema NÄR användaren varken har ett sparat val eller en
 * system-preferens som pekar åt ljust. SPEC §7: mörkt grundtema.
 */
export const DEFAULT_THEME: Theme = 'dark';

/** localStorage-nyckeln där användarens explicita val persistas. */
export const THEME_STORAGE_KEY = 'vm2026-theme';

/**
 * DOM-attributet som bär aktivt tema på <html>. Tailwind-tokens (tokens.css)
 * och inline-scriptet läser/sätter exakt detta attribut.
 */
export const THEME_ATTRIBUTE = 'data-theme';

/** Typskydd: är ett godtyckligt värde ett giltigt Theme? */
export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
