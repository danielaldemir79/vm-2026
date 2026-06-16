// ÅTERANVÄNDBAR CROSS-MATCH-STATISTICS-HOOK (T88, #180). Hämtar per-lags-statistik för ALLA
// matcher (smalt SELECT via getLiveStats) och håller den NEAR-LIVE färsk , så turnerings-
// statistikens lag-aggregat (bollinnehav-topp, skott-topp, mest fouls) räknas om inom sekunder
// efter att pollaren skrivit ny statistik, utan en manuell omladdning.
//
// ANSVAR (tunt, ETT seam): hämta cross-match-statistik och hålla den färsk. Vi bygger INGEN
// egen datahämtning och INGEN egen realtids-/poll-logik , vi ÅTERANVÄNDER:
//   - getLiveStats äger källval (Supabase smalt SELECT i live-läge, committade fixtures annars).
//   - useNearLiveCollection äger near-live-spine:n (Realtime + 20 s poll + fokus/online/
//     visibility), DELAD med use-cross-match-events (rule-of-three, se den hookens header).
// Denna fil är därför bara en tunn, typad adapter: namnger sin egen Realtime-kanal och
// projicerar spine:ns generiska `rows` till det vy-vänliga `matches`-namnet (samma kontrakt
// som useCrossMatchEvents, så aggregeringen ovanpå känner igen sig).

import { LIVE_READY } from '../../data';
import { getLiveStats, type LiveMatchStats } from '../../data/livescore';
import { useNearLiveCollection, type NearLiveStatus } from './use-near-live-collection';

/** Laddningstillstånd, samma vokabulär som resten av appen. */
export type CrossMatchStatsStatus = NearLiveStatus;

/** Allt turneringsstatistikens lag-aggregat behöver. */
export interface CrossMatchStatsResult {
  status: CrossMatchStatsStatus;
  /** Per-lags-statistik per match (tom utom vid ready). Råvaran till aggregeringen. */
  matches: readonly LiveMatchStats[];
  /** Fel-text vid en INITIAL hämtning som failade (tyst re-fetch sväljs). */
  error: string | null;
}

/**
 * Hämta + håll cross-match-statistik färsk via den delade T91-spine:n. Gatat bakom live-läge.
 *
 * @param env        import.meta.env (injiceras för test, default = riktiga).
 * @param liveReady  injicerbar live-flagga (default LIVE_READY), så live-grenen kan testas
 *                   utan att flippa den globala konstanten (samma mönster som use-live-data).
 */
export function useCrossMatchStats(
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): CrossMatchStatsResult {
  const { status, rows, error } = useNearLiveCollection<LiveMatchStats>(
    getLiveStats,
    // Egen kanal-namnrymd så vi inte krockar med skytteligans/dagsvyns kanaler.
    'vm2026-tournament-stats-stats',
    env,
    liveReady
  );
  return { status, matches: rows, error };
}
