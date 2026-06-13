// Ren parser för arena-källan (venue-source.txt) -> matches.ts:s venue-fält.
//
// EN sanning för hur det committade arena-utdraget (venue-source.txt) fyller
// venue-fältet i matches.ts: både generator-skriptet (scripts/generate-matches.ts,
// CLI med fil-IO) OCH källånkrings-testet (venue-source.test.ts) importerar dessa
// rena funktioner. Ingen duplicerad parser, så testet kör EXAKT den logik
// genereringen kör. Inga Node-beroenden här (ren sträng in, map ut), så modulen
// typkollas av app-bygget och kan testas direkt.
//
// VARFÖR ett separat källutdrag och inte handskriven venue per match: tv-tablån
// (T4b) bar tid + kanal men INTE arena, så matches.ts hade en uttrycklig "ej
// verifierad"-platshållare (VENUE_UNKNOWN, gissas aldrig). T4c (#35) fyller arenan
// + staden per match ur FIFA:s spelschema, korskollad mot en andra oberoende källa.
// T4d (#147) lägger till VÄRDLANDET per arena, så venue blir "Arena, Stad, Land" med
// svenskt landsnamn. Datan är gissningskänslig (fel arena/land vore en faktatabbe på
// en LIVE-app), så den låses mot en COMMITTAD källtext med värde-likhet i CI, samma
// mönster som matchtablån (T4b), Annexe C-tabellen (T4) och lag-profilerna (T10). Se
// docs/patterns.md
// "gissningskanslig-data-genereras-ur-auktoritativ-kalla-med-validerande-generator".
//
// KÄLLOR (gissas ALDRIG): se preambeln i venue-source.txt.
//   - PRIMÄR: FIFA:s officiella spelschema (16 arenor), Wikipedia "2026 FIFA World
//     Cup" (arena-listan) + Al Jazeera per-match-schemat + Wikipedia knockout stage.
//   - KORSKOLL: MLSSoccer "every game by city & stadium" + ESPN (exakt kommun) +
//     matchrapporter för de spelade matcherna (11-12 juni, historiskt fakta).
//   - En källavvikelse (Belgien-Egypten) är LÖST mot 4 källor, inte gissad (se
//     preambeln + docs/decisions.md T4c).

/** Sätter i källtexten där dataraderna börjar (allt innan ignoreras). */
export const SOURCE_START_MARKER = 'VENUES';

/** Fält-separator i en datarad ("MATCH_ID | venue=... | match=..."). */
const FIELD_SEPARATOR = ' | ';

/**
 * De 16 KÄNDA arena-strängarna ("Arena, Stad, Land"), kanonisk form. Varje rad i källan
 * MÅSTE ange exakt en av dessa (annars är det en gissad/feltranskriberad arena, fail
 * loud). Källhänvisad mot FIFA:s 16-arenor-lista (Wikipedia "2026 FIFA World Cup") +
 * korskoll (se venue-source.txt). Arenanamn = det ETABLERADE namnet (matchrapporter +
 * Match.venue-exemplet i domain/types.ts), kommun = den FAKTISKA kommunen (ESPN/
 * Wikipedia), inte FIFA:s sponsor-fria turneringsnamn. Se docs/decisions.md (T4c).
 *
 * VÄRDLANDET (T4d #147) är entydigt ur arenans värdstad: 3 arenor i Mexiko, 2 i Kanada,
 * 11 i USA (FIFA:s värdstäder-lista, Wikipedia "2026 FIFA World Cup"). Svenskt landsnamn
 * ("Mexiko"/"USA"/"Kanada"), appens språk. Se docs/decisions.md (T4d) för land-mappningen.
 *
 * Detta är en sluten white-list, INTE en gissning: en rad vars venue inte finns här
 * stoppar genereringen, så ett stavfel eller en hittepå-arena aldrig smyger in.
 */
export const KNOWN_VENUES: ReadonlySet<string> = new Set([
  'Estadio Azteca, Mexico City, Mexiko',
  'Estadio Akron, Zapopan, Mexiko',
  'Estadio BBVA, Guadalupe, Mexiko',
  'BMO Field, Toronto, Kanada',
  'BC Place, Vancouver, Kanada',
  'MetLife Stadium, East Rutherford, USA',
  'AT&T Stadium, Arlington, USA',
  'SoFi Stadium, Inglewood, USA',
  'Arrowhead Stadium, Kansas City, USA',
  "Levi's Stadium, Santa Clara, USA",
  'NRG Stadium, Houston, USA',
  'Lincoln Financial Field, Philadelphia, USA',
  'Mercedes-Benz Stadium, Atlanta, USA',
  'Lumen Field, Seattle, USA',
  'Hard Rock Stadium, Miami Gardens, USA',
  'Gillette Stadium, Foxborough, USA',
]);

/** Antalet arenor VM 2026 spelas i (FIFA: 16 i USA/Mexiko/Kanada). Korskolls-grind. */
export const EXPECTED_VENUE_COUNT = 16;

/** Förväntat antal matcher (hela planen: 72 grupp + 32 slutspel). Fail-loud-grind. */
export const EXPECTED_MATCH_ROWS = 104;

/** En parsad arena-rad (innan den joinas mot matches.ts). */
export interface ParsedVenueRow {
  /** matches.ts:s stabila match-id (join-nyckel), t.ex. "g-A-1" eller "M104". */
  matchId: string;
  /** Arena + värdstad + värdland, "Arena, Stad, Land" (en av KNOWN_VENUES). */
  venue: string;
}

/** Join-resultatet: match-id -> verifierad arena-sträng. */
export type VenueTable = ReadonlyMap<string, string>;

/**
 * Plocka ut ett namngivet fält ("nyckel=värde") ur en rad-del och returnera värdet
 * (trimmat). Fail loud om delen inte har formen `nyckel=...`, så ett format-fel i
 * källan stoppar genereringen i stället för att tyst tappa data (PRINCIPLES §8).
 */
function fieldValue(part: string, key: string): string {
  const prefix = `${key}=`;
  if (!part.startsWith(prefix)) {
    throw new Error(`Väntade fält "${key}=..." men fick "${part}".`);
  }
  return part.slice(prefix.length).trim();
}

/**
 * Parsa EN datarad till en ParsedVenueRow. Strikt: minst två fält (MATCH_ID, venue=);
 * ett tredje `match=`-fält (människans spot-check-etikett) tillåts men IGNORERAS av
 * parsern. Fail loud vid fel form, ogiltigt id-format eller okänd arena. Ren funktion.
 */
export function parseVenueRow(line: string): ParsedVenueRow {
  const parts = line.split(FIELD_SEPARATOR).map((p) => p.trim());
  if (parts.length < 2) {
    throw new Error(
      `Arena-rad ska ha minst 2 fält (MATCH_ID | venue=...), fick ${parts.length}: "${line}".`
    );
  }
  const [idPart, venuePart] = parts;

  const matchId = idPart.trim();
  // Match-id är antingen en gruppmatch "g-<GRUPP A-L>-<n>" eller en slutspelsmatch
  // "M<73-104>". Validera FORMEN här (fail loud på skräp); EXAKT existens mot
  // matches.ts kollas i buildVenueTable (join-grinden).
  if (!/^(g-[A-L]-[1-6]|M(7[3-9]|8\d|9\d|10[0-4]))$/.test(matchId)) {
    throw new Error(
      `Ogiltigt match-id "${matchId}" (väntade g-<A-L>-<1-6> eller M73-M104) i rad: "${line}".`
    );
  }

  const venue = fieldValue(venuePart, 'venue');
  if (!KNOWN_VENUES.has(venue)) {
    throw new Error(
      `Okänd arena "${venue}" för ${matchId} (inte en av de ${EXPECTED_VENUE_COUNT} ` +
        `kända FIFA-arenorna). Gissa aldrig en arena, lägg till i KNOWN_VENUES först ` +
        `om en verifierad ny arena tillkommit.`
    );
  }

  return { matchId, venue };
}

/**
 * Parsa hela arena-källan till rader (i källans ordning). Hoppar fram till
 * SOURCE_START_MARKER (preambeln ignoreras), ignorerar tomma rader och
 * '#'-kommentarer (grupprubriker). Ren funktion (ingen IO).
 *
 * @throws Om start-markören saknas, så en trasig källa inte tyst ger noll rader.
 */
export function parseVenues(text: string): ParsedVenueRow[] {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((l) => l.trim() === SOURCE_START_MARKER);
  if (startIndex === -1) {
    throw new Error(`Hittade inte start-markören "${SOURCE_START_MARKER}" i arena-utdraget.`);
  }
  const rows: ParsedVenueRow[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    rows.push(parseVenueRow(trimmed));
  }
  return rows;
}

/**
 * Bygg join-tabellen match-id -> arena, VALIDERAD mot matchplanens id-mängd. Detta är
 * källånkringens hjärta för arenor: varje arena-rad måste matcha EXAKT en match i
 * matches.ts, och varje match måste få EXAKT en arena. Fail loud (PRINCIPLES §8) vid:
 *   - okänt id (arena-rad utan motsvarande match i matches.ts),
 *   - dubblett (samma match-id två gånger i källan),
 *   - drift i ANTAL/MÄNGD (en match saknar arena, eller en arena saknar match).
 *
 * Join-nyckeln är match-id (g-A-1 / M73), som i sin tur är härledd ur kickoff + lag/
 * grupp av matchtablå-generatorn (T4b) och redan korskollad mot FIFA i
 * match-schedule-source.test.ts. Att joina på det STABILA id:t (inte på datum, som
 * skiljer svensk vs amerikansk lokal-dag) gör join:en entydig: en FIFA-match per
 * repo-match, inga dubbletter/luckor.
 *
 * @param rows     parsade arena-rader.
 * @param matchIds alla match-id i matches.ts (join-mängden, en sanning).
 * @throws Vid varje form av drift mellan arena-källan och matchplanen.
 */
export function buildVenueTable(rows: ParsedVenueRow[], matchIds: readonly string[]): VenueTable {
  const validIds = new Set(matchIds);

  const table = new Map<string, string>();
  for (const row of rows) {
    if (table.has(row.matchId)) {
      throw new Error(
        `Dubblerad arena-rad för ${row.matchId} i källan (varje match exakt en gång).`
      );
    }
    if (!validIds.has(row.matchId)) {
      throw new Error(`Arena-rad för okänt match-id "${row.matchId}" (finns inte i matches.ts).`);
    }
    table.set(row.matchId, row.venue);
  }

  // DRIFT-VAKT (båda håll): varje match i matches.ts MÅSTE ha en arena, annars är
  // datan ofullständig och en match skulle tyst falla tillbaka till platshållaren.
  const missing = matchIds.filter((id) => !table.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Match utan arena (${missing.length}): ${missing.join(', ')}. Varje match i matches.ts ` +
        `måste ha en rad i venue-source.txt (annars behåller den "ej verifierad"-platshållaren).`
    );
  }
  // ANTAL-vakt: exakt lika många arena-rader som matcher (en sista billig grind).
  if (table.size !== matchIds.length) {
    throw new Error(`Förväntade ${matchIds.length} arena-rader, fick ${table.size}.`);
  }
  // 16-ARENOR-vakt: hela turneringen spelas i exakt 16 arenor (FIFA). Färre = en
  // arena tappad/feltranskriberad; fler vore omöjligt (KNOWN_VENUES har bara 16).
  const distinct = new Set(table.values());
  if (distinct.size !== EXPECTED_VENUE_COUNT) {
    throw new Error(
      `Förväntade ${EXPECTED_VENUE_COUNT} distinkta arenor över hela planen, fick ${distinct.size}.`
    );
  }

  return table;
}
