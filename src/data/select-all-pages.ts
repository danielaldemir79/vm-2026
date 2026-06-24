// SIDINDELAD FULL-LÄSNING med STABIL ordning + completeness-vakt (T90, #183, F1-fix).
// REN funktion, ingen IO, ingen Supabase-/Deno-global , den gissningskänsliga loop-logiken
// bor här (testbar i Vitest). EN sanning för 1000-cap-skyddet, delad av BÅDA läs-vägarna:
//   * edge-funktionen (global topplista) matar in en Deno-page-fetcher (selectAll),
//   * klienten (rummets topplista + admin-vyn) matar in en browser-page-fetcher (selectAllRows).
// Tidigare bodde filen under global-leaderboard/, men cap:en är en Supabase-bred sanning,
// inte leaderboard-specifik, så den flyttades hit (neutral data-layer-primitiv) när klient-
// läsarna (predictions/group/bracket + admin) behövde samma skydd (F1, 2026-06-24).
//
// ============================================================================
// VARFÖR (DATAINTEGRITET, F1): pagineringen MÅSTE vara totalordnad
// ============================================================================
// Supabase/PostgREST cap:ar .select() (och RPC-SETOF) till ~1000 rader/anrop, så hela
// mängden läses sidvis (predictions ~18k = 19 sidor, bracket ~8k, group ~3k). PostgREST/
// Postgres GARANTERAR INTE samma radordning mellan två anrop UTAN en total ORDER BY: under
// samtidiga skrivningar eller en annan query-plan kan en rad hoppas över (understruken
// poäng) eller dubbleras (samma match räknas två gånger -> uppblåst poäng) vid sid-
// gränsen , exakt den fairness-/integritets-bugg T90 skulle FIXA. Därför kräver vi att
// anroparen läser med en STABIL, totalordnande nyckel (tabellens PK), och vi vaktar
// dessutom completeness mot ett EXAKT count (fail-loud om hämtat antal != förväntat).
// Källa: senior-developer-lärdom "paginerad-las-utan-stabil-order-..." (reviewer T90),
// verifierat mot live prod-radantal (18061 predictions = 19 sidor).

/** Standard sidstorlek (Supabase/PostgREST-cap på .select()). */
export const DEFAULT_PAGE_SIZE = 1000;

/** En sid-förfrågan: rad-intervallet [from, to] (inklusivt, .range()-semantik). */
export interface PageRequest {
  from: number;
  to: number;
}

/**
 * En sids resultat: raderna PLUS det EXAKTA total-antalet i tabellen (PostgREST
 * `count: 'exact'`). Totalet låter den rena loopen verifiera completeness, en delläsning
 * ska aldrig tyst ge en felaktig topplista.
 */
export interface PageResult<T> {
  rows: readonly T[];
  /** Tabellens totala radantal (exact count), samma på varje sida. */
  total: number;
}

/**
 * Hämta EN sida (anroparens IO-detalj). Anroparen MÅSTE applicera en stabil, totalordnande
 * ORDER BY (tabellens PK) OCH be om ett exact count, annars är completeness-vakten blind
 * och sid-gränsen odefinierad (se fil-headern).
 */
export type PageFetcher<T> = (request: PageRequest) => Promise<PageResult<T>>;

/**
 * Läs ALLA rader ur en sidindelad källa, deterministiskt och fail-loud.
 *
 * Vi loopar sidvis tills vi sett `total` rader (det exakta count:et källan rapporterar),
 * och verifierar sedan att vi fick EXAKT så många , varken färre (tappad rad) eller fler
 * (dubblerad rad). Avviker antalet KASTAR vi hellre än att returnera en topplista byggd
 * på ofullständig/dubblerad data (PRINCIPLES §8, fail loud).
 *
 * @param fetchPage  Hämtar en sida (med stabil ORDER BY + exact count, anroparens ansvar).
 * @param label      Kort tabell-/käll-namn för ett begripligt felmeddelande.
 * @param pageSize   Sidstorlek (default {@link DEFAULT_PAGE_SIZE}). Injicerbar för test.
 * @returns          Alla rader i källans (totalordnade) ordning.
 * @throws           Om det hämtade antalet inte matchar det rapporterade total:et, eller om
 *                   en sida överskrider det förväntade total:et (skydd mot oändlig loop /
 *                   instabil ordning som ger dubbletter).
 */
export async function selectAllPages<T>(
  fetchPage: PageFetcher<T>,
  label: string,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<T[]> {
  if (pageSize <= 0) {
    throw new Error(`selectAllPages(${label}): sidstorlek måste vara > 0 (fick ${pageSize}).`);
  }
  const rows: T[] = [];
  let from = 0;
  let expectedTotal: number | null = null;

  for (;;) {
    const { rows: page, total } = await fetchPage({ from, to: from + pageSize - 1 });

    // Lås det förväntade total:et från första sidan; en källa som plötsligt ändrar sitt
    // count mitt i läsningen är en instabilitet vi hellre fail-loud:ar på än gissar kring.
    if (expectedTotal === null) {
      expectedTotal = total;
    }

    rows.push(...page);

    // En sida kortare än sidstorleken = sista sidan (inga fler rader att hämta).
    if (page.length < pageSize) {
      break;
    }
    from += pageSize;

    // Säkerhets-vakt mot en aldrig-krympande sida (instabil ordning / källa som växer
    // obegränsat): har vi redan hämtat MER än det förväntade total:et stämmer något inte.
    if (rows.length > expectedTotal) {
      throw new Error(
        `selectAllPages(${label}): läste ${rows.length} rader men källan rapporterade ` +
          `${expectedTotal} (over-read , trolig instabil ordning utan stabil ORDER BY). ` +
          'Avbryter hellre än att bygga en topplista på dubblerad data.'
      );
    }
  }

  // COMPLETENESS-VAKT: hämtat antal MÅSTE matcha det rapporterade exact-count:et. Färre =
  // tappad rad (understruken poäng), fler = dubblerad rad (uppblåst poäng). Båda fel-loud.
  if (expectedTotal !== null && rows.length !== expectedTotal) {
    throw new Error(
      `selectAllPages(${label}): hämtade ${rows.length} rader men källan rapporterade ` +
        `${expectedTotal} (ofullständig/dubblerad läsning). Avbryter hellre än att returnera ` +
        'en felaktig topplista.'
    );
  }

  return rows;
}
