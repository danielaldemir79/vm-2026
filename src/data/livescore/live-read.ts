// KLIENT-LÄS-LAGER för livescore (Bit 3a, #181). Hämtar persisterad live-data ur
// Supabase-tabellen match_live_data och PROJICERAR varje rad till en klient-vänlig
// modell (LiveData) som UI:t (Bit 3b) kan rendera direkt: ställning, status, klock-
// underlag, händelser, statistik, laguppställningar, frozen, last_synced_at.
//
// ANSVAR (tunt, en sak): DB-rad -> klient-modell. Två lager, samma uppdelning som
// data-source.ts/supabase-client.ts:
//   - listLiveData(client) / projectLiveData(row): rena, klient-tagande funktioner
//     (testbara med en mock-klient, exakt som official-results-api.ts).
//   - getLiveData(env): den GATE-medvetna ingången. Följer datakälle-gaten
//     (isLiveActive) , i live-läge läser den via Supabase-klienten, i fixtures-läge
//     returnerar den Bit 1:s committade live-fixtures, så UI:t kan renderas UTAN
//     backend/nyckel/nätverk (fixtures-först, samma princip som getDataSource).
//
// FORMEN HÄRLEDS UR DB-TYPERNA (supabase-types.ts), inte ur en konsument-typ, så en
// schema-drift blir ett kompileringsfel (lärdomen mock-foljer-konsumenttyp). De RÅA
// jsonb-blobbarna (events/statistics/lineups) parsas med Bit 1:s RIKTIGA parsers
// (parse-live.ts), exakt de pollaren matar in (en sanning för parsningen).
//
// DEN FARLIGA SKARVEN (källhänvisad, se decisions.md 2026-06-15): de tre jsonb-
// blobbarna lagras av pollaren som HELA API-Football-svar (RawApiResponse-kuvert:
// { get, results, response, errors }), EXAKT den form Bit 1:s parsers tar. Vi gissar
// alltså aldrig formen, vi kör dem genom parsern. Tre fall hanteras explicit:
//   1. null (vanligt: live=all bär inte events/stats/lineups förrän freeze) -> []
//      (säkert tomt, en pågående match har ännu inga rika blobbar).
//   2. ett giltigt RawApiResponse-kuvert -> parserns utdata.
//   3. en TRASIG blob (fel form) -> parsern kastar; vi FÅNGAR per blob, loggar
//      fail-loud i konsolen och låter just DEN sektionen bli tom, så ett trasigt
//      events-fält aldrig kan släcka hela livekortet (status/ställning/klocka lever
//      vidare). Ingen TYST maskering: felet syns i konsolen (PRINCIPLES §8), men en
//      enskild trasig sektion kraschar inte vyn (Daniels "aldrig krasch"-krav).

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database, Json } from '../supabase-types';
import { getDataSourceMode } from '../data-source';
import { getSupabaseClient } from '../supabase-browser';
import { ensureSession } from '../rooms/auth';
import { parseEvents, parseLineups, parseStatistics } from './parse-live';
import {
  fixtureLiveEvents,
  fixtureLiveLineups,
  fixtureLiveSnapshots,
  fixtureLiveStatistics,
} from './fixtures';
import type { LiveEvent, LiveLineup, LiveStatus, LiveTeamStatistics } from './live-types';
import type { RawApiResponse } from './api-football-types';

type LiveDataRow = Database['public']['Tables']['match_live_data']['Row'];

/** De normaliserade LiveStatus-värden DB:n bär (pollaren skriver redan normaliserat). */
const VALID_STATUS: ReadonlySet<LiveStatus> = new Set<LiveStatus>([
  'scheduled',
  'live',
  'paused',
  'finished',
  'postponed',
  'unknown',
]);

/**
 * En matchs persisterade live-data så UI:t (Bit 3b) ser den. Allt UI behöver för att
 * rendera ett livekort + klocka, redan parsad ur de råa blobbarna.
 *
 * Formen är HÄRLEDD ur DB-raden (match_live_data) + Bit 1:s parser-utdata, inte ur en
 * konsument-typ, så en schema-drift fångas av tsc i stället för i en otestad live-gren.
 */
export interface LiveData {
  /** Appens match-id (PK i match_live_data), t.ex. 'g-F-1'. */
  matchId: string;
  /** API-Footballs fixture-id (spårbarhet), null om pollaren ännu inte satt det. */
  apiFixtureId: number | null;
  /** Normaliserad status (Bit 1:s LiveStatus). 'unknown' om DB-värdet saknas/okänt. */
  status: LiveStatus;
  /** Spelad minut enligt API:t, null i pauser/före avspark (klock-underlag). */
  elapsedMinute: number | null;
  /** Löpande ställning, null mycket tidigt innan API:t satt den. */
  homeGoals: number | null;
  awayGoals: number | null;
  /** Parsade matchhändelser (mål/kort/byten/var). Tom när blobben saknas eller är trasig. */
  events: LiveEvent[];
  /** Parsad per-lags-statistik. Tom när blobben saknas eller är trasig. */
  statistics: LiveTeamStatistics[];
  /** Parsade laguppställningar. Tom när blobben saknas eller är trasig. */
  lineups: LiveLineup[];
  /** true när snapshotten är fryst (FT) , bläddringsbar dagar tillbaka, uppdateras ej mer. */
  frozen: boolean;
  /** När pollaren senast skrev raden (ISO), klock-underlag (re-sync av computeClock). Null om aldrig synkad. */
  lastSyncedAt: string | null;
}

/**
 * Normalisera ett DB-status-värde till LiveStatus. Pollaren skriver alltid en av
 * Bit 1:s normaliserade koder, men kolumnen är `text` (kan vara null), så vi
 * fail-SAFE:ar till 'unknown' (ALDRIG 'live') vid null eller ett oväntat värde,
 * så klockan aldrig springer på en status vi inte förstår (samma anda som
 * normalizeStatus i parse-live.ts).
 */
function toLiveStatus(raw: string | null): LiveStatus {
  return raw !== null && VALID_STATUS.has(raw as LiveStatus) ? (raw as LiveStatus) : 'unknown';
}

/**
 * Parsa EN jsonb-blob genom en Bit 1-parser, isolerat. En blob som är null (vanligt:
 * inte ännu satt) ger []. En TRASIG blob (parsern kastar) loggas fail-loud men ger []
 * för just den sektionen , så ett trasigt fält aldrig släcker hela livekortet (men
 * felet maskeras INTE tyst, det syns i konsolen, PRINCIPLES §8).
 *
 * @param blob    den råa jsonb-blobben ur DB-raden (ett RawApiResponse-kuvert eller null).
 * @param parse   Bit 1:s parser (parseEvents/parseStatistics/parseLineups).
 * @param what    sektionens namn (för logg-meddelandet) + matchId-kontext.
 */
function parseBlob<P, T>(
  blob: Json | null,
  parse: (payload: RawApiResponse<P>) => T[],
  what: string
): T[] {
  if (blob === null) {
    return [];
  }
  try {
    return parse(blob as unknown as RawApiResponse<P>);
  } catch (err) {
    // Fail-loud i konsolen (inte tyst), men låt sektionen bli tom så resten av
    // livekortet (status/ställning/klocka) lever vidare. Ett trasigt events-fält
    // ska aldrig krascha hela vyn (Daniels "aldrig krasch"-krav).
    console.warn(
      `[VM2026] live-read: kunde inte parsa ${what} (blobben är trasig/oväntad form). ` +
        `Sektionen visas tom. Fel: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/**
 * Projicera EN match_live_data-rad till klient-modellen LiveData. Ren funktion
 * (ingen IO), så den är trivialt testbar mot DB-radens form direkt.
 */
export function projectLiveData(row: LiveDataRow): LiveData {
  return {
    matchId: row.match_id,
    apiFixtureId: row.api_fixture_id,
    status: toLiveStatus(row.status),
    elapsedMinute: row.elapsed_minute,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    events: parseBlob(row.events, parseEvents, `events (${row.match_id})`),
    statistics: parseBlob(row.statistics, parseStatistics, `statistics (${row.match_id})`),
    lineups: parseBlob(row.lineups, parseLineups, `lineups (${row.match_id})`),
    frozen: row.frozen,
    lastSyncedAt: row.last_synced_at,
  };
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Lista ALL persisterad live-data (alla matcher med en rad i match_live_data). RLS
 * SELECT är öppen (live-data är publik fakta), så detta funkar för vem som helst ,
 * även en anonym icke-medlem. Säkerställer en session först (ensureSession), exakt
 * som listOfficialResults: datan är publik men appen kör anonym auth, så ett anrop
 * innan sessionen är klar triggar auth i stället för att slå mot ett oinloggat läge.
 *
 * Fail-loud (PRINCIPLES §8): ett Supabase-fel kastas vidare med svensk text, aldrig
 * tyst tom data.
 */
export async function listLiveData(client: VmSupabaseClient): Promise<LiveData[]> {
  await ensureSession(client);
  const { data, error } = await client.from('match_live_data').select('*');
  if (error) {
    fail('Hämta live-data', error.message);
  }
  return (data ?? []).map(projectLiveData);
}

/**
 * Hämta live-data för EN match (PK-uppslag på match_id). Returnerar null om matchen
 * ännu inte har någon rad (ingen live-data fångad , inte ett fel, en match före
 * avspark har naturligt ingen rad). Fail-loud på ett riktigt Supabase-fel.
 */
export async function getLiveDataForMatch(
  client: VmSupabaseClient,
  matchId: string
): Promise<LiveData | null> {
  await ensureSession(client);
  const { data, error } = await client
    .from('match_live_data')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error) {
    fail(`Hämta live-data för ${matchId}`, error.message);
  }
  return data ? projectLiveData(data) : null;
}

/**
 * Den GATE-medvetna ingången (mappar mot getDataSource): följer datakälle-gaten och
 * väljer källa.
 *   - Live-läge (env satt + LIVE_READY): läs via Supabase-klienten (listLiveData).
 *   - Fixtures-läge: returnera Bit 1:s committade live-fixtures projicerade till
 *     LiveData, så UI:t kan renderas UTAN backend (fixtures-först). En synlig logg
 *     görs av getDataSource redan; vi loggar inte dubbelt.
 *
 * @param env  import.meta.env (injiceras för testbarhet, default = riktiga).
 */
export async function getLiveData(env: ImportMetaEnv = import.meta.env): Promise<LiveData[]> {
  if (getDataSourceMode(env) === 'live') {
    return listLiveData(getSupabaseClient(env));
  }
  return fixtureLiveData();
}

/**
 * Bygg fixtures-lägets LiveData ur Bit 1:s committade live-fixtures (en pågående
 * VM-match + de rika 2022-blobbarna), så Bit 3b:s livekort kan renderas utan backend.
 * De rika blobbarna (events/statistik/laguppställning) hör inte till live-all-matchen,
 * men i fixtures-läge vill vi visa ett RIKT kort, så vi väver in dem på den enda
 * fixtures-matchen (det är demo-data, inte påhittad live-data: varje del är en verklig
 * parsad fixtur). Exporteras så tester och UI kan använda den utan en klient.
 *
 * DEMO-KLOCKAN TICKAR (lessons: tidsberoende headline-UI bara bevisat med injicerat now):
 * en PÅGÅENDE fixtures-match sätter lastSyncedAt = `now` (inte den FRUSNA kickoffUtc).
 * Då är "minuter sedan sync" alltid 0 vid läsning, så klockan visar snapshotens elapsed
 * och TICKAR mjukt framåt i stället för att slå i halvleks-taket ("45+") , den committade
 * kickoff-tidsstämpeln åldras annars och drar demo-klockan till sitt tak (raka motsatsen
 * till live-känslan kortet är byggt för). En FRUSEN (finished) demo-match rör vi inte:
 * den tickar ändå inte och ska visa sin historiska sync-tid. `now` injiceras för
 * deterministiska tester (default Date.now()).
 *
 * @param now  nuet (epoch-ms), injiceras för test (default = aktuell tid).
 */
export function fixtureLiveData(now: number = Date.now()): LiveData[] {
  const nowIso = new Date(now).toISOString();
  return fixtureLiveSnapshots.map((snapshot) => {
    const finished = snapshot.status === 'finished';
    return {
      matchId: `api-${snapshot.apiFixtureId}`,
      apiFixtureId: snapshot.apiFixtureId,
      status: snapshot.status,
      elapsedMinute: snapshot.elapsedMinute,
      homeGoals: snapshot.homeGoals,
      awayGoals: snapshot.awayGoals,
      events: fixtureLiveEvents,
      statistics: fixtureLiveStatistics,
      lineups: fixtureLiveLineups,
      // Fixtures-matchen är en PÅGÅENDE match (live=all), alltså inte fryst.
      frozen: finished,
      // Pågående demo: synka till NU så klockan tickar (se doc ovan). Frusen: behåll den
      // historiska kickoff-tiden (en avslutad match tickar inte oavsett).
      lastSyncedAt: finished ? snapshot.kickoffUtc : nowIso,
    };
  });
}
