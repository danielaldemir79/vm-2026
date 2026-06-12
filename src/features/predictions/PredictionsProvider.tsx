// Provider för tips-storen (T15, #15).
//
// ANSVAR: koordinera tips-API:t (data/predictions) med det AKTIVA rummet (ur
// rooms-storen) och hålla "mina tips" i React. Tunt: all DB-logik bor i tips-
// API:t, provider:n är limmet mot React + UI:t. Samma form som RoomsProvider.
//
// AKTIVT RUM ÄR PORTEN: tips är per rum. Vi läser det aktiva rummet via en INJICERAD
// `activeRoomId` (default: rooms-synk-seamen useRoomsSync, samma seam results-lagret
// använder, så ingen ny koppling uppfinns). Utan ett aktivt rum (lokalt läge eller
// inget rum valt) är storen inaktiv (enabled=false, status 'idle'): UI:t visar då
// "gå med i ett rum för att tippa".
//
// SÄKERHET ÄR SERVER-SIDE: deadline-låset + sekretessen bor i RLS (bevisat med
// riktiga sessioner). Provider:n förlitar sig aldrig på klient-låset för säkerhet,
// ett save som nekas av RLS (match låst) blir ett fail-loud-fel som UI:t visar.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  listMyPredictions,
  upsertMyPrediction,
  type Prediction,
  type PredictionInput,
} from '../../data/predictions';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsSync } from '../rooms';
import {
  PredictionsStoreContext,
  type PredictionsStatus,
  type PredictionsStore,
} from './predictions-context';

export interface PredictionsProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
  /**
   * Injicerbart aktivt rum-id (testbarhet). Default = rooms-synk-seamen
   * (useRoomsSync.activeRoomId), så tips följer rummet utan ny koppling.
   */
  activeRoomId?: string | null;
  /**
   * Injicerbar tips-invaliderings-räknare (testbarhet, T61 #110). Default =
   * rooms-synk-seamen (useRoomsSync.tipsRefreshNonce). Bumpas efter en lyckad
   * tips-kopiering så denna provider hämtar om sina tips utan rum-byte.
   */
  tipsRefreshNonce?: number;
}

export function PredictionsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
  tipsRefreshNonce: tipsRefreshNonceProp,
}: PredictionsProviderProps) {
  // Det aktiva rummet ur rooms-synk-seamen (samma seam results-lagret läser), om
  // inte ett explicit id injicerats (test). Hook anropas ovillkorligt (regler).
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;
  // Tips-invaliderings-räknaren ur samma seam (T61 #110): bumpas efter en lyckad
  // kopiering IN i det aktiva rummet, ligger i load-effektens deps -> tyst re-fetch.
  const tipsRefreshNonce =
    tipsRefreshNonceProp !== undefined ? tipsRefreshNonceProp : roomsSync.tipsRefreshNonce;

  // Live kräver BÅDE env OCH live-flaggan (samma tvåstegs-gate som datalagret).
  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  // Tips-lagret är AKTIVT bara med live-konfig OCH ett aktivt rum (porten).
  const enabled = liveConfigured && activeRoomId !== null;

  const [status, setStatus] = useState<PredictionsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [myPredictions, setMyPredictions] = useState<ReadonlyMap<string, Prediction>>(new Map());

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!liveConfigured) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, liveConfigured, env]);

  // FETCH-VAKT (samma mönster som RoomsProvider.loadRoomData, KA-F2): ett föråldrat
  // LADDNINGS-svar får aldrig skriva över ett nyare. Bumpas vid VARJE effekt-körning
  // (rumsbyte OCH tyst kopierings-re-fetch), så bara det SENASTE fetch-svaret vinner.
  // Används BARA av laddningen, inte av savePrediction (se activeRoomIdRef nedan).
  const loadTokenRef = useRef(0);

  // SAVE-VAKT (T61 #110, F1): det enda en optimistisk save behöver skyddas mot är ett
  // RUM-BYTE under await:en (då tillhör svaret fel rum). Den får INTE droppas av en tyst
  // kopierings-re-fetch i SAMMA rum (det gjorde den förut, när save delade loadTokenRef
  // som nu bumpas även av nonce-invalidering -> pågående save tappades, ingen spegling).
  // Därför en EGEN vakt bunden enbart till activeRoomId: en ref med det SENASTE aktiva
  // rummet, jämförd mot rummet saven startade i. Ändras bara vid äkta rum-byte.
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  activeRoomIdRef.current = activeRoomId;

  // Vilket rum den NU laddade datan tillhör (null = ingen data än). Skiljer en SYNLIG
  // laddning (initial / rumsbyte: datan saknas eller hör till fel rum -> visa 'loading')
  // från en TYST re-fetch (kopierings-invalidering: samma rum, datan finns redan ->
  // behåll 'ready' + datan under hämtningen, byt bara ut den när svaret kommer). Samma
  // mönster som LeaderboardProvider (T55 #96), så en copy-triggad re-fetch (T61 #110)
  // inte flimrar "Laddar..." och tömmer tips-vyn trots att giltig data redan finns.
  const loadedRoomIdRef = useRef<string | null>(null);

  // Ladda MINA tips för det aktiva rummet (vid rumsbyte ELLER tips-invalidering). Tom
  // utan rum.
  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      // Inget aktivt rum: nolla tipsen, gå till idle (inte loading/error).
      setMyPredictions(new Map());
      setStatus('idle');
      setError(null);
      loadedRoomIdRef.current = null;
      return;
    }
    // TYST RE-FETCH (T61 #110, samma val som T55): en kopierings-triggad omhämtning
    // (tipsRefreshNonce ändrades) i SAMMA rum vi redan har data för ska INTE flimra
    // 'loading' och tömma tips-vyn, den ska bara KOMPLETTERA med de nykopierade raderna.
    // 'loading' visas bara vid INITIAL hämtning (ingen data än) och RUMSBYTE (datan hör
    // till fel rum); då är det rätt att blanka och visa laddning.
    const isSilentRefetch = loadedRoomIdRef.current === activeRoomId;
    if (!isSilentRefetch) {
      setStatus('loading');
      setError(null);
    }
    listMyPredictions(supabase, activeRoomId)
      .then((preds) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rumsbyte hann starta), kasta tyst
        }
        setMyPredictions(new Map(preds.map((p) => [p.matchId, p])));
        setStatus('ready');
        loadedRoomIdRef.current = activeRoomId;
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        // FELVÄG, TYST RE-FETCH (samma val som T55): en kopierings-triggad omhämtning som
        // failar får ALDRIG kasta bort de befintliga (giltiga) tipsen. Vi behåller datan +
        // 'ready' och loggar felet ([VM2026]-konventionen, fail-loud i konsolen) i stället
        // för att blanka vyn för en transient miss. En INITIAL/rumsbyte-fetch som failar har
        // ingen data att skydda, då är 'error' rätt (fail loud, PRINCIPLES §8).
        if (isSilentRefetch) {
          console.warn(
            '[VM2026] Tyst omhämtning av tips (efter kopiering) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda dina tips.');
        setStatus('error');
      });
  }, [supabase, activeRoomId, tipsRefreshNonce]);

  const savePrediction = useCallback(
    async (input: PredictionInput) => {
      // Kontraktet (PredictionsStore.savePrediction) säger "Kastar vid fel". Utan
      // klient ELLER rum finns inget att spara till: KASTA (fail loud, PRINCIPLES
      // §8) i stället för en tyst no-op som annars hade gett ett falskt "Sparat".
      // UI:t gatar redan detta (formuläret renderas bara när store.enabled, dvs
      // klient OCH activeRoomId !== null), så detta nås bara via felaktig wiring,
      // exakt det ett fail-loud-fel ska avslöja. Den legitima "inget rum"-vyn anropar
      // aldrig savePrediction (PredictionsView visar då "gå med i rum"), så den
      // kraschar inte.
      //
      // SKILJ PÅ FALLEN (C12): de två rötterna ger olika felmeddelanden så ett
      // wiring-fel kan FELSÖKAS direkt ur texten. "Ingen Supabase-klient" pekar mot
      // env/live-gaten (liveConfigured falskt eller ingen injicerad klient); "inget
      // aktivt rum" pekar mot rooms-synken (activeRoomId null). Klienten kollas
      // FÖRST: utan klient spelar rummet ingen roll, och det är den mer grundläggande
      // bristen (live ej konfigurerat).
      if (!supabase) {
        throw new Error(
          '[VM2026] Spara tips misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error('[VM2026] Spara tips misslyckades: inget aktivt rum att spara tipset i.');
      }
      // STALE-SAVE-VAKT (C14 + T61 #110/F1): boka in vilket RUM detta save tillhör.
      // myPredictions är bara keyad på matchId, så utan vakten kan ett save startat i
      // rum A (vän byter till rum B under await) skriva A:s svar i B:s tips-map. Vi
      // jämför mot RUMMET (inte en delad load-token): en tyst kopierings-re-fetch i
      // SAMMA rum bumpar load-token men ändrar inte rummet, och måste därför INTE
      // klassa detta save som föråldrat (det var T61-buggen: spegling uteblev).
      const saveRoomId = activeRoomId;
      // Kastar vid fel (UI fångar), inkl. RLS-avslag om matchen är låst (fail loud).
      const saved = await upsertMyPrediction(supabase, activeRoomId, input);
      // Bytte det AKTIVA rummet under await? Då tillhör A:s optimistiska uppdatering ett
      // inaktuellt rum och DROPPAS tyst (load-effekten har redan laddat nya rummets tips),
      // exakt som load-effektens fetch-vakt gör. En tyst re-fetch i SAMMA rum (samma
      // saveRoomId) passerar dock, så spegling sker. RLS har ändå persisterat tipset i
      // rätt rum (room_id i upserten), så inget tappas på servern, bara den lokala
      // spegeln av ett rum vi inte längre tittar på.
      if (saveRoomId !== activeRoomIdRef.current) {
        return;
      }
      // Optimistiskt: spegla in det sparade tipset i den lokala mappen direkt.
      setMyPredictions((prev) => {
        const next = new Map(prev);
        next.set(saved.matchId, saved);
        return next;
      });
    },
    [supabase, activeRoomId]
  );

  const store: PredictionsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      activeRoomId,
      myPredictions,
      savePrediction,
    }),
    [enabled, status, error, activeRoomId, myPredictions, savePrediction]
  );

  return (
    <PredictionsStoreContext.Provider value={store}>{children}</PredictionsStoreContext.Provider>
  );
}
