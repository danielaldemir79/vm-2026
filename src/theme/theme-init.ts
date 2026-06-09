// No-flash tema-init, anpassning av Agent Kit-playbookens
// "no-flash-tema-utan-duplicerade-strängar" från Astro till React + Vite.
//
// Problemet: temat MÅSTE sättas på <html> FÖRE first paint, annars blinkar
// fel tema till (FOUC). Det enda som hinner det är ett blockerande, inline
// <script> i <head> som körs synkront innan React ens laddas. Det scriptet
// får INTE importera en ES-modul (en async/deferred modul körs efter paint
// och tappar no-flash-egenskapen).
//
// Risken: att kopiera nyckel/attribut/default som magiska strängar in i
// scriptet, då driver de isär från theme-constants.ts utan att något larmar.
//
// Lösningen (Astro löser det med define:vars; här gör vi motsvarande): vi
// GENERERAR scriptets text från samma konstanter som modulen använder, och ett
// test (theme-init.test.ts) vaktar att resolve-regeln i scriptet matchar
// resolveInitialTheme. Ett Vite-plugin (se vite.config.ts) injicerar resultatet
// i index.html vid build, så index.html aldrig håller en handkopierad dublett.

import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY, THEMES } from './theme-constants';

/**
 * Bygg innehållet i det blockerande inline-scriptet.
 *
 * Scriptets resolve-regel speglar resolveInitialTheme() MEDVETET och minimalt:
 *   sparat giltigt val  ->  system-preferens  ->  DEFAULT_THEME.
 * Hålls i synk via test. All övrig tema-logik bor i modulerna, inte här.
 *
 * Konstanterna serialiseras med JSON.stringify så att t.ex. nyckel-namn med
 * specialtecken inte kan bryta scriptet, och så att en framtida ändring av
 * konstanterna automatiskt följer med ut i scriptet (en sanning).
 */
export function buildThemeInitScript(): string {
  const storageKey = JSON.stringify(THEME_STORAGE_KEY);
  const attribute = JSON.stringify(THEME_ATTRIBUTE);
  const validThemes = JSON.stringify([...THEMES]);
  const defaultTheme = JSON.stringify(DEFAULT_THEME);

  // IIFE: inga globala läckor. try/catch: blockerad storage (privat läge) får
  // aldrig krascha sid-renderingen, då faller vi till system/default precis
  // som theme-core gör.
  return `(function () {
  try {
    var stored = localStorage.getItem(${storageKey});
    var valid = ${validThemes};
    var theme = valid.indexOf(stored) !== -1
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute(${attribute}, theme);
  } catch (e) {
    document.documentElement.setAttribute(${attribute}, ${defaultTheme});
  }
})();`;
}

/**
 * Det fullständiga <script>-elementet, redo att injiceras i <head>.
 * Vite-pluginet i vite.config.ts kallar denna och stoppar in den före
 * andra taggar, så temat är satt innan något renderas.
 */
export function buildThemeInitTag(): string {
  return `<script>${buildThemeInitScript()}</script>`;
}
