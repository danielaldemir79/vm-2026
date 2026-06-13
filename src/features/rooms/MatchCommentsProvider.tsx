// Provider för match-kommentar-storen (T77, #161).
//
// ANSVAR: koordinera kommentar-API:t (data/rooms/comments-api) med det AKTIVA rummet
// (ur rooms-synk-seamen) och hålla rummets MATCH-kommentarer i React, GRUPPERADE per
// match. Tunt: all DB-logik bor i kommentar-API:t, grupperingen i match-comments-
// aggregate.ts (ren, testbar), provider:n är limmet mot React + UI:t. EXAKT samma form
// som ReactionsProvider (T24): EN hämtning + EN realtidskanal för hela rummet, grupperad
// i minnet, inte en hämtning/kanal per match.
//
// SKILD FRÅN RUMS-CHATTEN (T66, CommentsProvider): den här laddar bara MATCH-trådar
// (listRoomMatchComments = match_id IS NOT NULL), CommentsProvider bara rums-chatten
// (listRoomComments = match_id IS NULL). Två stores på SAMMA tabell, två tråd-rymder,
// helt åtskilda, så T66-ytan är oförändrad.
//
// AKTIVT RUM ÄR PORTEN: kommentarer är per rum. Vi läser det aktiva rummet + egen
// identitet + medlemmar via rooms-synk-seamen (useRoomsSync), samma seam tips-/reaktions-
// lagren använder, så ingen ny koppling uppfinns. Utan ett aktivt rum är storen inaktiv
// (enabled=false, status 'idle'): matchkorten visar då ingen kommentar-affordans.
//
// LIVE UTAN RELOAD (T18-mönstret, signal-inte-data): vi prenumererar på det aktiva
// rummets room_comments-rader (filtrerat på rummet). En ny/raderad kommentar ger en
// postgres_changes-SIGNAL (RLS släpper bara rader till rum-medlemmar), och vi svarar med
// en TYST re-fetch genom RLS. Vi läser ALDRIG payloadens rad-data (härledd state). En
// rums-chatt-kommentar (match_id null) väcker också kanalen (filtret är på rum, inte
// tråd), men re-fetchen re-filtrerar till match-trådar, så den extra väckningen är
// ofarlig (bara en omhämtning). Signalen bumpar en nonce i load-effektens deps (T61).
//
// SÄKERHET ÄR SERVER-SIDE: medlemskaps- + ägar-kontrollen bor i RLS (room_id-gatad,
// oförändrad från T66, bevisad med riktiga sessioner i match-comments-rls.integration.
// test.ts). Provider:n förlitar sig aldrig på klienten för säkerhet; ett save/delete som
// RLS nekar blir ett fail-loud-fel.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addComment as apiAddComment,
  deleteMyComment,
  listRoomMatchComments,
  type RoomComment,
  type RoomMember,
} from '../../data/rooms';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRealtimeSubscription } from '../../data/realtime';
import { useRoomsSync } from './rooms-context';
import { groupCommentsByMatch } from './match-comments-aggregate';
import {
  MatchCommentsStoreContext,
  type MatchCommentsStatus,
  type MatchCommentsStore,
} from './match-comments-context';

export interface MatchCommentsProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
  /**
   * Injicerbart aktivt rum-id (testbarhet). Default = rooms-synk-seamen
   * (useRoomsSync.activeRoomId), så kommentarer följer rummet utan ny koppling.
   */
  activeRoomId?: string | null;
  /**
   * Injicerbart eget user_id (testbarhet). Default = rooms-synk-seamen
   * (useRoomsSync.userId), så UI:t vet vilka rader som är "mina".
   */
  userId?: string | null;
  /**
   * Injicerbar medlemslista (testbarhet). Default = rooms-synk-seamen
   * (useRoomsSync.members), så UI:t kan mappa user_id -> displayName utan en egen
   * koppling till rums-storen (samma seam som reaktionerna).
   */
  members?: RoomMember[];
}

export function MatchCommentsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
  userId: userIdProp,
  members: membersProp,
}: MatchCommentsProviderProps) {
  // Aktivt rum + egen identitet + medlemmar ur rooms-synk-seamen (samma seam tips-lagret
  // läser), om inte explicit injicerat (test). Hook anropas ovillkorligt (regler).
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;
  const userId = userIdProp !== undefined ? userIdProp : roomsSync.userId;
  const members = membersProp !== undefined ? membersProp : roomsSync.members;

  // Live kräver BÅDE env OCH live-flaggan (samma tvåstegs-gate som datalagret).
  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  // Match-kommentar-lagret är AKTIVT bara med live-konfig OCH ett aktivt rum (porten).
  const enabled = liveConfigured && activeRoomId !== null;

  const [status, setStatus] = useState<MatchCommentsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // De RÅA match-kommentar-raderna; grupperingen (byMatch) härleds via useMemo nedan.
  const [comments, setComments] = useState<RoomComment[]>([]);
  // REALTIDS-INVALIDERING (T18-mönstret): en postgres_changes-signal bumpar räknaren,
  // som ligger i load-effektens deps -> en tyst re-fetch. Monotont tal (inte boolean):
  // två signaler i rad ger två re-fetch-triggar, ingen tappas. Stabilt i vila (ingen polling).
  const [realtimeNonce, setRealtimeNonce] = useState(0);

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!liveConfigured) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, liveConfigured, env]);

  // FETCH-VAKT (samma mönster som ReactionsProvider/CommentsProvider): ett föråldrat
  // laddnings-svar får aldrig skriva över ett nyare. Bumpas vid VARJE effekt-körning.
  const loadTokenRef = useRef(0);
  // SAVE-VAKT: en optimistisk save får bara droppas vid ett RUM-BYTE under await:en (då
  // tillhör svaret fel rum), INTE av en tyst realtids-re-fetch i SAMMA rum.
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  // Vilket rum den NU laddade datan tillhör (null = ingen data än). Skiljer en SYNLIG
  // laddning (initial / rum-byte: visa 'loading') från en TYST re-fetch (realtids-signal:
  // samma rum, behåll datan + 'ready'). Samma mönster som ReactionsProvider (T24).
  const loadedRoomIdRef = useRef<string | null>(null);

  // Ladda rummets match-kommentarer (vid rum-byte ELLER realtids-signal). Tom utan rum.
  useEffect(() => {
    const token = ++loadTokenRef.current;
    // CANCELLED-VAKT (T70): den asynkrona resolutionen kan landa EFTER unmount (jsdom-
    // teardown). cancelled gatar alla state-setters mot brus, token-vakten mot föråldrade
    // svar. Samma cancelled-mönster som CommentsProvider.
    let cancelled = false;
    if (!supabase || activeRoomId === null) {
      setComments([]);
      setStatus('idle');
      setError(null);
      loadedRoomIdRef.current = null;
      return;
    }
    // TYST RE-FETCH (T55/T61-valet): en realtids-triggad omhämtning i SAMMA rum vi redan
    // har data för ska INTE flimra 'loading'. 'loading' visas bara vid INITIAL hämtning
    // (ingen data än) och RUM-BYTE (datan hör till fel rum).
    const isSilentRefetch = loadedRoomIdRef.current === activeRoomId;
    if (!isSilentRefetch) {
      setStatus('loading');
      setError(null);
    }
    listRoomMatchComments(supabase, activeRoomId)
      .then((rows) => {
        if (cancelled || token !== loadTokenRef.current) {
          return; // avmonterad ELLER föråldrat svar (nyare rum-byte/signal hann starta)
        }
        setComments(rows);
        setStatus('ready');
        loadedRoomIdRef.current = activeRoomId;
      })
      .catch((err: unknown) => {
        if (cancelled || token !== loadTokenRef.current) {
          return;
        }
        // FELVÄG, TYST RE-FETCH (samma val som T24/T55): en realtids-triggad omhämtning
        // som failar får ALDRIG kasta bort de befintliga (giltiga) kommentarerna. Behåll
        // datan + 'ready', logga felet (fail-loud i konsolen). En INITIAL/rum-byte-fetch
        // som failar har ingen data att skydda -> 'error' (fail loud, PRINCIPLES §8).
        if (isSilentRefetch) {
          console.warn(
            '[VM2026] Tyst omhämtning av match-kommentarer (realtids-signal) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda kommentarerna.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, activeRoomId, realtimeNonce]);

  // REALTID (T18, #18): prenumerera på det AKTIVA rummets kommentarer, filtrerat på
  // rummet. En ny/raderad kommentar (match-tråd ELLER rums-chatt) skickar en postgres_
  // changes-signal till medlemmarna (RLS släpper bara rader till rum-medlemmar). Vi
  // merge:ar ALDRIG payloadens rad (härledd state); signalen bumpar bara nonce -> tyst
  // re-fetch genom RLS (som re-filtrerar till match-trådar). Egen kanal
  // ('vm2026-room-match-comments') så vi inte krockar med rums-chattens kanal
  // ('vm2026-room-comments'). subscriptionKey = rum-id (rum-byte river + öppnar ny).
  useRealtimeSubscription({
    enabled: enabled && activeRoomId !== null,
    client: supabase,
    channelName: 'vm2026-room-match-comments',
    subscriptionKey: activeRoomId,
    tables:
      activeRoomId !== null
        ? [{ table: 'room_comments', filter: `room_id=eq.${activeRoomId}` }]
        : [],
    onChange: () => {
      setRealtimeNonce((n) => n + 1);
    },
  });

  const addComment = useCallback(
    async (matchId: string, body: string) => {
      // Kontraktet säger "Kastar vid fel". Utan klient ELLER rum finns inget att skriva
      // till: KASTA (fail loud, PRINCIPLES §8) i stället för en tyst no-op. UI:t gatar
      // redan detta (affordansen renderas bara när store.enabled), så detta nås bara via
      // felaktig wiring, exakt det ett fail-loud-fel ska avslöja.
      if (!supabase) {
        throw new Error(
          '[VM2026] Skriv kommentar misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error('[VM2026] Skriv kommentar misslyckades: inget aktivt rum att skriva i.');
      }
      // Boka in vilket RUM detta save tillhör (stale-save-vakt): byter vän rum under
      // await:en tillhör svaret fel rum och droppas (load-effekten har laddat nya rummet).
      const saveRoomId = activeRoomId;
      const saved = await apiAddComment(supabase, activeRoomId, body, matchId);
      if (saveRoomId !== activeRoomIdRef.current) {
        return; // rum-byte under await: A:s kommentar hör inte hemma i B:s vy (RLS sparade den i rätt rum)
      }
      // Optimistiskt: lägg in den sparade kommentaren. Realtids-re-fetchen kommer ändå
      // (egna INSERT triggar signalen), men kan dröja, så vi speglar in den direkt.
      // Dedupe på id så en efterföljande re-fetch inte dubblerar raden.
      setComments((prev) => (prev.some((c) => c.id === saved.id) ? prev : [...prev, saved]));
    },
    [supabase, activeRoomId]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!supabase) {
        throw new Error(
          '[VM2026] Radera kommentar misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      await deleteMyComment(supabase, commentId);
      // Optimistiskt: ta bort raden lokalt direkt (realtids-signalen bekräftar sedan).
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    },
    [supabase]
  );

  // GRUPPERA per match (härledd state, en sanning): räknas om bara när raderna ändras.
  const byMatch = useMemo(() => groupCommentsByMatch(comments), [comments]);

  // VISNINGSNAMN per user_id ur rummets medlemmar (room_members, EN sanning, samma karta
  // RoomComments/MatchReactions bygger). Buren på storen så UI:t slår namn utan en egen
  // koppling till rums-storen.
  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [members]);

  const store: MatchCommentsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      byMatch,
      userId,
      nameByUser,
      addComment,
      deleteComment,
    }),
    [enabled, status, error, byMatch, userId, nameByUser, addComment, deleteComment]
  );

  return (
    <MatchCommentsStoreContext.Provider value={store}>
      {children}
    </MatchCommentsStoreContext.Provider>
  );
}
