// React-hook som laddar admin-statistiken (T45, #76): per-rum-stat + avslöjade tips
// (de två admin-RPC:erna) kombinerat med det PUBLIKA globala facit, och härleder
// överblicken via den rena deriveAdminStats.
//
// ANSVAR: I/O + state (ladda de två RPC:erna, väv med facit-datan). Logiken bor i
// deriveAdminStats (ren, testbar). Hooken speglar samma form som de andra live-
// hooksen (status 'loading'|'ready'|'error', fail-loud, cancelled-flagga).
//
// SÄKERHET: RPC:erna är server-gatade (is_app_admin) , en icke-admin får tom data.
// Hooken anropas ändå bara ur admin-vyn (bakom official.isAdmin), så det är dubbel
// gating (UI + server), men servern är det RIKTIGA skyddet (en kringgången klient
// får tomt, inte allas data).

import { useEffect, useMemo, useState } from 'react';
import { fetchAdminRoomStats, fetchAdminRevealedPredictions } from '../../data/admin';
import type { AdminRoomStat, AdminRevealedPrediction } from '../../data/admin';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import { useLeaderboardData } from '../leaderboard/use-leaderboard-data';
import { deriveAdminStats, type AdminStatsOverview } from './derive-admin-stats';

/** Laddningstillstånd för admin-statistiken. */
export type AdminStatsStatus = 'loading' | 'ready' | 'error';

/** Det hooken exponerar: status + den härledda överblicken + ev. fel. */
export interface AdminStatsResult {
  status: AdminStatsStatus;
  overview: AdminStatsOverview | null;
  error: string | null;
}

const EMPTY_ROOM_STATS: AdminRoomStat[] = [];
const EMPTY_REVEALED: AdminRevealedPrediction[] = [];

/**
 * Ladda admin-statistiken: de två RPC:erna (rum-stat + avslöjade tips) + facit-datan
 * (lag/grupper/matcher med globala facit invävt), och härled överblicken.
 *
 * @param client  den typade Supabase-klienten (admin-sessionen, ur official-storen).
 * @param env     injicerbar env (testbarhet), default = import.meta.env.
 */
export function useAdminStats(
  client: VmSupabaseClient | null,
  env: ImportMetaEnv = import.meta.env
): AdminStatsResult {
  const data = useLeaderboardData(env);

  const [rpcStatus, setRpcStatus] = useState<AdminStatsStatus>('loading');
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [roomStats, setRoomStats] = useState<AdminRoomStat[]>(EMPTY_ROOM_STATS);
  const [revealed, setRevealed] = useState<AdminRevealedPrediction[]>(EMPTY_REVEALED);

  useEffect(() => {
    if (!client) {
      // Ingen klient (fixtures/lokal utveckling): vilande, inget fel.
      setRoomStats(EMPTY_ROOM_STATS);
      setRevealed(EMPTY_REVEALED);
      setRpcStatus('ready');
      setRpcError(null);
      return;
    }
    let cancelled = false;
    setRpcStatus('loading');
    setRpcError(null);
    Promise.all([fetchAdminRoomStats(client), fetchAdminRevealedPredictions(client)])
      .then(([stats, reveal]) => {
        if (cancelled) {
          return;
        }
        setRoomStats(stats);
        setRevealed(reveal);
        setRpcStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setRpcError(err instanceof Error ? err.message : 'Kunde inte ladda admin-statistiken.');
        setRpcStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  // VÄVD status: 'ready' först när BÅDE facit-datan OCH RPC:erna laddat. Endera felet
  // fail-loud:ar (PRINCIPLES §8), ingen tyst tom vy.
  const status: AdminStatsStatus = useMemo(() => {
    if (data.status === 'error' || rpcStatus === 'error') {
      return 'error';
    }
    if (data.status === 'ready' && rpcStatus === 'ready') {
      return 'ready';
    }
    return 'loading';
  }, [data.status, rpcStatus]);

  const error = data.error ?? rpcError;

  const overview = useMemo<AdminStatsOverview | null>(() => {
    if (status !== 'ready') {
      return null;
    }
    return deriveAdminStats(roomStats, revealed, data.teams, data.groups, data.matches);
  }, [status, roomStats, revealed, data.teams, data.groups, data.matches]);

  return { status, overview, error };
}
