// Liten seedad PRNG för bot-seedningen (T82, #173). REN, deterministisk, inget I/O.
//
// VARFÖR EGEN PRNG (och inte Math.random): hela seedningen ska vara DETERMINISTISK,
// samma seed -> exakt samma personas och tips, så bygget kan testas (antal, fördelning,
// determinism) och en dry-run alltid rapporterar samma plan som en senare live-körning
// av samma seed. Math.random är icke-deterministisk och kan inte återskapa en plan.
//
// ALGORITM (källa, gissas inte): "mulberry32" av Tommy Ettinger, en vedertagen liten
// 32-bitars PRNG (publik domän, spridd via bl.a. bryc/gist "Seeding the random number
// generator in Javascript"). Vald för att den är (a) liten nog att skriva för hand
// (PRINCIPLES §11: inget beroende för något trivialt), (b) deterministisk ur en heltals-
// seed, och (c) har tillräckligt jämn fördelning för vårt syfte (sprida bot-skicklighet
// och tips, INTE kryptografi). Den är medvetet INTE kryptografiskt säker, det behövs
// inte här (ingen säkerhet hänger på oförutsägbarhet, tvärtom vill vi förutsägbarhet).

/**
 * En deterministisk slump-funktion: anropas utan argument, ger nästa tal i [0, 1).
 * Samma form som Math.random, så den kan injiceras där en `() => number` förväntas
 * (t.ex. generateRoomCode i room-code.ts).
 */
export type Rng = () => number;

/**
 * Skapa en seedad PRNG (mulberry32). Samma `seed` ger alltid exakt samma talföljd.
 *
 * @param seed  Heltals-seed (32-bitars). Olika seeds ger oberoende följder.
 * @returns     En Rng: varje anrop ger nästa pseudo-slumptal i [0, 1).
 */
export function createRng(seed: number): Rng {
  // Behåll state i en lokal closure (>>> 0 håller den som osignerad 32-bitars).
  let state = seed >>> 0;
  return function next(): number {
    // mulberry32-steget (källa ovan). De magiska konstanterna ÄR algoritmen, de
    // gissas inte och ska inte "förbättras", de är vad som ger den jämna fördelningen.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Heltal i [min, max) ur en Rng (min inklusive, max EXKLUSIVE). Den vedertagna
 * `floor(rng() * span) + min`-formen, samlad här så index-plockningen är EN sanning
 * och inte upprepas (gräns-inklusiviteten gissas inte på varje call-site).
 *
 * @param rng  slumpkällan.
 * @param min  nedre gräns (inklusive).
 * @param max  övre gräns (EXKLUSIVE). Måste vara > min.
 */
export function randomInt(rng: Rng, min: number, max: number): number {
  if (max <= min) {
    throw new Error(`[VM2026] randomInt: max (${max}) måste vara större än min (${min}).`);
  }
  return Math.floor(rng() * (max - min)) + min;
}

/**
 * Plocka ett element ur en icke-tom lista deterministiskt. Fail loud på tom lista
 * (att be om ett element ur inget är ett anropsfel, inte ett tyst undefined som
 * smyger ut och förgiftar genereringen längre fram).
 */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('[VM2026] pick: kan inte välja ur en tom lista.');
  }
  return items[randomInt(rng, 0, items.length)];
}
