// REALTIME + KLOCKA för livescore-läsningen (Bit 3a, #181). Två tunna seams ovanpå
// de redan testade byggstenarna, så Bit 3b:s livekort kan (a) uppdateras LIVE när
// pollaren skriver, och (b) ticka mjukt mellan uppdateringar och RE-SYNKA mot DB:ns
// elapsed_minute + last_synced_at vid varje push.
//
// ANSVAR (en sak): koppla ihop match_live_data med den befintliga realtids-seamen
// (src/data/realtime/) och Bit 1:s rena matchklocka (computeClock). Ingen ny kanal-
// eller klock-logik byggs här , vi återanvänder, så det bara finns EN sanning för
// båda (DRY, lärdomen: bygg inte om det som finns).

import type { TableSubscription } from '../realtime';
import { computeClock, type MatchClock } from './live-clock';
import type { LiveData } from './live-read';

/**
 * Tabellnamnet realtids-prenumerationen lyssnar på. Konstant (inte en magisk sträng
 * på flera ställen) så subscription-bygget och migrationen som lägger tabellen i
 * publikationen aldrig kan drifta isär.
 */
export const MATCH_LIVE_DATA_TABLE = 'match_live_data';

/**
 * Bygg realtids-prenumerationen för live-data. Återanvänder den befintliga
 * postgres_changes-seamen (subscribeToTableChanges / useRealtimeSubscription): vi
 * lyssnar på HELA tabellen (ingen rad-filter , klienten visar normalt alla dagens
 * live-matcher, och en filtrering vore bara brusreducering, inte säkerhet , RLS är
 * skyddet). Vid varje händelse kör konsumenten sin TYSTA re-fetch (samma härledd-
 * state-mönster som T18: payloaden läses aldrig, vi refetchar färdiga rader genom RLS).
 *
 * Bit 3b matar denna i useRealtimeSubscription({ tables: liveDataSubscription(), ... }).
 */
export function liveDataSubscription(): TableSubscription[] {
  return [{ table: MATCH_LIVE_DATA_TABLE }];
}

/**
 * Beräkna matchklockan för EN live-rad vid tidpunkten `now`. Tunn brygga till Bit 1:s
 * rena computeClock: den gör hela det svåra (frys i paus, mjuk tick under live, kapa
 * vid halvleksgräns, aldrig springa på okänd status). Vi bara översätter LiveData ->
 * computeClock-argumenten.
 *
 * RE-SYNK: computeClock tickar FRÅN lastSyncedAt och projicerar elapsed + minuter
 * sedan dess. Vid varje realtids-push hämtas en NY LiveData med färsk elapsedMinute +
 * lastSyncedAt, och nästa computeClock-anrop utgår från den , så klockan re-synkar mot
 * sanningen vid varje uppdatering och kan aldrig glida iväg. Mellan pushar ticker UI:t
 * bara genom att kalla denna med ett färskt `now` (t.ex. via en sekund-/minut-timer).
 *
 * SÄKERHET MOT TRASIG TID: saknas lastSyncedAt (aldrig synkad), eller är den ett
 * oparsbart datum, kan vi inte ticka från en känd punkt. Då faller vi tillbaka på
 * `now` som sync-punkt , det betyder "0 minuter sedan sync", dvs klockan visar
 * elapsed oförändrad och tickar inte i väg på en gissad startpunkt (fail-safe, gissa
 * aldrig en tick-bas). Statusen styr ändå (en 'paused'/'finished'-rad tickar inte alls).
 *
 * @param data  den projicerade live-raden.
 * @param now   nuet (epoch-ms), INJICERAS (aldrig Date.now() här), så ticken är
 *              deterministiskt testbar , samma princip som computeClock självt.
 */
export function liveClockFor(data: LiveData, now: number): MatchClock {
  const lastSyncMs = parseSyncMs(data.lastSyncedAt, now);
  return computeClock(data.status, data.elapsedMinute, lastSyncMs, now);
}

/**
 * Tolka last_synced_at (ISO) till epoch-ms för klock-basen. Null eller ett oparsbart
 * datum -> `now` (= "0 min sedan sync", se liveClockFor-doc), aldrig en gissad punkt.
 */
function parseSyncMs(lastSyncedAt: string | null, now: number): number {
  if (lastSyncedAt === null) {
    return now;
  }
  const ms = Date.parse(lastSyncedAt);
  return Number.isNaN(ms) ? now : ms;
}
