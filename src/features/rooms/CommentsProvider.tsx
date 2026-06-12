// Provider för kommentar-storen (T66, #121).
//
// ANSVAR: koordinera kommentar-API:t (data/rooms/comments-api) med det AKTIVA rummet
// (ur rooms-synk-seamen) och hålla rummets kommentarer i React. Tunt: all DB-logik bor
// i kommentar-API:t, provider:n är limmet mot React + UI:t. Samma form som
// PredictionsProvider (tyst re-fetch) + RoomsProvider (realtids-prenumeration).
//
// AKTIVT RUM ÄR PORTEN: kommentarer är per rum. Vi läser det aktiva rummet + den egna
// identiteten via rooms-synk-seamen (useRoomsSync), samma seam tips-/results-lagren
// använder, så ingen ny koppling uppfinns. Utan ett aktivt rum är storen inaktiv
// (enabled=false, status 'idle'): UI:t visar då inget kommentar-fält.
//
// LIVE UTAN RELOAD (T18-mönstret, signal-inte-data): vi prenumererar på det aktiva
// rummets room_comments-rader (filtrerat på rummet). En ny/raderad kommentar ger en
// postgres_changes-SIGNAL (RLS släpper bara rader till rum-medlemmar), och vi svarar
// med en TYST re-fetch genom RLS. Vi läser ALDRIG payloadens rad-data (härledd state).
// Signalen bumpar en lokal nonce som ligger i load-effektens deps (samma seam som
// tipsRefreshNonce i T61), så en (1) re-fetch körs, ingen polling.
//
// SÄKERHET ÄR SERVER-SIDE: medlemskaps- + ägar-kontrollen bor i RLS (bevisat med
// riktiga sessioner, comments-rls.integration.test.ts). Provider:n förlitar sig aldrig
// på klienten för säkerhet; ett save/delete som RLS nekar blir ett fail-loud-fel.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addComment as apiAddComment, deleteMyComment, listRoomComments } from '../../data/rooms';
import type { RoomComment } from '../../data/rooms';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRealtimeSubscription } from '../../data/realtime';
import { useRoomsSync } from './rooms-context';
import { CommentsStoreContext, type CommentsStatus, type CommentsStore } from './comments-context';

export interface CommentsProviderProps {
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
}

export function CommentsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
  userId: userIdProp,
}: CommentsProviderProps) {
  // Aktivt rum + egen identitet ur rooms-synk-seamen (samma seam tips-lagret läser),
  // om inte explicit injicerat (test). Hook anropas ovillkorligt (regler).
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;
  const userId = userIdProp !== undefined ? userIdProp : roomsSync.userId;

  // Live kräver BÅDE env OCH live-flaggan (samma tvåstegs-gate som datalagret).
  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  // Kommentar-lagret är AKTIVT bara med live-konfig OCH ett aktivt rum (porten).
  const enabled = liveConfigured && activeRoomId !== null;

  const [status, setStatus] = useState<CommentsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<RoomComment[]>([]);
  // REALTIDS-INVALIDERING (T18-mönstret): en postgres_changes-signal för rummets
  // kommentarer bumpar den här räknaren, som ligger i load-effektens deps -> en tyst
  // re-fetch. Ett monotont tal (inte en boolean): två signaler i rad ger två re-fetch-
  // triggar, ingen tappas. Stabilt i vila (ingen polling).
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

  // FETCH-VAKT (samma mönster som PredictionsProvider, KA-F2): ett föråldrat laddnings-
  // svar får aldrig skriva över ett nyare. Bumpas vid VARJE effekt-körning (rum-byte
  // OCH realtids-re-fetch), så bara det SENASTE fetch-svaret vinner.
  const loadTokenRef = useRef(0);
  // SAVE-VAKT (samma mönster som PredictionsProvider/F1): en optimistisk save får bara
  // droppas vid ett RUM-BYTE under await:en (då tillhör svaret fel rum), INTE av en tyst
  // realtids-re-fetch i SAMMA rum. Ref med det SENASTE aktiva rummet.
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  // Vilket rum den NU laddade datan tillhör (null = ingen data än). Skiljer en SYNLIG
  // laddning (initial / rum-byte: visa 'loading') från en TYST re-fetch (realtids-signal:
  // samma rum, behåll datan + 'ready', byt bara ut den när svaret kommer). Samma mönster
  // som PredictionsProvider (T61) / LeaderboardProvider (T55): en signal-triggad re-fetch
  // ska INTE flimra "Laddar..." och tömma kommentar-listan trots att giltig data finns.
  const loadedRoomIdRef = useRef<string | null>(null);

  // Ladda rummets kommentarer (vid rum-byte ELLER realtids-signal). Tom utan rum.
  useEffect(() => {
    const token = ++loadTokenRef.current;
    // CANCELLED-VAKT (T70): den asynkrona listRoomComments-resolutionen kan landa EFTER
    // att komponenten avmonterats / testmiljön (jsdom) tagits ner. Då finns inget
    // `window` och ett setError/setStatus (raden ~150) i .catch ger "window is not
    // defined"-brus i teardown. token-vakten skyddar mot FÖRÅLDRADE svar (nyare effekt
    // hann starta) men inte mot ett svar som kommer efter UNMOUNT (ingen nyare effekt
    // bumpar token då). Cleanup sätter cancelled=true, och alla state-setters gatas på
    // den, samma cancelled-mönster som OfficialResultsProvider redan använder.
    let cancelled = false;
    if (!supabase || activeRoomId === null) {
      // Inget aktivt rum: nolla, gå till idle (inte loading/error).
      setComments([]);
      setStatus('idle');
      setError(null);
      loadedRoomIdRef.current = null;
      return;
    }
    // TYST RE-FETCH (T55/T61-valet): en realtids-triggad omhämtning i SAMMA rum vi
    // redan har data för ska INTE flimra 'loading' och tömma listan. 'loading' visas
    // bara vid INITIAL hämtning (ingen data än) och RUM-BYTE (datan hör till fel rum).
    const isSilentRefetch = loadedRoomIdRef.current === activeRoomId;
    if (!isSilentRefetch) {
      setStatus('loading');
      setError(null);
    }
    listRoomComments(supabase, activeRoomId)
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
          return; // avmonterad (inget window kvar) ELLER föråldrat svar: rör ingen state
        }
        // FELVÄG, TYST RE-FETCH (samma val som T55): en realtids-triggad omhämtning som
        // failar får ALDRIG kasta bort de befintliga (giltiga) kommentarerna. Behåll
        // datan + 'ready', logga felet (fail-loud i konsolen). En INITIAL/rum-byte-fetch
        // som failar har ingen data att skydda -> 'error' (fail loud, PRINCIPLES §8).
        if (isSilentRefetch) {
          console.warn(
            '[VM2026] Tyst omhämtning av kommentarer (realtids-signal) misslyckades, behåller befintlig data:',
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
  // rummet så vi bara väcks av relevanta ändringar. En ny/raderad kommentar skickar en
  // postgres_changes-signal till de andra MEDLEMMARNA (RLS släpper bara rader till
  // rum-medlemmar). Vi merge:ar ALDRIG payloadens rad (härledd state); signalen bumpar
  // bara nonce -> tyst re-fetch genom RLS. Egen kanal ('vm2026-room-comments') så vi
  // inte krockar med rums-lagrets kanal. subscriptionKey = rum-id (rum-byte river +
  // öppnar ny filtrerad). Inget aktivt rum -> enabled false -> ingen kanal.
  useRealtimeSubscription({
    enabled: enabled && activeRoomId !== null,
    client: supabase,
    channelName: 'vm2026-room-comments',
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
    async (body: string) => {
      // Kontraktet säger "Kastar vid fel". Utan klient ELLER rum finns inget att skriva
      // till: KASTA (fail loud, PRINCIPLES §8) i stället för en tyst no-op. UI:t gatar
      // redan detta (fältet renderas bara när store.enabled), så detta nås bara via
      // felaktig wiring, exakt det ett fail-loud-fel ska avslöja. Skilda meddelanden så
      // ett wiring-fel kan felsökas ur texten (samma mönster som PredictionsProvider).
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
      const saved = await apiAddComment(supabase, activeRoomId, body);
      if (saveRoomId !== activeRoomIdRef.current) {
        return; // rum-byte under await: A:s kommentar hör inte hemma i B:s vy (RLS har ändå sparat den i rätt rum)
      }
      // Optimistiskt: lägg in den sparade kommentaren sist (nyast nederst). Realtids-
      // re-fetchen kommer ändå (egna INSERT triggar också signalen), men den kan dröja
      // en aning, så vi speglar in den direkt. Dedupe på id så en efterföljande re-fetch
      // inte dubblerar raden.
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

  const store: CommentsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      comments,
      userId,
      addComment,
      deleteComment,
    }),
    [enabled, status, error, comments, userId, addComment, deleteComment]
  );

  return <CommentsStoreContext.Provider value={store}>{children}</CommentsStoreContext.Provider>;
}
