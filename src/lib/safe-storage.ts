// Säker localStorage-åtkomst + små flagg-hjälpare (delad, app-bred).
//
// VARFÖR den bor här (inte i theme): den robusta localStorage-åtkomsten kom till
// med tema-systemet (T2), men "läs/skriv en persistent flagga utan att krascha i
// privat läge/sandbox" är ett ÅTERKOMMANDE behov: tema, installations-avfärdande,
// onboarding-flaggan och haptik/ljud-inställningarna behöver alla samma skydd
// (rule of three uppnådd, PRINCIPLES §4). Primitiven flyttades därför hit som EN
// sanning; theme-core återexporterar getLocalStorage så inga gamla call-sites
// eller tester ändras.
//
// FAIL-LOUD-MEN-INTE-FATALT (samma kontrakt som T2): åtkomst-/läs-/skriv-fel
// loggas som varning (synligt, inte tyst maskerat) men kraschar aldrig appen,
// persistensen hoppas bara över. Vi maskerar inte felet till "allt gick bra".

/**
 * Hämta webbläsarens localStorage på ett SÄKERT sätt.
 *
 * I vissa lägen (Safari med blockerade cookies, sandboxade iframes, en del
 * privacy-lägen) kastar redan ÅTKOMSTEN till `window.localStorage` ett
 * SecurityError, alltså innan något läses/skrivs. Den åtkomsten sker därför
 * inuti en try/catch, annars kraschar anroparen redan på argument-uttrycket.
 *
 * @returns Storage om den kan nås, annars null (blockerad/sandbox).
 */
export function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Kunde inte komma åt localStorage (blockerad/sandbox):', error);
    return null;
  }
}

/**
 * Läs en sträng-flagga ur localStorage. Läs-fel (sandbox/blockerad) eller en
 * onåbar storage ger null, vilket anroparen tolkar som "inget värde" (frånvaro
 * av data), inte som en maskerad default.
 */
export function readStoredString(key: string): string | null {
  const storage = getLocalStorage();
  if (storage === null) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch (error) {
    console.warn(`Kunde inte läsa "${key}" ur localStorage:`, error);
    return null;
  }
}

/**
 * Skriv en sträng-flagga. Skriv-fel (privat läge, full kvot) eller onåbar
 * storage sväljs INTE tyst: de loggas och returnerar false så anroparen vet att
 * det inte sparades. Appen fortsätter fungera utan persistens.
 *
 * @returns true om värdet skrevs, annars false.
 */
export function writeStoredString(key: string, value: string): boolean {
  const storage = getLocalStorage();
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Kunde inte spara "${key}" i localStorage:`, error);
    return false;
  }
}

/** Sträng-representationen av en boolean-flagga (stabil, läsbar i devtools). */
const FLAG_TRUE = '1';

/**
 * Läs en boolean-flagga. EN sanning för "är flaggan satt?": exakt strängen "1"
 * räknas som sann, allt annat (inklusive saknat/korrupt värde) som falskt. Vi
 * gissar aldrig att ett okänt värde är sant.
 */
export function readStoredFlag(key: string): boolean {
  return readStoredString(key) === FLAG_TRUE;
}

/**
 * Skriv en boolean-flagga. true -> "1", false -> tar bort nyckeln (så storage
 * inte fylls med "0"-rader och en framtida läsning av frånvaro = falskt stämmer).
 *
 * @returns true om skrivningen/raderingen lyckades, annars false.
 */
export function writeStoredFlag(key: string, value: boolean): boolean {
  if (value) {
    return writeStoredString(key, FLAG_TRUE);
  }
  const storage = getLocalStorage();
  if (storage === null) {
    return false;
  }
  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Kunde inte ta bort "${key}" ur localStorage:`, error);
    return false;
  }
}
