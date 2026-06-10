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

  // EPOCH-vakt (samma mönster som RoomsProvider.loadRoomData): ett snabbt rumsbyte
  // får aldrig låta ett föråldrat svar skriva över ett nyare rums tips.
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
      if (!supabase || activeRoomId === null) {
        // Kontraktet (PredictionsStore.savePrediction) säger "Kastar vid fel".
        // Utan klient/rum finns inget att spara till: KASTA (fail loud, PRINCIPLES
        // §8) i stället för en tyst no-op som annars hade gett ett falskt "Sparat".
        // UI:t gatar redan detta (formuläret renderas bara när store.enabled, dvs
        // activeRoomId !== null), så detta nås bara via felaktig wiring, exakt det
        // ett fail-loud-fel ska avslöja. Den legitima "inget rum"-vyn anropar aldrig
        // savePrediction (PredictionsView visar då "gå med i rum"), så den kraschar inte.
        throw new Error('[VM2026] Spara tips misslyckades: inget aktivt rum att spara tipset i.');
      }
      // Kastar vid fel (UI fångar), inkl. RLS-avslag om matchen är låst (fail loud).
      const saved = await upsertMyPrediction(supabase, activeRoomId, input);
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
