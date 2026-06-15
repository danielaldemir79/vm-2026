// Rumskods-generering (T14, #14). REN modul (ingen IO), fristående testbar.
//
// VAL AV ALFABET (källåkrat till en läsbarhets-konvention, inte gissat): koden
// ska vara lätt att läsa upp och skriva av för en vän (delas muntligt/i chatt).
// Därför ETT teckenförråd utan tvetydiga par: gemener a-z MINUS inga, och siffror
// 2-9 (utelämnar 0/1 som förväxlas med O/l/I). Detta är "Crockford-andan"
// (Douglas Crockford, Base32: exkludera I L O U för att undvika förväxling och
// oavsiktliga ord), här förenklat till "inga 0/1, små bokstäver". Samma teckenförråd
// vaktas av DB:ns check-constraint `rooms_code_format` (^[a-z2-9]{4,12}$), så koden
// och databasen kan aldrig drifta isär.
//
// LÄNGD: 6 tecken ur 32 möjliga (ROOM_CODE_ALPHABET.length) = 32^6 ~ 1,07 miljarder
// kombinationer (24 bokstäver a-z minus l/o + 8 siffror 2-9 = 32, inte 34), gott och väl
// för en vänkrets-app. UNIQUE i DB fångar den astronomiskt osannolika krocken
// (create_room kastar då, klienten genererar en ny). Vi GISSAR aldrig att en kod
// är unik, databasen är sanningen.

/** Teckenförråd utan tvetydiga tecken (inga 0/1/o-förväxlingar). */
export const ROOM_CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
//                                 ^ medvetet utan 'l' och 'o' (förväxlas med 1/0).

/** Standardlängd på en rumskod. */
export const ROOM_CODE_LENGTH = 6;

/**
 * Slumpa en rumskod ur det otvetydiga teckenförrådet.
 *
 * @param length  antal tecken (default ROOM_CODE_LENGTH).
 * @param random  injicerbar slumpkälla (default Math.random) för determinism i test.
 * @returns en kod som matchar DB:ns ^[a-z2-9]{4,12}$-mönster (för standardlängden).
 */
export function generateRoomCode(
  length: number = ROOM_CODE_LENGTH,
  random: () => number = Math.random
): string {
  if (length < 4 || length > 12) {
    // Fail loud: utanför DB:ns tillåtna längd (check-constraint) är ett anropsfel.
    throw new Error(`[VM2026] Rumskods-längd ${length} utanför tillåtet intervall 4-12.`);
  }
  let code = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}

/**
 * Normalisera en användarinmatad kod (gemener + trimma) inför join. Speglar
 * DB-RPC:ns lower(btrim(...)) så klient och server tolkar koden likadant.
 */
export function normalizeRoomCode(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Antal index-tecken i en index-härledd kod (roomCodeForIndex). 3 tecken ur det
 * 32-tecken stora alfabetet = 32^3 = 32 768 unika index, gott och väl för all
 * tänkbar seedning (jämför 20 nya rum i T82). Totallängden blir CODE_INDEX_PREFIX
 * (4) + 3 = 7, inom DB:ns 4-12.
 */
const CODE_INDEX_WIDTH = 3;

/** Prefix på en index-härledd rumskod. 4 tecken, alla i alfabetet (a-z2-9). */
const CODE_INDEX_PREFIX = 'liga';

/**
 * Koda ett icke-negativt heltal i ROOM_CODE_ALPHABET (bas-32), höger-justerat och
 * noll-paddat (alfabetets första tecken som "noll") till exakt `width` tecken.
 *
 * INJEKTIV by construction: bas-växling är en bijektion mellan heltal och sin
 * teckensträng, och fast bredd med konsekvent padding bevarar det. Två olika tal
 * kan därför ALDRIG ge samma sträng (till skillnad från en värde-mappande siffer-
 * bump, som kan kollapsa två index till samma kod). Kastar (fail loud) om talet är
 * negativt/icke-heltal eller inte ryms i `width` tecken, hellre stopp än en tyst
 * trunkering som skulle återinföra kollisions-risken.
 */
function encodeInAlphabet(value: number, width: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[VM2026] encodeInAlphabet: ${value} är inte ett icke-negativt heltal.`);
  }
  const base = ROOM_CODE_ALPHABET.length;
  let encoded = '';
  let remaining = value;
  do {
    encoded = ROOM_CODE_ALPHABET[remaining % base] + encoded;
    remaining = Math.floor(remaining / base);
  } while (remaining > 0);
  if (encoded.length > width) {
    throw new Error(
      `[VM2026] encodeInAlphabet: ${value} ryms inte i ${width} tecken ` +
        `(max ${ROOM_CODE_ALPHABET.length ** width - 1}).`
    );
  }
  return encoded.padStart(width, ROOM_CODE_ALPHABET[0]);
}

/**
 * En DETERMINISTISK och UNIK rumskod härledd ur ett rums-index (för seedade rum,
 * T82). rooms.code är UNIQUE i DB:n (rooms_code_format ^[a-z2-9]{4,12}$), så koden
 * MÅSTE vara injektiv över hela index-domänen, annars kastar ett senare insert på
 * UNIQUE mitt i en skarp körning (partiell seed). Vi bas-växlar index till
 * alfabetet (bijektion) i stället för en siffer-bump (som inte är injektiv och
 * kollapsade t.ex. index 8 och 10 till samma "liga32"). Bevisas i room-code.test.ts
 * (alla N koder unika + format-regex). Se docs/decisions.md (T82).
 */
export function roomCodeForIndex(roomIndex: number): string {
  return `${CODE_INDEX_PREFIX}${encodeInAlphabet(roomIndex, CODE_INDEX_WIDTH)}`;
}
