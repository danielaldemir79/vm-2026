// PARALLELLT LÄTTVIKTIGT CROSS-MATCH-LÄS-LAGER för STATISTICS (T88, #180). Spegelbild av
// live-events-read.ts (skytteligans events-lager), men för statistics-blobben: turnerings-
// statistikens lag-aggregat (bollinnehav-topp, skott-topp, mest fouls) AGGREGERAR per-lags-
// statistik över ALLA matcher, men behöver BARA statistics-blobben , inte de tunga
// events/lineups-blobbarna. Därför ett EGET, smalt läs-lager bredvid live-events-read.ts:
//   - listLiveStats(client): SELECT bara `match_id, statistics` (inte `*`), så ett cross-
//     match-aggregat över hundratals matcher inte drar ner events/lineups i onödan (mindre
//     nät, mindre parse-arbete). Projicerar varje rad till { matchId, statistics } via SAMMA
//     parser-skarv som live-read (parseStatistics genom RawApiResponse-kuvertet), så det finns
//     EN sanning för "rå blob -> LiveTeamStatistics[]" (DRY, PRINCIPLES §4).
//   - getLiveStats(env): den GATE-medvetna ingången (mappar getDataSourceMode). Live-läge ->
//     Supabase; fixtures-läge -> Bit 1:s committade live-fixtures projicerade till samma form,
//     så turneringsstatistiken kan renderas UTAN backend/nyckel/nät (fixtures-först).
//
// VARFÖR INTE ÅTERANVÄNDA getLiveData (live-read.ts): den läser `*` och parsar ALLA tre
// blobbarna (events + statistics + lineups) per rad , rätt för dagsvyns rika livekort, men
// slöseri för ett rent statistik-aggregat. Och varför ett EGET lager bredvid live-events-read
// (i stället för att utöka det med en statistik-flagga): att hålla varje smalt läs-funktion
// ärlig om EXAKT vilken kolumn den drar är hela poängen (events-aggregaten rör bara events,
// statistik-aggregaten bara statistics). Parser-SKARVEN delas ändå (samma RawApiResponse ->
// Bit 1-parser), så ingen tolknings-drift mot dagsvyn.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database, Json } from '../supabase-types';
import { getDataSourceMode } from '../data-source';
import { getSupabaseClient } from '../supabase-browser';
import { ensureSession } from '../rooms/auth';
import { parseStatistics } from './parse-live';
import { fixtureLiveSnapshots, fixtureLiveStatistics } from './fixtures';
import type { LiveTeamStatistics } from './live-types';
import type { RawApiResponse, RawStatisticsResponse } from './api-football-types';

/** Bara de kolumner cross-match-statistik-läsningen behöver (smalt SELECT, inte hela raden). */
type LiveStatsRow = Pick<
  Database['public']['Tables']['match_live_data']['Row'],
  'match_id' | 'statistics'
>;

/**
 * En matchs parsade per-lags-statistik, allt ett cross-match-statistik-aggregat (turnerings-
 * statistik T88) behöver per match. Avsiktligt MINIMAL: inga events/lineups , de hämtas inte
 * ens (smalt SELECT). matchId bevaras för spårbarhet och stabil React-nyckling.
 */
export interface LiveMatchStats {
  /** Appens match-id (PK i match_live_data), t.ex. 'g-F-1' (live) / 'api-<id>' (fixtures). */
  matchId: string;
  /** Matchens parsade per-lags-statistik. Tom när blobben saknas eller är trasig. */
  statistics: LiveTeamStatistics[];
}

/**
 * Parsa statistics-blobben isolerat (samma kontrakt som live-read.parseBlob för statistics):
 * null (vanligt , statistik sätts inte förrän matchen rullar/fryses) -> []; en TRASIG blob
 * loggas fail-loud men ger [] för just den matchen, så ett trasigt statistik-fält i EN match
 * aldrig släcker hela turneringsstatistiken (de andra matcherna lever vidare). Ingen TYST
 * maskering: felet syns i konsolen (PRINCIPLES §8).
 */
function parseBlobStats(blob: Json | null, matchId: string): LiveTeamStatistics[] {
  if (blob === null) {
    return [];
  }
  try {
    return parseStatistics(blob as unknown as RawApiResponse<RawStatisticsResponse>);
  } catch (err) {
    console.warn(
      `[VM2026] live-stats-read: kunde inte parsa statistik (${matchId}). ` +
        `Matchen hoppas i aggregeringen. Fel: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/** Projicera EN smal rad till { matchId, statistics }. Ren funktion (ingen IO), trivialt testbar. */
export function projectLiveStats(row: LiveStatsRow): LiveMatchStats {
  return {
    matchId: row.match_id,
    statistics: parseBlobStats(row.statistics, row.match_id),
  };
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Lista statistik för ALLA matcher med en rad i match_live_data, men SELECTar bara
 * `match_id, statistics` (inte de tunga events/lineups). RLS SELECT är öppen (live-data är
 * publik fakta), så detta funkar för vem som helst, även en anonym icke-medlem. Säkerställer
 * en session först (ensureSession), exakt som listLiveEvents: datan är publik men appen kör
 * anonym auth, så ett anrop innan sessionen är klar triggar auth i stället för ett oinloggat
 * läge. Fail-loud på ett riktigt Supabase-fel (aldrig tyst tom data).
 */
export async function listLiveStats(client: VmSupabaseClient): Promise<LiveMatchStats[]> {
  await ensureSession(client);
  const { data, error } = await client.from('match_live_data').select('match_id, statistics');
  if (error) {
    fail('Hämta live-statistik', error.message);
  }
  return (data ?? []).map(projectLiveStats);
}

/**
 * Den GATE-medvetna ingången (mappar mot getLiveData): följer datakälle-gaten och väljer
 * källa.
 *   - Live-läge: läs via Supabase-klienten (smalt SELECT, listLiveStats).
 *   - Fixtures-läge: returnera Bit 1:s committade live-fixtures projicerade till
 *     LiveMatchStats, så turneringsstatistiken kan renderas UTAN backend (fixtures-först).
 *
 * @param env  import.meta.env (injiceras för testbarhet, default = riktiga).
 */
export async function getLiveStats(
  env: ImportMetaEnv = import.meta.env
): Promise<LiveMatchStats[]> {
  if (getDataSourceMode(env) === 'live') {
    return listLiveStats(getSupabaseClient(env));
  }
  return fixtureLiveStatsData();
}

/**
 * Bygg fixtures-lägets statistik ur Bit 1:s committade live-fixtures, så turneringsstatistiken
 * kan renderas utan backend. De rika statistics-blobbarna (en verklig 2022-match) hängs på
 * varje fixtures-snapshot, exakt samma vävning som fixtureLiveData (live-read.ts) gör: det är
 * demo-data ur verkliga, parsade svar, inte påhittad data. Nyckeln är 'api-<fixtureId>' (ingen
 * app-match-koppling utan backend , samma som live-read:s fixtures-nyckling). Exporteras så
 * tester och hooken kan använda den utan en klient.
 */
export function fixtureLiveStatsData(): LiveMatchStats[] {
  return fixtureLiveSnapshots.map((snapshot) => ({
    matchId: `api-${snapshot.apiFixtureId}`,
    statistics: fixtureLiveStatistics,
  }));
}
