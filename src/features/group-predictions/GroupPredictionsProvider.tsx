// Provider för grupp-tips-storen (T16, #16).
//
// Systerfil till PredictionsProvider.tsx (T15), samma form + samma epoch-vakt-
// rigor (ett snabbt rumsbyte får aldrig låta ett föråldrat svar skriva fel rums
// tips). ANSVAR: koordinera grupp-tips-API:t (data/predictions) med det AKTIVA
// rummet (ur rooms-synk-seamen useRoomsSync, samma seam T15 + results-lagret
// använder) och hålla "mina grupp-tips" i React.
//
// SÄKERHET ÄR SERVER-SIDE: deadline-låset (inget grupp-tips efter gruppens första
// match) + sekretessen bor i RLS (bevisat med riktiga sessioner). Provider:n
// förlitar sig aldrig på klient-låset; ett save som nekas blir ett fail-loud-fel.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  listMyGroupPredictions,
  upsertMyGroupPrediction,
  type GroupPrediction,
  type GroupPredictionInput,
} from '../../data/predictions';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsSync } from '../rooms';
import {
  GroupPredictionsStoreContext,
  type GroupPredictionsStatus,
  type GroupPredictionsStore,
} from './group-predictions-context';

export interface GroupPredictionsProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
  /** Injicerbart aktivt rum-id (testbarhet). Default = rooms-synk-seamen. */
  activeRoomId?: string | null;
  /**
   * Injicerbar tips-invaliderings-räknare (testbarhet, T61 #110). Default =
   * rooms-synk-seamen. Bumpas efter en lyckad kopiering -> tyst re-fetch utan rum-byte.
   */
  tipsRefreshNonce?: number;
}

export function GroupPredictionsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
  tipsRefreshNonce: tipsRefreshNonceProp,
}: GroupPredictionsProviderProps) {
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;
  // Tips-invaliderings-räknaren ur samma seam (T61 #110): bumpas efter lyckad kopiering.
  const tipsRefreshNonce =
    tipsRefreshNonceProp !== undefined ? tipsRefreshNonceProp : roomsSync.tipsRefreshNonce;

  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  const enabled = liveConfigured && activeRoomId !== null;

  const [status, setStatus] = useState<GroupPredictionsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [myGroupPredictions, setMyGroupPredictions] = useState<
    ReadonlyMap<string, GroupPrediction>
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

  // EPOCH-vakt (samma mönster som T15:s tips-provider): ett snabbt rumsbyte får
  // aldrig låta ett föråldrat svar skriva över ett nyare rums grupp-tips. Bumpas
  // av load-effekten och konsulteras av BÅDE laddningen och saveGroupPrediction.
  const loadTokenRef = useRef(0);

  // Vilket rum den NU laddade datan tillhör: skiljer en SYNLIG laddning (initial /
  // rumsbyte -> 'loading') från en TYST re-fetch (kopierings-invalidering, samma rum ->
  // behåll 'ready' + datan). Samma mönster som T55/PredictionsProvider, så en copy-
  // triggad re-fetch (T61 #110) inte flimrar och tömmer grupp-tips-vyn.
  const loadedRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      setMyGroupPredictions(new Map());
      setStatus('idle');
      setError(null);
      loadedRoomIdRef.current = null;
      return;
    }
    // TYST RE-FETCH (T61 #110): en kopierings-triggad omhämtning i SAMMA rum behåller
    // 'ready' + datan, bara INITIAL/rumsbyte visar 'loading' (se PredictionsProvider).
    const isSilentRefetch = loadedRoomIdRef.current === activeRoomId;
    if (!isSilentRefetch) {
      setStatus('loading');
      setError(null);
    }
    listMyGroupPredictions(supabase, activeRoomId)
      .then((preds) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rumsbyte hann starta), kasta tyst
        }
        setMyGroupPredictions(new Map(preds.map((p) => [p.groupId, p])));
        setStatus('ready');
        loadedRoomIdRef.current = activeRoomId;
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        // FELVÄG, TYST RE-FETCH (samma val som T55): behåll befintlig data + 'ready' och
        // logga, blanka aldrig grupp-tips-vyn för en transient copy-miss. INITIAL/rumsbyte
        // -> 'error' (ingen data att skydda, fail loud PRINCIPLES §8).
        if (isSilentRefetch) {
          console.warn(
            '[VM2026] Tyst omhämtning av grupp-tips (efter kopiering) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda dina grupp-tips.');
        setStatus('error');
      });
  }, [supabase, activeRoomId, tipsRefreshNonce]);

  const saveGroupPrediction = useCallback(
    async (input: GroupPredictionInput) => {
      // Fail loud (PRINCIPLES §8) vid felaktig wiring, med SKILDA felmeddelanden så
      // roten kan felsökas direkt ur texten (samma uppdelning som T15). UI:t gatar
      // redan (formuläret renderas bara när store.enabled), så detta nås bara via
      // felaktig wiring, exakt det fail-loud ska avslöja.
      if (!supabase) {
        throw new Error(
          '[VM2026] Spara grupp-tips misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error(
          '[VM2026] Spara grupp-tips misslyckades: inget aktivt rum att spara tipset i.'
        );
      }
      // STALE-REQUEST-VAKT (samma som T15:s C14): boka in vilken laddnings-epok
      // (= vilket aktivt rum) detta save tillhör, så ett save startat i rum A inte
      // skriver A:s svar i B:s map om vännen byter rum under await.
      const saveToken = loadTokenRef.current;
      const saved = await upsertMyGroupPrediction(supabase, activeRoomId, input);
      if (saveToken !== loadTokenRef.current) {
        return; // bytte rum under await -> droppa den lokala spegeln (RLS har persisterat)
      }
      setMyGroupPredictions((prev) => {
        const next = new Map(prev);
        next.set(saved.groupId, saved);
        return next;
      });
    },
    [supabase, activeRoomId]
  );

  const store: GroupPredictionsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      activeRoomId,
      myGroupPredictions,
      saveGroupPrediction,
    }),
    [enabled, status, error, activeRoomId, myGroupPredictions, saveGroupPrediction]
  );

  return (
    <GroupPredictionsStoreContext.Provider value={store}>
      {children}
    </GroupPredictionsStoreContext.Provider>
  );
}
