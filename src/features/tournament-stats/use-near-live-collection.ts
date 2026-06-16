// DELAD NEAR-LIVE-SPINE för cross-match-COLLECTIONS (T88, #180; rule-of-three). Vi har nu TRE
// platser med EXAKT samma "hämta en cross-match-lista och håll den near-live"-mekanik:
//   1. use-live-data (T91, dagsvyns livescore , egen, rörs ej här)
//   2. use-cross-match-events (T87, skytteligan, events-blobben)
//   3. use-cross-match-stats (T88, turneringsstatistiken, statistics-blobben)
// (2) och (3) skiljer sig BARA i vilken loader de kör (getLiveEvents vs getLiveStats) och
// vilken Realtime-kanal de namnger , ALLT annat (Realtime-push + 20 s poll-fallback + fokus/
// online/visibility-refetch, fetch-vakt mot races, tyst re-fetch vs initial fel) är identiskt.
// Vid den TREDJE upprepningen abstraherar vi (PRINCIPLES §3, DRY rule-of-three): denna hook
// äger spine:n EN gång, så ett framtida cross-match-aggregat (t.ex. lineup-baserad statistik)
// bara skickar in sin loader + kanal-namn i stället för att kopiera 120 rader till.
//
// VARFÖR INTE generalisera ihop med use-live-data också: use-live-data drar `*` (alla tre
// blobbarna) OCH indexerar per app-match-id för dagsvyns rika livekort , en RIKARE, daglig-
// vy-specifik form. Den delar SPINE-IDÉN men inte laddningen/indexeringen, exakt som T87:s
// header redan motiverar. Att tvinga in den här vore fel-abstraktion (KISS/YAGNI). Vi
// abstraherar bara de TVÅ cross-match-aggregat som är bevisat identiska.
//
// SIGNAL-INTE-DATA (samma härledd-state-mönster som use-live-data/T18): en realtids-push
// (eller poll-/fokus-trigger) LÄSER vi aldrig payloaden ur; den bumpar bara en nonce -> en
// (1) tyst re-fetch genom loadern/RLS. RLS SELECT på match_live_data är öppen (live-data är
// publik fakta), så en anonym besökare får datan likväl.
//
// GATAT BAKOM LIVE-LÄGE: Realtime-kanalen + poll + fokus-lyssnare kopplas BARA i live-läge
// (liveConfigured). I fixtures/demo-läge en enda initial hämtning, sedan vila.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDataSourceMode, isSupabaseConfigured, LIVE_READY } from '../../data';
import { liveDataSubscription } from '../../data/livescore';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { useRealtimeSubscription } from '../../data/realtime';

/** Laddningstillstånd, samma vokabulär som resten av appen. */
export type NearLiveStatus = 'loading' | 'ready' | 'error';

/** Resultatet en near-live-collection-hook exponerar (generisk över rad-typen T). */
export interface NearLiveCollection<T> {
  status: NearLiveStatus;
  /** Raderna (tom utom vid ready). Råvaran till aggregeringen. */
  rows: readonly T[];
  /** Fel-text vid en INITIAL hämtning som failade (tyst re-fetch sväljs, se nedan). */
  error: string | null;
}

/**
 * POLL-FALLBACKENS intervall (ms). SAMMA cadens som use-live-data/use-cross-match-events
 * (LIVE_POLL_INTERVAL_MS = 20 s): livescore-pollaren skriver match_live_data var ~30:e sekund
 * under live, så en klient-poll på 20 s fångar varje ny snapshot inom några sekunder, och
 * eftersom Realtime normalt levererar pushen FÖRST är pollen i praktiken bara redundans. EN
 * sanning för "hur ofta pollar vi cross-match-data".
 */
export const NEAR_LIVE_POLL_INTERVAL_MS = 20_000;

const EMPTY: readonly unknown[] = [];

/**
 * Hämta + håll en cross-match-collection färsk via T91-spine:n (Realtime + poll + fokus/
 * online/visibility). Gatat bakom live-läge.
 *
 * @param load        loadern som hämtar raderna (env-gatad, fixtures-först), t.ex. getLiveEvents.
 * @param channelName unik Realtime-kanal-namnrymd (så två collections inte krockar).
 * @param env         import.meta.env (injiceras för test, default = riktiga).
 * @param liveReady   injicerbar live-flagga (default LIVE_READY), så live-grenen kan testas
 *                    utan att flippa den globala konstanten (samma mönster som use-live-data).
 */
export function useNearLiveCollection<T>(
  load: (env: ImportMetaEnv) => Promise<readonly T[]>,
  channelName: string,
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): NearLiveCollection<T> {
  const mode = useMemo(() => getDataSourceMode(env, liveReady), [env, liveReady]);
  const liveConfigured = isSupabaseConfigured(env) && liveReady;

  const [status, setStatus] = useState<NearLiveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly T[]>(EMPTY as readonly T[]);
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
  // Stabil ref till loadern: en ny load-referens per render (vanligt om anroparen inte
  // memoiserar) ska INTE re-köra effekten , vi vill bara ladda om på env/mode/nonce.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const token = ++loadTokenRef.current;
    const silent = hasLoadedRef.current;
    if (!silent) {
      setStatus('loading');
      setError(null);
    }
    void mode; // mode i deps: byt fixtures<->live (t.ex. i test) -> ladda om från rätt källa
    loadRef
      .current(env)
      .then((next) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar, en nyare hann starta
        }
        setRows(next);
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
            '[VM2026] Tyst omhämtning av cross-match-data (realtids-signal) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda matchdata.');
        setStatus('error');
      });
  }, [env, mode, refetchNonce]);

  // REALTID (T91-spine, PRIMÄR väg): prenumerera på HELA match_live_data (publik fakta). En
  // push bumpar nonce -> tyst re-fetch genom loadern/RLS. Bara i live-läge; fixtures har ingen
  // kanal. Unik kanal-namnrymd per collection så de inte krockar.
  useRealtimeSubscription({
    enabled: liveConfigured,
    client: supabase,
    channelName,
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
    }, NEAR_LIVE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [liveConfigured]);

  // FOKUS / ONLINE / VISIBILITY-REFETCH (T91-spine): när fliken blir synlig igen (PWA-väckning
  // efter skärmlås) eller nätet kommer tillbaka, hämta direkt , Realtime kan ha missat data
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

  return { status, rows, error };
}
