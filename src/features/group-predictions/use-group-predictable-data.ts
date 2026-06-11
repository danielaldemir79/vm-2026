// React-hook som laddar grupperna + lagen + matchplanen för grupp-tips-vyn
// (T16, #16). Systerfil till use-predictable-matches.ts (T15).
//
// Ansvar (tunt): hämta den STATISKA turneringsdatan (grupper, lag, matcher) via
// datakällan (getDataSource, fixtures-först-seamen) och exponera den + status.
// Grupperna ger 1:a/2:a-väljarnas alternativ, matcherna ger deadline-ankaret
// (gruppens första match g-X-1). Tipsen själva lever i GroupPredictionsProvider.

import { useEffect, useState } from 'react';
import { getDataSource } from '../../data';
import type { Group, Match, Team } from '../../domain/types';

/** Laddningstillstånd, explicit. */
export type GroupPredictableLoadStatus = 'loading' | 'ready' | 'error';

/** Det hooken exponerar: grupper + lag + matcher + status. */
export interface GroupPredictableData {
  status: GroupPredictableLoadStatus;
  groups: Group[];
  teams: Team[];
  matches: Match[];
  error: string | null;
}

/**
 * Ladda grupper + lag + matchplan (en gång). Injicerbar env (default
 * import.meta.env), samma seam som datalagrets övriga. Fel FAIL-LOUD:ar.
 */
export function useGroupPredictableData(
  env: ImportMetaEnv = import.meta.env
): GroupPredictableData {
  const [status, setStatus] = useState<GroupPredictableLoadStatus>('loading');
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    const ds = getDataSource(env);
    Promise.all([ds.getGroups(), ds.getTeams(), ds.getMatches()])
      .then(([g, t, m]) => {
        if (cancelled) {
          return;
        }
        setGroups(g);
        setTeams(t);
        setMatches(m);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda grupperna.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [env]);

  return { status, groups, teams, matches, error };
}
