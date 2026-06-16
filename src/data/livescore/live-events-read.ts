// LÄTTVIKTIGT CROSS-MATCH-LÄS-LAGER för EVENTS (T87, #179: skytteliga; T88 lutar sig på
// detta). Skytteligan/turneringsstatistiken AGGREGERAR mål/assist/kort över ALLA matcher,
// men behöver BARA events-blobben , inte de tunga statistics/lineups-blobbarna (som väger
// flera kB per match och inte används av en cross-match-aggregering). Därför ett EGET, smalt
// läs-lager bredvid live-read.ts:
//   - listLiveEvents(client): SELECT bara `match_id, events` (inte `*`), så en topplista
//     över hundratals matcher inte drar ner statistics/lineups i onödan (mindre nät, mindre
//     parse-arbete). Projicerar varje rad till { matchId, events } via SAMMA parser-skarv
//     som live-read (parseEvents genom RawApiResponse-kuvertet), så det finns EN sanning för
//     "rå blob -> LiveEvent[]" (DRY, PRINCIPLES §4).
//   - getLiveEvents(env): den GATE-medvetna ingången (mappar getLiveData/getDataSourceMode).
//     Live-läge -> Supabase; fixtures-läge -> Bit 1:s committade live-fixtures projicerade
//     till samma form, så skytteligan kan renderas UTAN backend/nyckel/nät (fixtures-först).
//
// VARFÖR INTE ÅTERANVÄNDA getLiveData (live-read.ts): den läser `*` och parsar ALLA tre
// blobbarna (events + statistics + lineups) per rad , rätt för dagsvyns rika livekort, men
// slöseri för en ren skytteliga som bara rör events. Att lägga ett smalt SELECT bredvid (i
// stället för att utöka getLiveData med en "vilka kolumner"-flagga) håller varje läs-funktion
// enkel och ärlig om vad den hämtar. Parser-SKARVEN delas ändå (parseBlobEvents nedan speglar
// live-read.parseBlob för just events), så ingen tolknings-drift mot dagsvyn.

import type { VmSupabaseClient } from '../supabase-browser';
import type { Database, Json } from '../supabase-types';
import { getDataSourceMode } from '../data-source';
import { getSupabaseClient } from '../supabase-browser';
import { ensureSession } from '../rooms/auth';
import { parseEvents } from './parse-live';
import { fixtureLiveEvents, fixtureLiveSnapshots } from './fixtures';
import type { LiveEvent } from './live-types';
import type { RawApiResponse, RawEvent } from './api-football-types';

/** Bara de kolumner cross-match-events-läsningen behöver (smalt SELECT, inte hela raden). */
type LiveEventsRow = Pick<
  Database['public']['Tables']['match_live_data']['Row'],
  'match_id' | 'events'
>;

/**
 * En matchs parsade events, allt en cross-match-aggregering (skytteliga T87,
 * turneringsstatistik T88) behöver per match. Avsiktligt MINIMAL: inget status/ställning/
 * statistik/lineup , de hämtas inte ens (smalt SELECT). matchId bevaras för spårbarhet och
 * stabil React-nyckling.
 */
export interface LiveMatchEvents {
  /** Appens match-id (PK i match_live_data), t.ex. 'g-F-1' (live) / 'api-<id>' (fixtures). */
  matchId: string;
  /** Matchens parsade events (mål/kort/byten/var). Tom när blobben saknas eller är trasig. */
  events: LiveEvent[];
}

/**
 * Parsa events-blobben isolerat (samma kontrakt som live-read.parseBlob för events): null
 * (vanligt , events sätts inte förrän matchen rullar/fryses) -> []; en TRASIG blob loggas
 * fail-loud men ger [] för just den matchen, så ett trasigt events-fält i EN match aldrig
 * släcker hela skytteligan (de andra matcherna lever vidare). Ingen TYST maskering: felet
 * syns i konsolen (PRINCIPLES §8).
 */
function parseBlobEvents(blob: Json | null, matchId: string): LiveEvent[] {
  if (blob === null) {
    return [];
  }
  try {
    return parseEvents(blob as unknown as RawApiResponse<RawEvent>);
  } catch (err) {
    console.warn(
      `[VM2026] live-events-read: kunde inte parsa events (${matchId}). ` +
        `Matchen hoppas i aggregeringen. Fel: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/** Projicera EN smal rad till { matchId, events }. Ren funktion (ingen IO), trivialt testbar. */
export function projectLiveEvents(row: LiveEventsRow): LiveMatchEvents {
  return {
    matchId: row.match_id,
    events: parseBlobEvents(row.events, row.match_id),
  };
}

/** Kasta ett begripligt fel ur ett Supabase-fel (fail loud, svensk text). */
function fail(operation: string, message: string): never {
  throw new Error(`[VM2026] ${operation} misslyckades: ${message}`);
}

/**
 * Lista events för ALLA matcher med en rad i match_live_data, men SELECTar bara
 * `match_id, events` (inte de tunga statistics/lineups). RLS SELECT är öppen (live-data är
 * publik fakta), så detta funkar för vem som helst, även en anonym icke-medlem. Säkerställer
 * en session först (ensureSession), exakt som listLiveData: datan är publik men appen kör
 * anonym auth, så ett anrop innan sessionen är klar triggar auth i stället för ett oinloggat
 * läge. Fail-loud på ett riktigt Supabase-fel (aldrig tyst tom data).
 */
export async function listLiveEvents(client: VmSupabaseClient): Promise<LiveMatchEvents[]> {
  await ensureSession(client);
  const { data, error } = await client.from('match_live_data').select('match_id, events');
  if (error) {
    fail('Hämta live-events', error.message);
  }
  return (data ?? []).map(projectLiveEvents);
}

/**
 * Den GATE-medvetna ingången (mappar mot getLiveData): följer datakälle-gaten och väljer
 * källa.
 *   - Live-läge: läs via Supabase-klienten (smalt SELECT, listLiveEvents).
 *   - Fixtures-läge: returnera Bit 1:s committade live-fixtures projicerade till
 *     LiveMatchEvents, så skytteligan kan renderas UTAN backend (fixtures-först).
 *
 * @param env  import.meta.env (injiceras för testbarhet, default = riktiga).
 */
export async function getLiveEvents(
  env: ImportMetaEnv = import.meta.env
): Promise<LiveMatchEvents[]> {
  if (getDataSourceMode(env) === 'live') {
    return listLiveEvents(getSupabaseClient(env));
  }
  return fixtureLiveEventsData();
}

/**
 * Bygg fixtures-lägets events ur Bit 1:s committade live-fixtures, så skytteligan kan
 * renderas utan backend. De rika events-blobbarna (en verklig 2022-match) hängs på varje
 * fixtures-snapshot, exakt samma vävning som fixtureLiveData (live-read.ts) gör: det är
 * demo-data ur verkliga, parsade svar, inte påhittad data. Nyckeln är 'api-<fixtureId>'
 * (ingen app-match-koppling utan backend , samma som live-read:s fixtures-nyckling).
 * Exporteras så tester och hooken kan använda den utan en klient.
 */
export function fixtureLiveEventsData(): LiveMatchEvents[] {
  return fixtureLiveSnapshots.map((snapshot) => ({
    matchId: `api-${snapshot.apiFixtureId}`,
    events: fixtureLiveEvents,
  }));
}
