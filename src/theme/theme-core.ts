// Ren, sido-effekt-fri tema-logik. All beslutslogik (vilket tema som gäller)
// bor här så den kan enhetstestas utan DOM eller React. Provider och inline-
// script konsumerar dessa funktioner / samma regel.

import {
  DEFAULT_THEME,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  isTheme,
  type Theme,
} from './theme-constants';

/**
 * Härled vilket tema som ska gälla vid första render.
 *
 * Prioritet:
 *   1. Användarens sparade, giltiga val (explicit vilja vinner alltid).
 *   2. System-preferensen (prefers-color-scheme) om inget sparat finns.
 *   3. DEFAULT_THEME som sista utväg.
 *
 * Notera: ett sparat värde som INTE är ett giltigt Theme (korrupt/föråldrat)
 * behandlas som "inget val", inte som ett fel som ska krascha appen, men det
 * maskeras inte heller till ett tyst defaultvärde som låtsas vara ett aktivt
 * val: det faller medvetet vidare till system-preferensen. Det är skillnaden
 * mot en tyst maskerande fallback, vi gissar inte att korrupt data är "dark".
 *
 * @param stored          Råvärdet ur localStorage (eller null om inget/ej läsbart).
 * @param systemPrefersDark  Resultatet av matchMedia('(prefers-color-scheme: dark)').
 */
export function resolveInitialTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (isTheme(stored)) {
    return stored;
  }
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Skriv aktivt tema till DOM:en (sätter data-theme på <html>).
 * Idempotent, säker att kalla vid varje temaändring.
 */
export function applyThemeToDocument(doc: Document, theme: Theme): void {
  doc.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
}

/**
 * Läs aktivt tema FRÅN DOM:en. Används av providern för att ta över exakt det
 * tema inline-scriptet redan satte före first paint, så React inte räknar om
 * och orsakar en flash. Faller tillbaka på DEFAULT_THEME om attributet saknas
 * eller är ogiltigt (t.ex. i testmiljö utan inline-scriptet).
 */
export function readThemeFromDocument(doc: Document): Theme {
  const current = doc.documentElement.getAttribute(THEME_ATTRIBUTE);
  return isTheme(current) ? current : DEFAULT_THEME;
}

/**
 * Persistera användarens val. Skriv-fel (t.ex. privat läge där localStorage
 * kastar, eller full kvot) sväljs INTE tyst på ett sätt som döljer en bugg:
 * de loggas som varning och returnerar false så anroparen vet att det inte
 * sparades. Appen ska fortsätta fungera utan persistens, men felet syns.
 *
 * @returns true om värdet skrevs, annars false.
 */
export function persistTheme(storage: Storage, theme: Theme): boolean {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch (error) {
    // Fail loud (synligt), men inte fatalt: temat funkar för sessionen,
    // bara persistensen uteblir. Vi maskerar inte felet till "allt gick bra".
    console.warn(`Kunde inte spara tema-valet (${theme}) i localStorage:`, error);
    return false;
  }
}

/**
 * Läs sparat tema-råvärde. Läs-fel (sandbox/blockerad storage) ger null, vilket
 * resolve-logiken tolkar som "inget val" och därmed faller till system/default.
 * Det är korrekt fallback här (frånvaro av data), inte en maskering av ett
 * obligatoriskt värde.
 */
export function readStoredTheme(storage: Storage): string | null {
  try {
    return storage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn('Kunde inte läsa tema-valet från localStorage:', error);
    return null;
  }
}

/** Växla till motsatt tema. Ren funktion, lätt att testa. */
export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
