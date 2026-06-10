// Provider för rums-storen (T14, #14).
//
// ANSVAR: koordinera auth (anonym session) + rooms-API:t och hålla rums-state i
// React. Tunt: all DB-logik bor i rooms-API:t (data/rooms), provider:n är limmet
// mot React + UI:t.
//
// ENABLED-GIND: rummen kräver en konfigurerad Supabase (live-läge). Är env inte
// satt (fixtures-läge, lokal utveckling utan .env.local) är `enabled` false och
// hela rums-lagret är inaktivt, appen fungerar då precis som idag (lokal,
// fixtures-driven), bara det sociala lagret är vilande. Så fixtures-till-live-
// växlingen tänder rummen UTAN kod-ändring (kravet).
//
// OM-HÄMTNING UTAN POLLING (T18 gör realtid): vi POLLAR inte. En enkel refetch
// vid window-fokus + online-event räcker nu (en vän som kommer tillbaka till
// fliken eller får nät igen ser färska delade resultat). Dokumenterat val, T18
// byter detta mot Supabase Realtime-prenumerationer på samma refresh-seam.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createRoom as apiCreateRoom,
  joinRoomByCode as apiJoinRoom,
  leaveRoom as apiLeaveRoom,
  listMembers,
  listMyRooms,
  listRoomResults,
  upsertRoomResult,
  ensureSession,
  type RoomMatchResult,
  type RoomMember,
  type RoomResultInput,
  type RoomSummary,
} from '../../data/rooms';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { RoomsStoreContext, type RoomsStatus, type RoomsStore } from './rooms-context';

export interface RoomsProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /**
   * Injicerbar klient (testbarhet): låter test ge en mock-klient utan att skapa
   * en riktig Supabase-anslutning. Default = den riktiga singletonen ur env.
   */
  client?: VmSupabaseClient;
}

export function RoomsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
}: RoomsProviderProps) {
  // Live kräver BÅDE env OCH live-flaggan (samma tvåstegs-gate som datalagret).
  const enabled = isSupabaseConfigured(env) && liveReady;

  const [status, setStatus] = useState<RoomsStatus>(enabled ? 'loading' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [myRooms, setMyRooms] = useState<RoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomSummary | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [results, setResults] = useState<RoomMatchResult[]>([]);

  // Den aktiva klienten: injicerad (test) eller den riktiga singletonen. Memoiserad
  // så identiteten är stabil (effekt-deps). Bara skapad när rummen är aktiva.
  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!enabled) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, enabled, env]);

  // Ref till det aktiva rummet så refresh (bunden till fokus/online-event) alltid
  // läser DET NUVARANDE rummet utan att avregistrera/registrera lyssnaren per byte.
  const activeRoomRef = useRef<RoomSummary | null>(null);
  activeRoomRef.current = activeRoom;

  /** Ladda om medlemmar + resultat för ett rum (eller det aktiva). Fail loud. */
  const loadRoomData = useCallback(
    async (room: RoomSummary | null) => {
      if (!supabase || !room) {
        setMembers([]);
        setResults([]);
        return;
      }
      const [m, r] = await Promise.all([
        listMembers(supabase, room.id),
        listRoomResults(supabase, room.id),
      ]);
      setMembers(m);
      setResults(r);
    },
    [supabase]
  );

  // Initiering: säkerställ anonym session + ladda mina rum (en gång, när aktiva).
  useEffect(() => {
    if (!enabled || !supabase) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    (async () => {
      const identity = await ensureSession(supabase);
      const rooms = await listMyRooms(supabase);
      if (cancelled) {
        return;
      }
      setUserId(identity.userId);
      setMyRooms(rooms);
      setStatus('ready');
    })().catch((err: unknown) => {
      if (cancelled) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Kunde inte ladda rummen.');
      setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, supabase]);

  // OM-HÄMTNING vid fokus/online (ingen polling, T18 gör realtid). Refetchar det
  // aktiva rummets delade data när användaren kommer tillbaka eller får nät igen.
  useEffect(() => {
    if (!enabled || !supabase) {
      return;
    }
    const refetch = () => {
      const room = activeRoomRef.current;
      if (room) {
        loadRoomData(room).catch(() => {
          // En refetch-miss (t.ex. flyktigt nätfel) ska inte krascha appen; nästa
          // fokus/online-event försöker igen. Felet är icke-kritiskt (vi har redan
          // data) så vi sväljer det här medvetet, till skillnad från initierings-
          // felet ovan som fail-loud:ar.
        });
      }
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
  }, [enabled, supabase, loadRoomData]);

  const createRoom = useCallback(
    async (name: string, displayName: string) => {
      if (!supabase) {
        return;
      }
      const room = await apiCreateRoom(supabase, name, displayName);
      setMyRooms((prev) => [...prev, room]);
      setActiveRoom(room);
      await loadRoomData(room);
    },
    [supabase, loadRoomData]
  );

  const joinRoom = useCallback(
    async (code: string, displayName: string): Promise<boolean> => {
      if (!supabase) {
        return false;
      }
      const room = await apiJoinRoom(supabase, code, displayName);
      if (!room) {
        return false; // okänd kod
      }
      setMyRooms((prev) => (prev.some((r) => r.id === room.id) ? prev : [...prev, room]));
      setActiveRoom(room);
      await loadRoomData(room);
      return true;
    },
    [supabase, loadRoomData]
  );

  const selectRoom = useCallback(
    async (roomId: string) => {
      const room = myRooms.find((r) => r.id === roomId) ?? null;
      setActiveRoom(room);
      await loadRoomData(room);
    },
    [myRooms, loadRoomData]
  );

  const leaveRoom = useCallback(
    async (roomId: string) => {
      if (!supabase) {
        return;
      }
      await apiLeaveRoom(supabase, roomId);
      setMyRooms((prev) => prev.filter((r) => r.id !== roomId));
      // Lämnade man det aktiva rummet: nollställ aktivt + dess data.
      setActiveRoom((prev) => (prev?.id === roomId ? null : prev));
      if (activeRoomRef.current?.id === roomId) {
        setMembers([]);
        setResults([]);
      }
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    await loadRoomData(activeRoomRef.current);
  }, [loadRoomData]);

  const saveResult = useCallback(
    async (input: RoomResultInput) => {
      const room = activeRoomRef.current;
      if (!supabase || !room) {
        return;
      }
      const saved = await upsertRoomResult(supabase, room.id, input);
      // Optimistiskt: ersätt/lägg till i den lokala resultatlistan direkt.
      setResults((prev) => {
        const next = prev.filter((r) => r.matchId !== saved.matchId);
        next.push(saved);
        return next;
      });
    },
    [supabase]
  );

  const store: RoomsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      userId,
      myRooms,
      activeRoom,
      members,
      results,
      createRoom,
      joinRoom,
      selectRoom,
      leaveRoom,
      refresh,
      saveResult,
    }),
    [
      enabled,
      status,
      error,
      userId,
      myRooms,
      activeRoom,
      members,
      results,
      createRoom,
      joinRoom,
      selectRoom,
      leaveRoom,
      refresh,
      saveResult,
    ]
  );

  return <RoomsStoreContext.Provider value={store}>{children}</RoomsStoreContext.Provider>;
}
