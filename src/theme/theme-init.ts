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
 * Scriptets resolve-regel speglar resolveInitialTheme() MEDVETET och exakt,
 * med samma prioritet och samma OBEROENDE fel-guards:
 *   1. sparat giltigt val  (läses i egen try/catch -> null vid blockerad storage)
 *   2. system-preferens    (läses i egen try/catch -> "ej läsbart" vid fel/saknad)
 *   3. DEFAULT_THEME        (bara när systempreferensen inte kan läsas)
 *
 * Två oberoende try/catch (i stället för ETT runt allt) är poängen: om
 * localStorage kastar men matchMedia funkar ska scriptet falla till
 * SYSTEM-preferensen, inte till default. Ett gemensamt try/catch skulle
 * felaktigt hoppa förbi system-preferensen och bryta prioriteten ovan.
 * Hålls i synk med resolveInitialTheme via test. All övrig tema-logik bor i
 * modulerna, inte här.
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

  // IIFE: inga globala läckor. Synkront, importerar ingen ES-modul, så
  // no-flash-egenskapen behålls (temat sätts före first paint).
  return `(function () {
  var attribute = ${attribute};
  var defaultTheme = ${defaultTheme};
  var valid = ${validThemes};

  // 1. Sparat val. Egen try/catch: blockerad/privat storage ger null
  //    ("inget val"), exakt som readStoredTheme i theme-core.
  var stored = null;
  try {
    stored = localStorage.getItem(${storageKey});
  } catch (e) {
    stored = null;
  }
  if (valid.indexOf(stored) !== -1) {
    document.documentElement.setAttribute(attribute, stored);
    return;
  }

  // 2. System-preferens. Egen try/catch: om matchMedia saknas/kastar
  //    behandlas systempreferensen som "ej läsbar" (motsvarar null hos
  //    resolveInitialTheme) och vi faller till default i steg 3.
  var prefersDark = null;
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) {
    prefersDark = null;
  }

  // 3. DEFAULT_THEME bara när systempreferensen inte kunde läsas.
  var theme = prefersDark === null ? defaultTheme : (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute(attribute, theme);
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
