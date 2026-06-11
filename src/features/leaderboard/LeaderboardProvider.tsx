// Provider för topplista + tips-avslöjande (T17, #17).
//
// Systerfil till tips-stores (T15/T16), men LÄS-ONLY: T17 skriver inga tips, den
// AGGREGERAR de befintliga. ANSVAR: ladda rummets RLS-synliga tips (alla tre typer,
// listRoom*-API:erna), läsa det delade facit (lag/grupper/matcher ur
// useLeaderboardData, som väver in rummets delade resultat) + medlemmarna, och bygga
// den rangordnade topplistan + avslöjande-vyn via de RENA modulerna
// (aggregate-scores / derive-facit / reveal).
//
// SÄKERHET ÄR SERVER-SIDE: sekretessen (andras tips dolda före deadline) bor i RLS
// (bevisat i T15/T16). listRoom*-API:erna returnerar BARA RLS-synliga rader (egna +
// redan avslöjade), så aggregeringen kan strukturellt bara se det som får ses. Den
// här provider:n förlitar sig aldrig på en klient-gate för sekretessen.
//
// EPOCH-vakt (samma mönster som tips-stores): ett snabbt rumsbyte får aldrig låta
// ett föråldrat svar visa fel rums topplista.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  listRoomPredictions,
  listRoomGroupPredictions,
  listRoomBracketPredictions,
  type Prediction,
  type GroupPrediction,
  type BracketPrediction,
} from '../../data/predictions';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsStore } from '../rooms';
import { useDeadlineTick } from '../predictions/use-deadline-tick';
import { useLeaderboardData } from './use-leaderboard-data';
import { derivePoolFacit } from './derive-facit';
import { buildLeaderboard, type MemberPredictions } from './aggregate-scores';
import { buildMatchReveal } from './reveal';
import {
  LeaderboardStoreContext,
  type LeaderboardStatus,
  type LeaderboardStore,
} from './leaderboard-context';

/** Rummets RLS-synliga tips (alla tre typer), råladdade per rum. */
interface RoomPredictions {
  match: Prediction[];
  group: GroupPrediction[];
  bracket: BracketPrediction[];
}

const EMPTY_PREDICTIONS: RoomPredictions = { match: [], group: [], bracket: [] };

/** Inre laddningstillstånd bara för tips-laddningen (vävs med data-statusen nedan). */
type PredictionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LeaderboardProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
  /** Injicerbart aktivt rum-id (testbarhet). Default = rooms-storen. */
  activeRoomId?: string | null;
  /** Injicerbart "nu" (testbarhet) för avslöjande-gaten, default = nuet (minut-tick). */
  now?: Date;
}

export function LeaderboardProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
  now,
}: LeaderboardProviderProps) {
  const rooms = useRoomsStore();
  const data = useLeaderboardData(env);
  const activeRoomId =
    activeRoomIdProp !== undefined ? activeRoomIdProp : (rooms.activeRoom?.id ?? null);

  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  const enabled = liveConfigured && activeRoomId !== null;

  const [predictionsStatus, setPredictionsStatus] = useState<PredictionsStatus>('idle');
  const [predictionsError, setPredictionsError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<RoomPredictions>(EMPTY_PREDICTIONS);

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!liveConfigured) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, liveConfigured, env]);

  // Avslöjande-gaten räknas om varje minut (samma minut-tick som tipsvyerna), så en
  // match som låses (avspark passeras) dyker upp i avslöjandet utan omladdning.
  const evalNow = useDeadlineTick(now ?? new Date());

  // EPOCH-vakt: ett snabbt rumsbyte får aldrig låta ett föråldrat svar visa fel rum.
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      setPredictions(EMPTY_PREDICTIONS);
      setPredictionsStatus('idle');
      setPredictionsError(null);
      return;
    }
    setPredictionsStatus('loading');
    setPredictionsError(null);
    // Ladda rummets RLS-synliga tips för ALLA tre typer parallellt. RLS gör att vi
    // bara får egna + redan-avslöjade rader (sekretessen är server-side).
    Promise.all([
      listRoomPredictions(supabase, activeRoomId),
      listRoomGroupPredictions(supabase, activeRoomId),
      listRoomBracketPredictions(supabase, activeRoomId),
    ])
      .then(([match, group, bracket]) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rumsbyte hann starta), kasta tyst
        }
        setPredictions({ match, group, bracket });
        setPredictionsStatus('ready');
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        setPredictionsError(err instanceof Error ? err.message : 'Kunde inte ladda topplistan.');
        setPredictionsStatus('error');
      });
  }, [supabase, activeRoomId]);

  // VÄVD status: topplistan är 'ready' först när BÅDE facit-datan OCH tipsen laddat.
  // Felet från endera lagret fail-loud:ar. Idle/loading speglas så vyn visar laddning.
  const status: LeaderboardStatus = useMemo(() => {
    if (data.status === 'error' || predictionsStatus === 'error') {
      return 'error';
    }
    if (!enabled) {
      return 'idle';
    }
    if (data.status === 'ready' && predictionsStatus === 'ready') {
      return 'ready';
    }
    return 'loading';
  }, [data.status, predictionsStatus, enabled]);

  const error = data.error ?? predictionsError;

  // Härled facit ur den DELADE matchlistan (rummets resultat redan invävda).
  const facit = useMemo(
    () => derivePoolFacit(data.teams, data.groups, data.matches),
    [data.teams, data.groups, data.matches]
  );

  // Gruppera tipsen per medlem (userId) för aggregeringen.
  const predictionsByUser = useMemo(() => {
    const byUser = new Map<string, MemberPredictions>();
    const ensure = (userId: string): MemberPredictions => {
      let entry = byUser.get(userId);
      if (!entry) {
        entry = { userId, matchPredictions: [], groupPredictions: [], bracketPredictions: [] };
        byUser.set(userId, entry);
      }
      return entry;
    };
    for (const p of predictions.match) {
      (ensure(p.userId).matchPredictions as Prediction[]).push(p);
    }
    for (const p of predictions.group) {
      (ensure(p.userId).groupPredictions as GroupPrediction[]).push(p);
    }
    for (const p of predictions.bracket) {
      (ensure(p.userId).bracketPredictions as BracketPrediction[]).push(p);
    }
    return byUser;
  }, [predictions]);

  // Bygg topplistan (alla medlemmar, även de utan tips -> 0p, med i listan).
  const leaderboard = useMemo(
    () => buildLeaderboard(rooms.members, predictionsByUser, facit),
    [rooms.members, predictionsByUser, facit]
  );

  // Bygg avslöjandet (per avgjord+låst match), med medlemmarnas namn.
  const reveal = useMemo(() => {
    const names = new Map(rooms.members.map((m) => [m.userId, m.displayName]));
    return buildMatchReveal(data.matches, facit.matches, predictions.match, names, evalNow);
  }, [rooms.members, data.matches, facit.matches, predictions.match, evalNow]);

  const store: LeaderboardStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      activeRoomId,
      leaderboard,
      reveal,
      teams: data.teams,
    }),
    [enabled, status, error, activeRoomId, leaderboard, reveal, data.teams]
  );

  return (
    <LeaderboardStoreContext.Provider value={store}>{children}</LeaderboardStoreContext.Provider>
  );
}
