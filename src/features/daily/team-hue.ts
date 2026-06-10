// Deterministisk färg-härledning ur ett lags FIFA-landskod (REN modul, inget I/O).
//
// EN sanning för "kod -> hue". Den här hash-/hue-regeln fanns först i TeamFlag
// (T7, lag-emblemets tvåtons-disc). T8 (dags-temat) behöver EXAKT samma
// härledning för att färga dagens dekor efter dagens lag, så regeln lyfts hit
// och delas i stället för att kopieras (PRINCIPLES §4: ingen parallell variant av
// något som redan finns). Att kopiera en deterministisk hash vore dessutom en
// tyst drift-risk: två kopior kan glida isär och ge två olika "lagfärger" för
// samma lag på olika ytor. Nu härleder både discen och dags-temat samma hue.
//
// VARFÖR en stabil hash och inte t.ex. ett index: ett lags färg ska vara samma
// oavsett ordning eller vilka andra lag som finns, och samma mellan renderingar.
// Hashen är INTE kryptografisk (det krävs inte); den ska bara sprida de ~48
// landskoderna jämnt över färghjulet så lagen blir visuellt särskiljbara.

/**
 * En liten, stabil hash ur en sträng (FNV-1a-variant). Deterministisk: samma
 * kod ger alltid samma tal. Returnerar ett icke-negativt 32-bitars heltal.
 */
export function hashCode(code: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < code.length; i += 1) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // `>>> 0` tolkar om till ett positivt heltal (annars kan biten överst ge ett
  // negativt JS-tal efter Math.imul).
  return hash >>> 0;
}

/**
 * En enda hue-grad (0-359) ur en landskod. Detta är dags-temats byggsten: dagens
 * accent-hue härleds ur dagens lag (se day-theme.ts). Samma värde som TeamFlag:s
 * `from`-hue, så ett lags signaturfärg är densamma i discen och i dags-temat.
 */
export function hueFromCode(code: string): number {
  return hashCode(code) % 360;
}

/**
 * Två harmoniserande hue-grader (0-359) ur en landskod: en primär och en som
 * ligger ~140 grader bort, för en tvåtons-lutning (flagg-känsla utan att vara en
 * riktig flagga). Används av TeamFlag:s disc.
 */
export function huesFor(code: string): { from: number; to: number } {
  const from = hueFromCode(code);
  const to = (from + 140) % 360;
  return { from, to };
}
