// ÅTERANVÄNDBAR CROSS-MATCH-EVENTS-HOOK (T87, #179; T88 lutar sig på denna). Hämtar events
// för ALLA matcher (smalt SELECT via getLiveEvents) och håller dem NEAR-LIVE färska , så
// skytteligan (T87) och turneringsstatistiken (T88) räknar om sina aggregat inom sekunder
// efter att ett mål/kort trillar, utan en manuell omladdning.
//
// ANSVAR (tunt, ETT seam): hämta cross-match-events och hålla dem färska. Vi bygger INGEN
// egen datahämtning och INGEN egen realtids-/poll-logik , vi ÅTERANVÄNDER:
//   - getLiveEvents äger källval (Supabase smalt SELECT i live-läge, committade fixtures
//     annars). En sanning för "varifrån kommer events".
//   - useNearLiveCollection äger near-live-spine:n (Realtime + 20 s poll + fokus/online/
//     visibility), SAMMA auto-uppdaterings-mekanik som T91 (use-live-data). Den spine:n är nu
//     EXTRAHERAD (T88, rule-of-three) och DELAD med use-cross-match-stats, så det bara finns
//     EN sanning för "hur håller vi cross-match-data färsk" (DRY, PRINCIPLES §3). Tidigare bodde
//     spine:n inline här; den flyttades ordagrant till useNearLiveCollection utan beteende-ändring.
//
// VARFÖR EN EGEN HOOK OCH INTE ÅTERANVÄNDA useLiveData: useLiveData drar `*` (alla tre
// blobbarna) och indexerar per app-match-id för dagsvyns rika livekort. En cross-match-
// aggregering behöver bara events (smalt SELECT, mindre nät/parse) och bryr sig inte om app-
// match-nyckling (den grupperar på spelar-id, inte match-id). Vi delar därför SPINE:n
// (Realtime+poll+fokus, identisk) men inte LADDNINGEN (smal vs bred). Samma val som T86 gjorde
// (egen vy-modell ovanpå delad projektion), en nivå upp.

import { LIVE_READY } from '../../data';
import { getLiveEvents, type LiveMatchEvents } from '../../data/livescore';
import {
  useNearLiveCollection,
  NEAR_LIVE_POLL_INTERVAL_MS,
  type NearLiveStatus,
} from './use-near-live-collection';

/** Laddningstillstånd, samma vokabulär som resten av appen. */
export type CrossMatchEventsStatus = NearLiveStatus;

/** Allt en cross-match-aggregering (skytteliga/turneringsstatistik) behöver. */
export interface CrossMatchEventsResult {
  status: CrossMatchEventsStatus;
  /** Events per match (tom utom vid ready). Råvaran till aggregeringen. */
  matches: readonly LiveMatchEvents[];
  /** Fel-text vid en INITIAL hämtning som failade (tyst re-fetch sväljs, se nedan). */
  error: string | null;
}

/**
 * POLL-FALLBACKENS intervall (ms). Bevarad export (kompatibilitet med T87:s tester); den
 * faktiska poll-cadensen ägs nu av den delade spine:n (NEAR_LIVE_POLL_INTERVAL_MS), och denna
 * alias pekar på exakt samma värde , en sanning för "hur ofta pollar vi live-data".
 */
export const CROSS_MATCH_POLL_INTERVAL_MS = NEAR_LIVE_POLL_INTERVAL_MS;

/**
 * Hämta + håll cross-match-events färska via den delade T91-spine:n (Realtime + poll + fokus/
 * online/visibility). Gatat bakom live-läge.
 *
 * @param env        import.meta.env (injiceras för test, default = riktiga).
 * @param liveReady  injicerbar live-flagga (default LIVE_READY), så live-grenen kan testas
 *                   utan att flippa den globala konstanten (samma mönster som use-live-data).
 */
export function useCrossMatchEvents(
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): CrossMatchEventsResult {
  const { status, rows, error } = useNearLiveCollection<LiveMatchEvents>(
    getLiveEvents,
    // Egen kanal-namnrymd så vi inte krockar med dagsvyns/statistik-hookens kanaler.
    'vm2026-tournament-stats',
    env,
    liveReady
  );
  return { status, matches: rows, error };
}
