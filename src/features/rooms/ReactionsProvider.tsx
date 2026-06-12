// Provider för reaktions-storen (T24, #24).
//
// ANSVAR: koordinera reaktions-API:t (data/rooms/reactions-api) med det AKTIVA rummet
// (ur rooms-synk-seamen) och hålla rummets reaktioner i React, AGGREGERADE per match.
// Tunt: all DB-logik bor i reaktions-API:t, aggregeringen i reaction-aggregate.ts
// (ren, testbar), provider:n är limmet mot React + UI:t. Exakt samma form som
// CommentsProvider (tyst re-fetch + realtids-signal), bara annan data + aggregering.
//
// AKTIVT RUM ÄR PORTEN: reaktioner är per rum. Vi läser det aktiva rummet + den egna
// identiteten via rooms-synk-seamen (useRoomsSync), samma seam tips-/kommentar-lagren
// använder, så ingen ny koppling uppfinns. Utan ett aktivt rum är storen inaktiv
// (enabled=false, status 'idle'): matchkorten visar då ingen reaktions-rad.
//
// LIVE UTAN RELOAD (T18-mönstret, signal-inte-data): vi prenumererar på det aktiva
// rummets room_reactions-rader (filtrerat på rummet). En ny/bytt/raderad reaktion ger
// en postgres_changes-SIGNAL (RLS släpper bara rader till rum-medlemmar), och vi svarar
// med en TYST re-fetch genom RLS. Vi läser ALDRIG payloadens rad-data (härledd state).
// Signalen bumpar en lokal nonce i load-effektens deps (samma seam som T61), så en (1)
// re-fetch körs, ingen polling.
//
// SÄKERHET ÄR SERVER-SIDE: medlemskaps- + ägar-kontrollen bor i RLS (bevisat med
// riktiga sessioner, reactions-rls.integration.test.ts). Provider:n förlitar sig aldrig
// på klienten för säkerhet; ett react/remove som RLS nekar blir ett fail-loud-fel.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  listRoomReactions,
  removeMyReaction,
  upsertMyReaction,
  type ReactionEmoji,
  type RoomReaction,
} from '../../data/rooms';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRealtimeSubscription } from '../../data/realtime';
import { useRoomsSync } from './rooms-context';
import { aggregateReactionsByMatch } from './reaction-aggregate';
import {
  ReactionsStoreContext,
  type ReactionsStatus,
  type ReactionsStore,
} from './reactions-context';

export interface ReactionsProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
  /**
   * Injicerbart aktivt rum-id (testbarhet). Default = rooms-synk-seamen
   * (useRoomsSync.activeRoomId), så reaktioner följer rummet utan ny koppling.
   */
  activeRoomId?: string | null;
  /**
   * Injicerbart eget user_id (testbarhet). Default = rooms-synk-seamen
   * (useRoomsSync.userId), så UI:t vet vilken bricka som är "min".
   */
  userId?: string | null;
}

export function ReactionsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
  userId: userIdProp,
}: ReactionsProviderProps) {
  // Aktivt rum + egen identitet ur rooms-synk-seamen (samma seam tips-lagret läser),
  // om inte explicit injicerat (test). Hook anropas ovillkorligt (regler).
  const roomsSync = useRoomsSync();
  const activeRoomId = activeRoomIdProp !== undefined ? activeRoomIdProp : roomsSync.activeRoomId;
  const userId = userIdProp !== undefined ? userIdProp : roomsSync.userId;

  // Live kräver BÅDE env OCH live-flaggan (samma tvåstegs-gate som datalagret).
  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  // Reaktions-lagret är AKTIVT bara med live-konfig OCH ett aktivt rum (porten).
  const enabled = liveConfigured && activeRoomId !== null;

  const [status, setStatus] = useState<ReactionsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // De RÅA raderna; aggregeringen (byMatch) härleds via useMemo nedan (en sanning).
  const [reactions, setReactions] = useState<RoomReaction[]>([]);
  // REALTIDS-INVALIDERING (T18-mönstret): en postgres_changes-signal för rummets
  // reaktioner bumpar den här räknaren, som ligger i load-effektens deps -> en tyst
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

  // FETCH-VAKT (samma mönster som CommentsProvider): ett föråldrat laddnings-svar får
  // aldrig skriva över ett nyare. Bumpas vid VARJE effekt-körning (rum-byte OCH
  // realtids-re-fetch), så bara det SENASTE fetch-svaret vinner.
  const loadTokenRef = useRef(0);
  // SAVE-VAKT: en optimistisk react/remove får bara droppas vid ett RUM-BYTE under
  // await:en (då tillhör svaret fel rum), INTE av en tyst realtids-re-fetch i SAMMA rum.
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  // Vilket rum den NU laddade datan tillhör (null = ingen data än). Skiljer en SYNLIG
  // laddning (initial / rum-byte: visa 'loading') från en TYST re-fetch (realtids-signal:
  // samma rum, behåll datan + 'ready'). Samma mönster som CommentsProvider (T66) /
  // LeaderboardProvider (T55): en signal-triggad re-fetch ska INTE flimra "Laddar...".
  const loadedRoomIdRef = useRef<string | null>(null);

  // Ladda rummets reaktioner (vid rum-byte ELLER realtids-signal). Tom utan rum.
  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      // Inget aktivt rum: nolla, gå till idle (inte loading/error).
      setReactions([]);
      setStatus('idle');
      setError(null);
      loadedRoomIdRef.current = null;
      return;
    }
    // TYST RE-FETCH (T55/T61-valet): en realtids-triggad omhämtning i SAMMA rum vi
    // redan har data för ska INTE flimra 'loading' och tömma brickorna. 'loading' visas
    // bara vid INITIAL hämtning (ingen data än) och RUM-BYTE (datan hör till fel rum).
    const isSilentRefetch = loadedRoomIdRef.current === activeRoomId;
    if (!isSilentRefetch) {
      setStatus('loading');
      setError(null);
    }
    listRoomReactions(supabase, activeRoomId)
      .then((rows) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rum-byte/signal hann starta), kasta tyst
        }
        setReactions(rows);
        setStatus('ready');
        loadedRoomIdRef.current = activeRoomId;
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        // FELVÄG, TYST RE-FETCH (samma val som T55/T66): en realtids-triggad omhämtning
        // som failar får ALDRIG kasta bort de befintliga (giltiga) reaktionerna. Behåll
        // datan + 'ready', logga felet (fail-loud i konsolen). En INITIAL/rum-byte-fetch
        // som failar har ingen data att skydda -> 'error' (fail loud, PRINCIPLES §8).
        if (isSilentRefetch) {
          console.warn(
            '[VM2026] Tyst omhämtning av reaktioner (realtids-signal) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda reaktionerna.');
        setStatus('error');
      });
  }, [supabase, activeRoomId, realtimeNonce]);

  // REALTID (T18, #18): prenumerera på det AKTIVA rummets reaktioner, filtrerat på
  // rummet. En ny/bytt/raderad reaktion skickar en postgres_changes-signal till de
  // andra MEDLEMMARNA (RLS släpper bara rader till rum-medlemmar). Vi merge:ar ALDRIG
  // payloadens rad (härledd state); signalen bumpar bara nonce -> tyst re-fetch genom
  // RLS. Egen kanal ('vm2026-room-reactions') så vi inte krockar med andra lagers
  // kanaler. subscriptionKey = rum-id (rum-byte river + öppnar ny filtrerad).
  useRealtimeSubscription({
    enabled: enabled && activeRoomId !== null,
    client: supabase,
    channelName: 'vm2026-room-reactions',
    subscriptionKey: activeRoomId,
    tables:
      activeRoomId !== null
        ? [{ table: 'room_reactions', filter: `room_id=eq.${activeRoomId}` }]
        : [],
    onChange: () => {
      setRealtimeNonce((n) => n + 1);
    },
  });

  const react = useCallback(
    async (matchId: string, emoji: ReactionEmoji) => {
      // Kontraktet säger "Kastar vid fel". Utan klient ELLER rum finns inget att skriva
      // till: KASTA (fail loud, PRINCIPLES §8) i stället för en tyst no-op. UI:t gatar
      // redan detta (raden renderas bara när store.enabled), så detta nås bara via
      // felaktig wiring, exakt det ett fail-loud-fel ska avslöja.
      if (!supabase) {
        throw new Error(
          '[VM2026] Reagera misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error('[VM2026] Reagera misslyckades: inget aktivt rum att reagera i.');
      }
      // Boka in vilket RUM detta save tillhör (stale-save-vakt).
      const saveRoomId = activeRoomId;
      const saved = await upsertMyReaction(supabase, activeRoomId, matchId, emoji);
      if (saveRoomId !== activeRoomIdRef.current) {
        return; // rum-byte under await: svaret hör inte hemma i det nya rummets vy
      }
      // Optimistiskt: byt ut MIN reaktion på matchen (en per användare+match). Ta bort
      // ev. tidigare egen rad på samma match, lägg in den sparade. Realtids-re-fetchen
      // bekräftar sedan (egna upsert triggar också signalen). Dedupe på PK:n.
      setReactions((prev) => {
        const withoutMineOnMatch = prev.filter(
          (r) => !(r.matchId === matchId && r.userId === saved.userId)
        );
        return [...withoutMineOnMatch, saved];
      });
    },
    [supabase, activeRoomId]
  );

  const removeReaction = useCallback(
    async (matchId: string) => {
      if (!supabase) {
        throw new Error(
          '[VM2026] Ta bort reaktion misslyckades: ingen Supabase-klient (live ej konfigurerat).'
        );
      }
      if (activeRoomId === null) {
        throw new Error('[VM2026] Ta bort reaktion misslyckades: inget aktivt rum att reagera i.');
      }
      await removeMyReaction(supabase, activeRoomId, matchId);
      // Optimistiskt: ta bort MIN rad på matchen lokalt (realtids-signalen bekräftar).
      setReactions((prev) => prev.filter((r) => !(r.matchId === matchId && r.userId === userId)));
    },
    [supabase, activeRoomId, userId]
  );

  // AGGREGERA per match (härledd state, en sanning): räknas om bara när raderna eller
  // min identitet ändras, inte vid varje render.
  const byMatch = useMemo(() => aggregateReactionsByMatch(reactions, userId), [reactions, userId]);

  const store: ReactionsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      byMatch,
      userId,
      react,
      removeReaction,
    }),
    [enabled, status, error, byMatch, userId, react, removeReaction]
  );

  return <ReactionsStoreContext.Provider value={store}>{children}</ReactionsStoreContext.Provider>;
}
