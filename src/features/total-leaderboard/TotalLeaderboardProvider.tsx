// Provider för den TOTALA (cross-rum) topplistan (T82 del 3, #173).
//
// MILJÖ-GATAD (fixtures-först, lessons + decisions.md T82 del 3):
//   * DEMO/fixtures-läge (Supabase ej konfigurerat): bygg RoomContribution[] ur den
//     deterministiska demo-fixturuppsättningen (botar, demo-total-fixtures) så totalen
//     ser FYLLD ut direkt (~240 deltagare). currentUserId = demo-spelaren.
//   * LIVE-läge (Supabase konfigurerat + LIVE_READY): hämta per-rums-tips för ALLA
//     myRooms (loadRoomContributions) och bygg samma RoomContribution[]. currentUserId
//     = rooms.userId.
// Samma aggregering (buildTotalLeaderboard) + samma RoomContribution-form i BÅDA lägen,
// så live tänds utan aggregerings-ändring (en sanning).
//
// EGEN PROVIDER (inte en utökning av T17:s LeaderboardProvider): per-rums-vyn laddar
// bara det AKTIVA rummet; totalen behöver ALLA rum. En egen provider håller T17 orörd.
//
// FACIT-KÄLLAN: det DELADE, globala facit (useLeaderboardData -> derivePoolFacit), exakt
// som per-rums-topplistan. En sanning för facit över alla rum/vyer.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsStore } from '../rooms';
import { useLeaderboardData } from '../leaderboard/use-leaderboard-data';
import { derivePoolFacit, type PoolFacit } from '../leaderboard';
import {
  buildTotalLeaderboard,
  deriveTotalSelfSummary,
  type RoomContribution,
} from './aggregate-total';
import { buildDemoTotalContributions } from './demo-total-fixtures';
import { loadRoomContributions } from './load-room-contributions';
import {
  TotalLeaderboardStoreContext,
  type TotalLeaderboardStatus,
  type TotalLeaderboardStore,
} from './total-leaderboard-context';

export interface TotalLeaderboardProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
}

/** Status för den LIVE-hämtade rums-bidrags-listan (vävs med facit-statusen nedan). */
type ContributionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export function TotalLeaderboardProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
}: TotalLeaderboardProviderProps) {
  const rooms = useRoomsStore();
  const data = useLeaderboardData(env);
  const liveConfigured = isSupabaseConfigured(env) && liveReady;

  // DEMO-bidragen byggs EN gång (deterministiskt, tungt nog att inte vilja upprepa varje
  // render). Bara i demo-läge; i live-läge är de oanvända. useMemo med tom dep = stabil.
  const demo = useMemo(() => buildDemoTotalContributions(), []);

  // LIVE: hämta alla myRooms bidrag. EPOCH-vakt (samma mönster som T17): en ändrad
  // rumslista får aldrig låta ett föråldrat svar visa fel total.
  const [liveContributions, setLiveContributions] = useState<RoomContribution[]>([]);
  const [contributionsStatus, setContributionsStatus] = useState<ContributionsStatus>('idle');
  const [contributionsError, setContributionsError] = useState<string | null>(null);
  const loadTokenRef = useRef(0);

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!liveConfigured) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, liveConfigured, env]);

  // Stabil nyckel för rumslistan (id:n), så effekten bara kör om när rummen FAKTISKT
  // ändras, inte på varje ny array-referens.
  const roomIdsKey = rooms.myRooms.map((r) => r.id).join(',');

  useEffect(() => {
    if (!liveConfigured) {
      return; // demo-läge: ingen live-hämtning
    }
    const token = ++loadTokenRef.current;
    if (supabase === null || rooms.myRooms.length === 0) {
      setLiveContributions([]);
      setContributionsStatus('ready'); // tom total är ett giltigt läge (inga rum än)
      setContributionsError(null);
      return;
    }
    setContributionsStatus('loading');
    setContributionsError(null);
    loadRoomContributions(supabase, rooms.myRooms)
      .then((contributions) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar, kasta tyst
        }
        setLiveContributions(contributions);
        setContributionsStatus('ready');
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        setContributionsError(
          err instanceof Error ? err.message : 'Kunde inte ladda den totala topplistan.'
        );
        setContributionsStatus('error');
      });
    // roomIdsKey i deps: re-hämta när rumslistan ändras (gick med / lämnade ett rum).
  }, [liveConfigured, supabase, roomIdsKey, rooms.myRooms]);

  // Det DELADE facit (live väver in det globala officiella facit; demo använder demos
  // egna facit). Live-vägen poängsätter alla rum mot SAMMA facit (en sanning).
  const liveFacit: PoolFacit = useMemo(
    () => derivePoolFacit(data.teams, data.groups, data.matches),
    [data.teams, data.groups, data.matches]
  );

  // Välj källa: demo eller live. Bygg den totala topplistan + spelarens sammanfattning.
  const { total, currentUserId } = useMemo(() => {
    if (!liveConfigured) {
      return {
        total: buildTotalLeaderboard(demo.rooms, demo.facit),
        currentUserId: demo.currentUserId,
      };
    }
    return {
      total: buildTotalLeaderboard(liveContributions, liveFacit),
      currentUserId: rooms.userId,
    };
  }, [liveConfigured, demo, liveContributions, liveFacit, rooms.userId]);

  const selfSummary = useMemo(
    () => deriveTotalSelfSummary(total, currentUserId),
    [total, currentUserId]
  );

  // VÄVD status. Demo: alltid 'ready' (fixtures finns synkront). Live: 'ready' först när
  // BÅDE facit-datan OCH rums-bidragen laddat; fel från endera fail-loud:ar.
  const status: TotalLeaderboardStatus = useMemo(() => {
    if (!liveConfigured) {
      return 'ready';
    }
    if (data.status === 'error' || contributionsStatus === 'error') {
      return 'error';
    }
    if (data.status === 'ready' && contributionsStatus === 'ready') {
      return 'ready';
    }
    return 'loading';
  }, [liveConfigured, data.status, contributionsStatus]);

  // Aktiv när det finns en total att visa: demo har alltid det; live när vi är ready.
  const enabled = !liveConfigured || (liveConfigured && total.length > 0);
  const error = liveConfigured ? (data.error ?? contributionsError) : null;

  const store: TotalLeaderboardStore = useMemo(
    () => ({ enabled, status, error, total, selfSummary, currentUserId }),
    [enabled, status, error, total, selfSummary, currentUserId]
  );

  return (
    <TotalLeaderboardStoreContext.Provider value={store}>
      {children}
    </TotalLeaderboardStoreContext.Provider>
  );
}
