// ÅTERANVÄNDBAR CROSS-MATCH-EVENTS-HOOK (T87, #179; T88 lutar sig på denna). Hämtar events
// för ALLA matcher (smalt SELECT via getLiveEvents) och håller dem NEAR-LIVE färska , så
// skytteligan (T87) och turneringsstatistiken (T88) räknar om sina aggregat inom sekunder
// efter att ett mål/kort trillar, utan en manuell omladdning.
//
// ANSVAR (tunt, ETT seam): hämta cross-match-events och hålla dem färska. Vi bygger INGEN
// egen datahämtning och INGEN egen realtids-/poll-logik , vi ÅTERANVÄNDER:
//   - getLiveEvents äger källval (Supabase smalt SELECT i live-läge, committade fixtures
//     annars). En sanning för "varifrån kommer events".
//   - SAMMA auto-uppdaterings-spine som T91 (use-live-data): Realtime-prenumeration på
//     match_live_data som PRIMÄR väg + en periodisk POLL-fallback + fokus/online/visibility-
//     refetch. Postgres-changes-WebSocketen är bräcklig på mobil (skärmlås suspenderar den,
//     ett nätglapp ger tyst ingen push), så skyddsnätet garanterar att aggregaten aldrig
//     fryser om en push missas. Identisk mekanik som dagsvyns livescore , medvetet, så det
//     bara finns EN sanning för "hur håller vi live-data färsk" (DRY).
//
// SIGNAL-INTE-DATA (samma härledd-state-mönster som use-live-data/T18): en realtids-push
// (eller poll-/fokus-trigger) LÄSER vi aldrig payloaden ur; den bumpar bara en nonce -> en
// (1) tyst re-fetch genom getLiveEvents/RLS. RLS SELECT på match_live_data är öppen (live-
// data är publik fakta), så en anonym besökare får datan likväl.
//
// GATAT BAKOM LIVE-LÄGE (direktiv): Realtime-kanalen + poll + fokus-lyssnare kopplas BARA i
// live-läge (liveConfigured). I fixtures/demo-läge finns ingen backend att väcka , en enda
// initial hämtning av de committade fixtures-events, sedan vila (negativ-kontroll i testet).
//
// VARFÖR EN EGEN HOOK OCH INTE ÅTERANVÄNDA useLiveData: useLiveData drar `*` (alla tre
// blobbarna) och indexerar per app-match-id för dagsvyns rika livekort. En cross-match-
// aggregering behöver bara events (smalt SELECT, mindre nät/parse) och bryr sig inte om app-
// match-nyckling (den grupperar på spelar-id, inte match-id). Vi delar därför SPINE:n
// (Realtime+poll+fokus, identisk) men inte LADDNINGEN (smal vs bred). Samma val som T86 gjorde
// (egen vy-modell ovanpå delad projektion), en nivå upp.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDataSourceMode, isSupabaseConfigured, LIVE_READY } from '../../data';
import { getLiveEvents, liveDataSubscription, type LiveMatchEvents } from '../../data/livescore';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { useRealtimeSubscription } from '../../data/realtime';

/** Laddningstillstånd, samma vokabulär som resten av appen. */
export type CrossMatchEventsStatus = 'loading' | 'ready' | 'error';

/** Allt en cross-match-aggregering (skytteliga/turneringsstatistik) behöver. */
export interface CrossMatchEventsResult {
  status: CrossMatchEventsStatus;
  /** Events per match (tom utom vid ready). Råvaran till aggregeringen. */
  matches: readonly LiveMatchEvents[];
  /** Fel-text vid en INITIAL hämtning som failade (tyst re-fetch sväljs, se nedan). */
  error: string | null;
}

const EMPTY: readonly LiveMatchEvents[] = [];

/**
 * POLL-FALLBACKENS intervall (ms). Återanvänder SAMMA cadens som use-live-data
 * (LIVE_POLL_INTERVAL_MS = 20 s): livescore-pollaren skriver match_live_data var ~30:e sekund
 * under live, så en klient-poll på 20 s fångar varje ny snapshot inom några sekunder (kravet
 * "inom sekunder"), och eftersom Realtime normalt levererar pushen FÖRST är pollen i praktiken
 * bara redundans. Egen konstant (inte importerad ur daily) så cross-match-lagret inte beror på
 * en dagsvy-detalj, men avsiktligt samma värde , en sanning för "hur ofta pollar vi live-data".
 */
export const CROSS_MATCH_POLL_INTERVAL_MS = 20_000;

/**
 * Hämta + håll cross-match-events färska via T91-spine:n (Realtime + poll + fokus/online/
 * visibility). Gatat bakom live-läge.
 *
 * @param env        import.meta.env (injiceras för test, default = riktiga).
 * @param liveReady  injicerbar live-flagga (default LIVE_READY), så live-grenen kan testas
 *                   utan att flippa den globala konstanten (samma mönster som use-live-data).
 */
export function useCrossMatchEvents(
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): CrossMatchEventsResult {
  const mode = useMemo(() => getDataSourceMode(env, liveReady), [env, liveReady]);
  const liveConfigured = isSupabaseConfigured(env) && liveReady;

  const [status, setStatus] = useState<CrossMatchEventsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<readonly LiveMatchEvents[]>(EMPTY);
  // RE-FETCH-INVALIDERING (samma seam som use-live-data/T18): vilken som helst av de tre
  // triggrarna (Realtime-push, poll-tick, fokus/online/visibility) bumpar denna, som ligger i
  // load-effektens deps -> en tyst re-fetch. Monotont tal: ingen trigg tappas.
  const [refetchNonce, setRefetchNonce] = useState(0);

  // Supabase-klienten (bara i live-läge), för realtids-kanalen. Fixtures: null (ingen kanal).
  const supabase = useMemo<VmSupabaseClient | null>(
    () => (liveConfigured ? getSupabaseClient(env) : null),
    [liveConfigured, env]
  );

  // FETCH-VAKT: ett föråldrat svar får aldrig skriva över ett nyare (re-fetch race).
  const loadTokenRef = useRef(0);
  // Skiljer INITIAL hämtning (visa 'loading', fel -> 'error') från en TYST re-fetch (behåll
  // data + 'ready' även om den failar), samma val som use-live-data.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    const silent = hasLoadedRef.current;
    if (!silent) {
      setStatus('loading');
      setError(null);
    }
    void mode; // mode i deps: byt fixtures<->live (t.ex. i test) -> ladda om från rätt källa
    getLiveEvents(env)
      .then((rows) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar, en nyare hann starta
        }
        setMatches(rows);
        setStatus('ready');
        hasLoadedRef.current = true;
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        // TYST RE-FETCH som failar: behåll befintlig data + 'ready', logga fail-loud. En
        // INITIAL hämtning som failar har ingen data att skydda -> 'error'.
        if (silent) {
          console.warn(
            '[VM2026] Tyst omhämtning av cross-match-events (realtids-signal) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda matchdata.');
        setStatus('error');
      });
  }, [env, mode, refetchNonce]);

  // REALTID (T91-spine, PRIMÄR väg): prenumerera på HELA match_live_data (publik fakta). En
  // push bumpar nonce -> tyst re-fetch genom getLiveEvents/RLS. Bara i live-läge; fixtures har
  // ingen kanal. Egen kanal-namnrymd så vi inte krockar med dagsvyns kanal.
  useRealtimeSubscription({
    enabled: liveConfigured,
    client: supabase,
    channelName: 'vm2026-tournament-stats',
    tables: liveDataSubscription(),
    onChange: () => {
      setRefetchNonce((n) => n + 1);
    },
  });

  // POLL-FALLBACK (T91-spine): medan live-läget är aktivt, bumpa nonce var intervall -> tyst
  // re-fetch, oavsett om Realtime levererat. Garantin att aggregaten aldrig fryser om en push
  // missas. Bara i live-läge; fixtures har ingen backend att polla (negativ-kontroll i testet).
  useEffect(() => {
    if (!liveConfigured) {
      return;
    }
    const id = setInterval(() => {
      setRefetchNonce((n) => n + 1);
    }, CROSS_MATCH_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [liveConfigured]);

  // FOKUS / ONLINE / VISIBILITY-REFETCH (T91-spine): när fliken blir synlig igen (PWA-väckning
  // efter skärmlås) eller nätet kommer tillbaka, hämta direkt , Realtime kan ha missat events
  // medan sidan var dold/offline. Bara i live-läge. Lyssnarna rivs vid unmount.
  useEffect(() => {
    if (!liveConfigured) {
      return;
    }
    const refetch = () => {
      setRefetchNonce((n) => n + 1);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    window.addEventListener('online', refetch);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', refetch);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [liveConfigured]);

  return { status, matches, error };
}
