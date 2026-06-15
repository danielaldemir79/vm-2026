// Provider för den GLOBALA (cross-rum) topplistan (T82 del 3, #173; RÄTTVIS + helt global
// server-side i T90, #183).
//
// MILJÖ-GATAD (fixtures-först, lessons + decisions.md T82 del 3 / T90):
//   * DEMO/fixtures-läge (Supabase ej konfigurerat): bygg RoomContribution[] ur den
//     deterministiska demo-fixturuppsättningen (botar, demo-total-fixtures) och kör den
//     RÄTTVISA aggregeringen (buildTotalLeaderboard, bästa rum) lokalt. ~240 deltagare.
//     currentUserId = demo-spelaren.
//   * LIVE-läge (Supabase konfigurerat + LIVE_READY): anropa edge-funktionen
//     (loadGlobalLeaderboard) som server-side poängsätter ALLA rum med SAMMA TS-motor och
//     returnerar de färdiga, RÄTTVISA, säkra raderna (visningsnamn/poäng/rank/exakt , inga
//     råa tips). currentUserId = rooms.userId.
//
// VARFÖR EDGE-FUNKTION I LIVE (T90, ägarens fusk-/privacy-fix): den gamla vägen laddade
// bara den inloggades EGNA rum (loadRoomContributions(myRooms)) -> "Global" visade ~54 av
// 200+, OCH summerade poäng över rum (fler rum = fusk). Den nya vägen rangordnar ALLA i
// ALLA rum, RÄTTVIST (bästa rum per deltagare), server-side så ingens tips läcker. Demo +
// live delar EXAKT samma rättvise-regel (buildTotalLeaderboard / buildGlobalLeaderboard kör
// samma aggregering), bevisat med paritets-/ekvivalens-test.
//
// EGEN PROVIDER (inte en utökning av T17:s LeaderboardProvider): per-rums-vyn laddar
// bara det AKTIVA rummet; totalen behöver ALLA rum. En egen provider håller T17 orörd.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { loadGlobalLeaderboard } from '../../data/global-leaderboard';
import { useRoomsStore } from '../rooms';
import {
  buildTotalLeaderboard,
  deriveTotalSelfSummary,
  type TotalLeaderboardEntry,
} from './aggregate-total';
import { buildDemoTotalContributions } from './demo-total-fixtures';
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

/** Status för den LIVE-hämtade globala listan (edge-funktionssvaret). */
type LiveStatus = 'idle' | 'loading' | 'ready' | 'error';

export function TotalLeaderboardProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
}: TotalLeaderboardProviderProps) {
  const rooms = useRoomsStore();
  const liveConfigured = isSupabaseConfigured(env) && liveReady;

  // DEMO: bygg den RÄTTVISA totalen lokalt ur fixtures (deterministiskt, EN gång). Bara i
  // demo-läge; i live-läge är den oanvänd. useMemo med tom dep = stabil.
  const demo = useMemo(() => buildDemoTotalContributions(), []);
  const demoTotal = useMemo(() => buildTotalLeaderboard(demo.rooms, demo.facit), [demo]);

  // LIVE: den server-byggda, rättvisa, säkra listan (edge-funktionen). EPOCH-vakt (samma
  // mönster som T17): ett föråldrat svar får aldrig visa fel lista.
  const [liveTotal, setLiveTotal] = useState<TotalLeaderboardEntry[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
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

  // Stabil nyckel för rumslistan (id:n) , re-hämta den globala listan när den inloggades
  // rum ändras (gick med / lämnade), så hens egen rad + "hoppa till mig" hålls aktuella.
  // (Listan i sig är global och oberoende av VILKA rum man är med i, men en ny medlems-rad
  // kan ha tillkommit, och vi vill att hjälten hittar rätt rad efter en join.)
  const roomIdsKey = rooms.myRooms.map((r) => r.id).join(',');

  useEffect(() => {
    if (!liveConfigured) {
      return; // demo-läge: ingen live-hämtning
    }
    const token = ++loadTokenRef.current;
    if (supabase === null) {
      setLiveTotal([]);
      setLiveStatus('ready');
      setLiveError(null);
      return;
    }
    setLiveStatus('loading');
    setLiveError(null);
    loadGlobalLeaderboard(supabase)
      .then((entries) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar, kasta tyst
        }
        setLiveTotal(entries);
        setLiveStatus('ready');
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        setLiveError(
          err instanceof Error ? err.message : 'Kunde inte ladda den globala topplistan.'
        );
        setLiveStatus('error');
      });
    // roomIdsKey i deps: re-hämta när rumslistan ändras.
  }, [liveConfigured, supabase, roomIdsKey]);

  // Välj källa: demo (lokalt byggd) eller live (server-byggd). I BÅDA fall är raderna samma
  // form (userId/displayName/points/rank/exactHits) och bär den RÄTTVISA modellen.
  const total: readonly TotalLeaderboardEntry[] = liveConfigured ? liveTotal : demoTotal;
  const currentUserId = liveConfigured ? rooms.userId : demo.currentUserId;

  const selfSummary = useMemo(
    () => deriveTotalSelfSummary(total, currentUserId),
    [total, currentUserId]
  );

  // Status. Demo: alltid 'ready' (fixtures finns synkront). Live: speglar edge-hämtningen.
  const status: TotalLeaderboardStatus = liveConfigured ? liveStatus : 'ready';

  // Aktiv när det finns en total att visa: demo har alltid det; live när vi är ready.
  const enabled = !liveConfigured || (liveConfigured && total.length > 0);
  const error = liveConfigured ? liveError : null;

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
