// React-hook som matar livekorten (Bit 3b) med persisterad live-data per match.
//
// ANSVAR (tunt, ETT seam): hämta ALL live-data via läs-lagret (Bit 3a getLiveData),
// indexera den per appens match-id (Map<matchId, LiveData>) så dagsvyn kan slå upp
// rätt rad per matchkort i O(1), och hålla den FÄRSK via tre lager: (1) Realtime-
// pushar (Bit 3a liveDataSubscription) som primär väg, (2) en periodisk POLL-fallback,
// och (3) en om-hämtning vid fokus/online/visibility. Vi bygger INGEN egen
// datahämtning (direktiv): getLiveData äger källval (Supabase i live-läge, committade
// fixtures annars), useRealtimeSubscription äger kanalen.
//
// VARFÖR SKYDDSNÄT, INTE BARA REALTIME (T91, #184, LIVE UX-bugg): en pågående match
// uppdaterades inte i appen förrän en MANUELL omladdning (mål föll men ställningen
// stod stilla). Rotorsaken var att denna hook ENBART hade Realtime , inget skyddsnät
// om kanalen missar eller tappar. Postgres-changes-WebSocketen är bräcklig på mobil:
// skärmlås/bakgrundning suspenderar den, ett nätglapp eller en kanal som aldrig når
// SUBSCRIBED ger TYST ingen push, och då fryser ställningen tills reload. Realtime-
// seamen säger själv att den förlitar sig på "nästa fokus-refetch" som skyddsnät , men
// just det skyddsnätet saknades HÄR (OfficialResultsProvider har det, vi hade det
// inte). Vi lägger därför till samma fokus/online/visibility-refetch SOM PROVIDERN
// REDAN HAR, plus en låg-frekvent POLL medan live-data är på skärmen (en match på en
// vaken flik med en tyst-stallad socket fångas inte av fokus-event, bara av poll). Alla
// tre kör SAMMA tysta re-fetch , skillnaden är bara vad som TRIGGAR den.
//
// SIGNAL-INTE-DATA (samma härledd-state-mönster som reaktions-/kommentar-lagren): en
// realtids-push (eller poll-/fokus-trigger) LÄSER vi aldrig payloaden ur; den bumpar
// bara en nonce -> en (1) tyst re-fetch genom getLiveData. RLS SELECT på
// match_live_data är öppen (live-data är publik fakta), så en anonym besökare får datan
// likväl (live-read.ts).
//
// FIXTURES-NYCKLINGEN (skarven mot dagsvyn): i fixtures-läge nycklar getLiveData raden
// på 'api-<fixtureId>' (det finns ingen app-match-koppling utan backend). Dagsvyn slår
// upp på APPENS match-id ('g-F-1'), så en rå 'api-...'-nyckel skulle aldrig träffa.
// Vi RE-NYCKLAR därför fixtures-raden till sitt app-match-id via Bit 1:s redan testade,
// källhänvisade resolver (resolveAppMatch mot fixtures-snapshotten), så livekortet
// FAKTISKT renderas på rätt matchkort utan backend (utveckling + skärmdumpar). I
// live-läge är raden redan nycklad på app-match-id av pollaren, då rör vi inget (gissa
// aldrig en koppling , i live styr pollarens egen mappning).

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDataSourceMode, isSupabaseConfigured, LIVE_READY } from '../../data';
import {
  fixtureLiveSnapshots,
  getLiveData,
  liveDataSubscription,
  resolveAppMatch,
  type LiveData,
} from '../../data/livescore';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { useRealtimeSubscription } from '../../data/realtime';

/** Laddningstillstånd, samma vokabulär som resten av appen. */
export type LiveDataStatus = 'loading' | 'ready' | 'error';

/** Allt dagsvyn behöver för att berika sina matchkort med live-data. */
export interface LiveDataResult {
  status: LiveDataStatus;
  /** Live-data per APPENS match-id (tom Map utom vid ready). O(1)-uppslag per kort. */
  byMatchId: ReadonlyMap<string, LiveData>;
  /** Fel-text vid en INITIAL hämtning som failade (tyst re-fetch sväljs, se nedan). */
  error: string | null;
}

const EMPTY: ReadonlyMap<string, LiveData> = new Map();

/**
 * POLL-FALLBACKENS intervall (ms). Skyddsnätet som garanterar att ställningen aldrig
 * fryser om ett Realtime-event missas/tappas, oavsett orsak (T91, #184).
 *
 * VAL AV CADENS (20 s): livescore-pollaren skriver match_live_data var ~30:e sekund
 * under live (memory: cron '30 seconds', DAILY_BUDGET). En klient-poll på 20 s fångar
 * alltså varje ny snapshot inom några sekunder efter att den skrivits (kravet "inom
 * några sekunder"), och eftersom Realtime normalt levererar pushen FÖRST är pollen i
 * praktiken bara redundans , den slår sällan till för verklig ny data. 20 s är medvetet
 * KONSERVATIVT: det är klientens läs-sida (öppen RLS-SELECT, ingen API-Football-kostnad,
 * den ligger på pollaren som vi inte rör), så lasten är en lätt Supabase-SELECT per
 * vaken live-flik var 20:e sekund , försumbar, men inte så tät att den blir polling-spam.
 */
export const LIVE_POLL_INTERVAL_MS = 20_000;

/**
 * Re-nyckla fixtures-lägets rad ('api-<fixtureId>') till sitt app-match-id, så
 * dagsvyn (som slår upp på app-match-id) träffar. Resolvern (Bit 1) är källhänvisad
 * och gissar aldrig: en snapshot som inte kan lösas (okänt lag / ingen schemarad)
 * hoppas, så vi aldrig hänger en live-rad på fel match.
 *
 * @param rows  getLiveData:s utdata i fixtures-läge (nycklade på api-<id>).
 */
function rekeyFixtureRows(rows: readonly LiveData[]): Map<string, LiveData> {
  const out = new Map<string, LiveData>();
  for (const row of rows) {
    // Hitta snapshotten med samma fixture-id (den bär lag-id + kickoff resolvern behöver).
    const snapshot = fixtureLiveSnapshots.find((s) => s.apiFixtureId === row.apiFixtureId);
    if (snapshot === undefined) {
      continue; // ingen snapshot -> kan inte lösas, hoppa (gissa aldrig)
    }
    const resolution = resolveAppMatch(snapshot);
    if (resolution.kind === 'resolved') {
      out.set(resolution.appMatchId, row);
    }
    // unresolved: hoppas tyst (Bit 1:s reason loggas inte här, det är ett förväntat
    // fixtures-läges-utfall för en match utan schemarad, inte ett fel).
  }
  return out;
}

/** Indexera live-rader per match-id. I fixtures-läge re-nycklas de via resolvern. */
function indexRows(rows: readonly LiveData[], mode: 'fixtures' | 'live'): Map<string, LiveData> {
  if (mode === 'fixtures') {
    return rekeyFixtureRows(rows);
  }
  // Live: pollaren nycklar redan raden på app-match-id (match_id är PK), använd direkt.
  return new Map(rows.map((row) => [row.matchId, row]));
}

/**
 * Hämta + indexera live-data per match-id och håll den färsk via realtid.
 *
 * @param env        import.meta.env (injiceras för test, default = riktiga).
 * @param liveReady  injicerbar live-flagga (default LIVE_READY), så live-grenen kan
 *                   testas utan att flippa den globala konstanten (samma som datalagret).
 */
export function useLiveData(
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): LiveDataResult {
  const mode = useMemo(() => getDataSourceMode(env, liveReady), [env, liveReady]);
  const liveConfigured = isSupabaseConfigured(env) && liveReady;

  const [status, setStatus] = useState<LiveDataStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [byMatchId, setByMatchId] = useState<ReadonlyMap<string, LiveData>>(EMPTY);
  // RE-FETCH-INVALIDERING (samma seam som T18/reaktioner): vilken som helst av de tre
  // triggrarna (Realtime-push, poll-tick, fokus/online/visibility) bumpar denna, som
  // ligger i load-effektens deps -> en tyst re-fetch. Monotont tal: två triggar i rad
  // ger två re-fetchar, ingen tappas. Stabilt i vila (ingen trigg = inget tick).
  const [refetchNonce, setRefetchNonce] = useState(0);

  // Supabase-klienten (bara i live-läge), för realtids-kanalen. Fixtures: null (ingen kanal).
  const supabase = useMemo<VmSupabaseClient | null>(
    () => (liveConfigured ? getSupabaseClient(env) : null),
    [liveConfigured, env]
  );

  // FETCH-VAKT: ett föråldrat svar får aldrig skriva över ett nyare (re-fetch race).
  const loadTokenRef = useRef(0);
  // Skiljer INITIAL hämtning (visa 'loading', fel -> 'error') från en TYST realtids-
  // re-fetch (behåll data + 'ready' även om den failar), samma val som reaktions-lagret.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    const silent = hasLoadedRef.current;
    if (!silent) {
      setStatus('loading');
      setError(null);
    }
    getLiveData(env)
      .then((rows) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar, en nyare hann starta
        }
        setByMatchId(indexRows(rows, mode));
        setStatus('ready');
        hasLoadedRef.current = true;
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        // TYST RE-FETCH som failar: behåll befintlig data + 'ready', logga fail-loud i
        // konsolen. En INITIAL hämtning som failar har ingen data att skydda -> 'error'.
        if (silent) {
          console.warn(
            '[VM2026] Tyst omhämtning av live-data (realtids-signal) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda live-data.');
        setStatus('error');
      });
  }, [env, mode, refetchNonce]);

  // REALTID: prenumerera på HELA match_live_data (publik fakta, ingen rad-filter , se
  // live-realtime.ts). En push bumpar nonce -> tyst re-fetch genom getLiveData/RLS. Bara
  // i live-läge (enabled), fixtures har ingen kanal. Egen kanal så vi inte krockar.
  // PRIMÄR väg; poll + fokus/online nedan är skyddsnäten om denna missar/tappar.
  useRealtimeSubscription({
    enabled: liveConfigured,
    client: supabase,
    channelName: 'vm2026-live-data',
    tables: liveDataSubscription(),
    onChange: () => {
      setRefetchNonce((n) => n + 1);
    },
  });

  // POLL-FALLBACK (T91): medan live-läget är aktivt, bumpa nonce var LIVE_POLL_INTERVAL_MS
  // -> en tyst re-fetch, oavsett om Realtime levererat något. Detta är garantin att
  // ställningen aldrig fryser om en push missas (tyst-stallad socket på en vaken flik
  // fångas inte av fokus-event , bara av denna poll). Bara i live-läge; fixtures har
  // ingen backend att polla (negativ-kontroll i testet). Intervallet rivs vid unmount/
  // när live-läget släcks, så ingen timer läcker.
  useEffect(() => {
    if (!liveConfigured) {
      return;
    }
    const id = setInterval(() => {
      setRefetchNonce((n) => n + 1);
    }, LIVE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [liveConfigured]);

  // FOKUS / ONLINE / VISIBILITY-REFETCH (T91, samma skyddsnät som OfficialResultsProvider
  // redan har): när fliken blir synlig igen (PWA-väckning efter skärmlås/bakgrundning)
  // eller nätet kommer tillbaka, hämta direkt , då kan Realtime ha missat events medan
  // sidan var dold/offline, och vi vill INTE vänta in nästa poll-tick för att hinna ikapp.
  // Bara i live-läge; fixtures har ingen källa att synka mot. Lyssnarna rivs vid unmount.
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

  return { status, byMatchId, error };
}
