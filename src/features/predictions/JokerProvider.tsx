// Provider för joker-storen (T19, #19).
//
// ANSVAR: koordinera joker-API:t (data/predictions) med det AKTIVA rummet (ur rooms-
// synken) och hålla "mina joker-val" i React. Tunt: all DB-logik bor i joker-API:t,
// provider:n är limmet mot React + UI:t. Samma form som PredictionsProvider (T15), så
// epoch-/stale-vakterna och env/live-gaten är EN beprövad sanning, inte en ny variant.
//
// AKTIVT RUM ÄR PORTEN: joker är per rum (samma som tips). Utan ett aktivt rum är storen
// inaktiv (enabled=false, status 'idle').
//
// SÄKERHET ÄR SERVER-SIDE: deadline-låset + sekretessen + en-joker-per-dag bor i RLS/PK
// (bevisat med riktiga sessioner, T19). Provider:n förlitar sig aldrig på klienten för
// säkerhet, ett set som nekas av RLS (match låst) blir ett fail-loud-fel UI:t visar.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listMyJokers, upsertMyJoker, removeMyJoker, type RoomJoker } from '../../data/predictions';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsSync } from '../rooms';
import { JokerStoreContext, type JokerStatus, type JokerStore } from './joker-context';

export interface JokerProviderProps {
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

export function JokerProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
}: JokerProviderProps) {
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;

  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  const enabled = liveConfigured && activeRoomId !== null;

  const [status, setStatus] = useState<JokerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [myJokers, setMyJokers] = useState<ReadonlyMap<string, RoomJoker>>(new Map());

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!liveConfigured) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, liveConfigured, env]);

  // FETCH-VAKT (samma mönster som PredictionsProvider): ett föråldrat laddnings-svar får
  // aldrig skriva över ett nyare (rumsbyte under await:en).
  const loadTokenRef = useRef(0);
  // SAVE-VAKT bunden till activeRoomId: en optimistisk uppdatering som startade i rum A
  // ska droppas om rummet bytt under await:en (svaret tillhör fel rum).
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  activeRoomIdRef.current = activeRoomId;

  // Ladda MINA joker-val för det aktiva rummet (vid rumsbyte). Tom utan rum.
  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      setMyJokers(new Map());
      setStatus('idle');
      setError(null);
      return;
    }
    setStatus('loading');
    setError(null);
    listMyJokers(supabase, activeRoomId)
      .then((jokers) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rumsbyte hann starta), kasta tyst
        }
        setMyJokers(new Map(jokers.map((j) => [j.matchId, j])));
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda dina joker.');
        setStatus('error');
      });
  }, [supabase, activeRoomId]);

  const setJoker = useCallback(
    async (matchId: string) => {
      // Samma fail-loud-kontrakt som savePrediction: utan klient/rum finns inget att
      // spara till (UI:t gatar redan, så detta nås bara via felaktig wiring).
      if (!supabase) {
        throw new Error(
          '[VM2026] Spara joker misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error('[VM2026] Spara joker misslyckades: inget aktivt rum att spara jokern i.');
      }
      const saveRoomId = activeRoomId;
      const saved = await upsertMyJoker(supabase, activeRoomId, { matchId });
      if (saveRoomId !== activeRoomIdRef.current) {
        return; // rummet bytte under await:en, A:s svar hör inte hit längre
      }
      // Optimistiskt: spegla in jokern. EN joker per dag, så en NY joker samma dag som en
      // befintlig flyttade jokern på servern (PK på joker_day) , vi måste därför STÄDA bort
      // den GAMLA matchens lokala joker-rad om den låg samma dag (annars visas två joker en
      // dag i UI:t). Vi tar bort alla lokala joker med samma jokerDay som den sparade, sen
      // sätter den nya. (Servern har redan en enda rad per dag; vi speglar det.)
      setMyJokers((prev) => {
        const next = new Map(prev);
        for (const [mid, j] of prev) {
          if (j.jokerDay === saved.jokerDay && mid !== saved.matchId) {
            next.delete(mid); // den gamla jokern samma dag, nu ersatt
          }
        }
        next.set(saved.matchId, saved);
        return next;
      });
    },
    [supabase, activeRoomId]
  );

  const clearJoker = useCallback(
    async (matchId: string) => {
      if (!supabase) {
        throw new Error(
          '[VM2026] Ångra joker misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error('[VM2026] Ångra joker misslyckades: inget aktivt rum.');
      }
      const saveRoomId = activeRoomId;
      await removeMyJoker(supabase, activeRoomId, matchId);
      if (saveRoomId !== activeRoomIdRef.current) {
        return;
      }
      setMyJokers((prev) => {
        if (!prev.has(matchId)) {
          return prev;
        }
        const next = new Map(prev);
        next.delete(matchId);
        return next;
      });
    },
    [supabase, activeRoomId]
  );

  const store: JokerStore = useMemo(
    () => ({ enabled, status, error, activeRoomId, myJokers, setJoker, clearJoker }),
    [enabled, status, error, activeRoomId, myJokers, setJoker, clearJoker]
  );

  return <JokerStoreContext.Provider value={store}>{children}</JokerStoreContext.Provider>;
}
