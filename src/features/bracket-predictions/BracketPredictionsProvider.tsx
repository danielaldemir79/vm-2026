// Provider för bracket-/slutspels-tips-storen (T16b, #59).
//
// Systerfil till GroupPredictionsProvider.tsx (T16) / PredictionsProvider.tsx (T15),
// SAMMA form + SAMMA epoch-vakt-rigor (ett snabbt rumsbyte får aldrig låta ett
// föråldrat svar skriva fel rums tips). ANSVAR: koordinera bracket-tips-API:t
// (data/predictions) med det AKTIVA rummet (ur rooms-synk-seamen useRoomsSync, samma
// seam T15/T16 + results-lagret använder) och hålla "mina bracket-tips" i React.
//
// SÄKERHET ÄR SERVER-SIDE: per-slot-deadline-låset (inget tips efter slottens
// avspark) + champion-låset (inget tips efter turneringsstart) + sekretessen bor i
// RLS (bevisat med riktiga sessioner, docs/decisions.md T16). Provider:n förlitar
// sig aldrig på klient-låset; ett save som nekas blir ett fail-loud-fel.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  listMyBracketPredictions,
  upsertMyBracketPrediction,
  type BracketPrediction,
  type BracketPredictionInput,
} from '../../data/predictions';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsSync } from '../rooms';
import {
  BracketPredictionsStoreContext,
  type BracketPredictionsStatus,
  type BracketPredictionsStore,
} from './bracket-predictions-context';

export interface BracketPredictionsProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
  /** Injicerbart aktivt rum-id (testbarhet). Default = rooms-synk-seamen. */
  activeRoomId?: string | null;
}

export function BracketPredictionsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
}: BracketPredictionsProviderProps) {
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;

  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  const enabled = liveConfigured && activeRoomId !== null;

  const [status, setStatus] = useState<BracketPredictionsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [myBracketPredictions, setMyBracketPredictions] = useState<
    ReadonlyMap<string, BracketPrediction>
  >(new Map());

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!liveConfigured) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, liveConfigured, env]);

  // EPOCH-vakt (samma mönster som T15:s tips-provider C14 / T16:s grupp-provider /
  // RoomsProvider KA-F2): ett snabbt rumsbyte får aldrig låta ett föråldrat svar
  // skriva över ett nyare rums bracket-tips. Bumpas av load-effekten och konsulteras
  // av BÅDE laddningen och saveBracketPrediction.
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      setMyBracketPredictions(new Map());
      setStatus('idle');
      setError(null);
      return;
    }
    setStatus('loading');
    setError(null);
    listMyBracketPredictions(supabase, activeRoomId)
      .then((preds) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rumsbyte hann starta), kasta tyst
        }
        setMyBracketPredictions(new Map(preds.map((p) => [p.slotId, p])));
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda dina bracket-tips.');
        setStatus('error');
      });
  }, [supabase, activeRoomId]);

  const saveBracketPrediction = useCallback(
    async (input: BracketPredictionInput) => {
      // Fail loud (PRINCIPLES §8) vid felaktig wiring, med SKILDA felmeddelanden så
      // roten kan felsökas direkt ur texten (samma uppdelning som T15/T16). UI:t
      // gatar redan (formuläret renderas bara när store.enabled), så detta nås bara
      // via felaktig wiring, exakt det fail-loud ska avslöja.
      if (!supabase) {
        throw new Error(
          '[VM2026] Spara bracket-tips misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error(
          '[VM2026] Spara bracket-tips misslyckades: inget aktivt rum att spara tipset i.'
        );
      }
      // STALE-REQUEST-VAKT (samma som T15:s C14 / T16): boka in vilken laddnings-epok
      // (= vilket aktivt rum) detta save tillhör, så ett save startat i rum A inte
      // skriver A:s svar i B:s map om vännen byter rum under await.
      const saveToken = loadTokenRef.current;
      const saved = await upsertMyBracketPrediction(supabase, activeRoomId, input);
      if (saveToken !== loadTokenRef.current) {
        return; // bytte rum under await -> droppa den lokala spegeln (RLS har persisterat)
      }
      setMyBracketPredictions((prev) => {
        const next = new Map(prev);
        next.set(saved.slotId, saved);
        return next;
      });
    },
    [supabase, activeRoomId]
  );

  const store: BracketPredictionsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      activeRoomId,
      myBracketPredictions,
      saveBracketPrediction,
    }),
    [enabled, status, error, activeRoomId, myBracketPredictions, saveBracketPrediction]
  );

  return (
    <BracketPredictionsStoreContext.Provider value={store}>
      {children}
    </BracketPredictionsStoreContext.Provider>
  );
}
