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
}

export function PredictionsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
}: PredictionsProviderProps) {
  // Det aktiva rummet ur rooms-synk-seamen (samma seam results-lagret läser), om
  // inte ett explicit id injicerats (test). Hook anropas ovillkorligt (regler).
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;

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

  // EPOCH-vakt (samma mönster som RoomsProvider.loadRoomData, KA-F2): ett snabbt
  // rumsbyte får aldrig låta ett föråldrat svar skriva över ett nyare rums tips.
  // Bumpas vid varje rumsbyte av load-effekten och konsulteras av BÅDE laddningen
  // och savePrediction (C14: en optimistisk save som löser efter ett rumsbyte
  // tillhör fel rum och måste droppas, inte skrivas i nya rummets map).
  const loadTokenRef = useRef(0);

  // Ladda MINA tips för det aktiva rummet (en gång per rumsbyte). Tom utan rum.
  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      // Inget aktivt rum: nolla tipsen, gå till idle (inte loading/error).
      setMyPredictions(new Map());
      setStatus('idle');
      setError(null);
      return;
    }
    setStatus('loading');
    setError(null);
    listMyPredictions(supabase, activeRoomId)
      .then((preds) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rumsbyte hann starta), kasta tyst
        }
        setMyPredictions(new Map(preds.map((p) => [p.matchId, p])));
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda dina tips.');
        setStatus('error');
      });
  }, [supabase, activeRoomId]);

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
      // STALE-REQUEST-VAKT (C14): boka in vilken laddnings-epok (= vilket aktivt
      // rum) detta save tillhör. Samma loadTokenRef som load-effekten bumpar vid
      // varje rumsbyte, så vi återanvänder seamen i stället för att uppfinna en ny.
      // myPredictions är bara keyad på matchId, så utan vakten kan ett save startat i
      // rum A (vän byter till rum B under await) skriva A:s svar i B:s tips-map.
      const saveToken = loadTokenRef.current;
      // Kastar vid fel (UI fångar), inkl. RLS-avslag om matchen är låst (fail loud).
      const saved = await upsertMyPrediction(supabase, activeRoomId, input);
      // Bytte det aktiva rummet under await? Då har load-effekten redan bumpat token
      // och laddat det NYA rummets tips. A:s optimistiska uppdatering DROPPAS tyst
      // (den tillhör ett inaktuellt rum), exakt som load-effektens epoch-vakt gör.
      // RLS har ändå persisterat tipset i rätt rum (room_id i upserten), så inget
      // tappas på servern, bara den lokala spegeln av ett rum vi inte längre tittar på.
      if (saveToken !== loadTokenRef.current) {
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
