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
import { copyMyPredictions, type CopyReport } from '../../data/predictions';
import { WC2026_MATCHES } from '../../data/wc2026';
import { RoomsStoreContext, type RoomsStatus, type RoomsStore } from './rooms-context';
import { clearActiveRoomId, readActiveRoomId, writeActiveRoomId } from './active-room-storage';
import { deriveCopyLocks } from './derive-copy-locks';

// Matchplanens avsparkstider (match_id -> kickoff ISO), EN gång på modul-nivå (statisk
// data). Lås-klassificeraren slår upp deadline-ankaren här (T52). En sanning för
// tiderna: WC2026_MATCHES (källåkrad matchplan), ingen dubblerad tabell.
const KICKOFF_BY_MATCH_ID: ReadonlyMap<string, string> = new Map(
  WC2026_MATCHES.map((m) => [m.id, m.kickoff])
);

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
  // INVALIDERINGS-RÄKNARE för tips-vyerna (T61, #110). copyMyTips bumpar den efter en
  // LYCKAD kopiering; tips-providers har den i sina fetch-deps och hämtar då om. Ett
  // monotont tal (inte en boolean): varje lyckad kopiering är en NY invalidering, även
  // två i rad mot samma rum, så en andra kopiering inte tappas av att talet redan var "på".
  const [tipsRefreshNonce, setTipsRefreshNonce] = useState(0);

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

  // CANCELLATION-GUARD för loadRoomData (KA-F2): ett snabbt rumsbyte (välj A, välj
  // B innan A:s listMembers/listRoomResults hunnit svara) får ALDRIG låta A:s
  // föråldrade svar skriva över B:s state. listMembers/listRoomResults är två
  // oberoende nätanrop vars ordning inte är garanterad, så utan vakt kan A:s svar
  // landa EFTER B:s och visa B:s rum med A:s medlemmar/resultat. Varje load tar en
  // monotont ökande token; bara den SENAST startade laddningens svar får tillämpas
  // (epoch-mönster), äldre svar kastas tyst (de är per definition inaktuella).
  const loadTokenRef = useRef(0);

  /** Ladda om medlemmar + resultat för ett rum (eller det aktiva). Fail loud. */
  const loadRoomData = useCallback(
    async (room: RoomSummary | null) => {
      // Boka denna laddning som den senaste; ett senare anrop ogiltigförklarar oss.
      const token = ++loadTokenRef.current;
      if (!supabase || !room) {
        // Även den tomma vägen (lämna/inget rum) måste respektera token: ett
        // senare riktigt rumsval ska inte nollas av ett tidigare "rensa".
        if (token === loadTokenRef.current) {
          setMembers([]);
          setResults([]);
        }
        return;
      }
      const [m, r] = await Promise.all([
        listMembers(supabase, room.id),
        listRoomResults(supabase, room.id),
      ]);
      // Föråldrat svar (ett nyare rumsbyte hann starta): kasta det tyst, så
      // slutstate alltid speglar det SENAST valda rummet, inte vem som svarade sist.
      if (token !== loadTokenRef.current) {
        return;
      }
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

      // ÅTERSTÄLL det senast valda rummet över sidladdning (T38, #67). VERIFIERA
      // mot listMyRooms: bara om det sparade id:t fortfarande finns i mina rum
      // (rummet finns OCH jag är medlem) väljs det. Annars (rummet borttaget /
      // jag har lämnat) faller vi rent till no-room och rensar det inaktuella
      // id:t, så vi inte envist försöker återställa ett dött rum. loadRoomData tar
      // en epoch-token (loadTokenRef), så ett senare manuellt rumsbyte under
      // laddningen alltid vinner över denna återställning (bryter inte stale-vakten).
      const savedId = readActiveRoomId();
      if (savedId === null) {
        return;
      }
      const saved = rooms.find((r) => r.id === savedId) ?? null;
      if (saved === null) {
        clearActiveRoomId();
        return;
      }
      setActiveRoom(saved);
      await loadRoomData(saved);
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
    // loadRoomData beror bara på supabase (redan i deps), så återställningen lägger
    // inte till ett nytt re-körnings-villkor utöver enabled/supabase.
  }, [enabled, supabase, loadRoomData]);

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
      // Man ska ALLTID stå i ett rum efter skapa (T38, #67): gör det aktivt OCH
      // persistera valet så det överlever sidladdning.
      writeActiveRoomId(room.id);
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
      // Man ska ALLTID stå i ett rum efter gå-med (T38, #67): aktivt + persistat.
      writeActiveRoomId(room.id);
      await loadRoomData(room);
      return true;
    },
    [supabase, loadRoomData]
  );

  const selectRoom = useCallback(
    async (roomId: string) => {
      const room = myRooms.find((r) => r.id === roomId) ?? null;
      setActiveRoom(room);
      // Multi-rum: persistera SENAST valda rummet så det återställs vid nästa start.
      // Hittas inte rummet (oväntat) rensar vi hellre än lämnar ett felaktigt id.
      if (room) {
        writeActiveRoomId(room.id);
      } else {
        clearActiveRoomId();
      }
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
      // Lämnade man det aktiva rummet: nollställ aktivt + dess data + rensa det
      // persistade id:t (annars skulle nästa start försöka återställa ett rum man
      // inte längre är medlem i, T38, #67).
      setActiveRoom((prev) => (prev?.id === roomId ? null : prev));
      if (activeRoomRef.current?.id === roomId) {
        setMembers([]);
        setResults([]);
        clearActiveRoomId();
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

  // T52 (#91): kopiera MINA tips från ett annat rum till det AKTIVA rummet. Tunt lim:
  // engine:n (copyMyPredictions) gör allt arbete; här binder vi den till klienten, det
  // aktiva rummet (målet) och lås-klassificeraren (matchplanens avspark = deadline).
  const copyMyTips = useCallback(
    async (sourceRoomId: string): Promise<CopyReport> => {
      const room = activeRoomRef.current;
      // Fail loud (PRINCIPLES §8): utan klient eller aktivt rum finns inget mål att
      // kopiera TILL. UI:t gatar detta (knappen visas bara med ett aktivt rum + ett
      // annat käll-rum), så detta nås bara vid felaktig wiring, exakt vad felet avslöjar.
      if (!supabase) {
        throw new Error(
          '[VM2026] Kopiera tips misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (!room) {
        throw new Error('[VM2026] Kopiera tips misslyckades: inget aktivt rum att kopiera till.');
      }
      // Lås-klassificeraren körs på källans nycklar EFTER att engine:n läst dem (en
      // läsning). now = nuet (server-RLS är ändå sanningen; detta rapporterar bara ärligt).
      const report = await copyMyPredictions(supabase, sourceRoomId, room.id, (source) =>
        deriveCopyLocks(source, KICKOFF_BY_MATCH_ID, new Date())
      );
      // T61 (#110), rotorsak: engine:n skrev nya tips-rader i målrummet via upsertMy*,
      // men tips-vyernas providers läser bara vid mount/rum-byte och fick aldrig veta
      // att kopieringen skrev något, så tipsen syntes inte förrän man lämnade och gick
      // in i rummet igen. Bumpa invaliderings-räknaren BARA när minst ETT tips faktiskt
      // kopierades; talet ligger i tips-providernas fetch-deps och utlöser då en tyst
      // re-fetch. Kopierades inget (allt låst/redan tippat, eller källan tom) ändras inga
      // rader i målet, så ingen re-fetch behövs, vi hoppar bumpen och sparar ett nätanrop.
      // En FAILad kopiering (report.total.copied === 0, failed > 0) bumpar inte heller:
      // inget landade i målet att hämta, och CopyTipsControl visar redan felet ärligt.
      if (report.total.copied > 0) {
        setTipsRefreshNonce((n) => n + 1);
      }
      return report;
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
      tipsRefreshNonce,
      createRoom,
      joinRoom,
      selectRoom,
      leaveRoom,
      refresh,
      saveResult,
      copyMyTips,
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
      tipsRefreshNonce,
      createRoom,
      joinRoom,
      selectRoom,
      leaveRoom,
      refresh,
      saveResult,
      copyMyTips,
    ]
  );

  return <RoomsStoreContext.Provider value={store}>{children}</RoomsStoreContext.Provider>;
}
