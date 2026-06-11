// React-hook som laddar facit-källan för topplistan (T17, #17): lag + grupper +
// den DELADE matchlistan (rummets resultat vävda ovanpå den statiska planen).
//
// VARFÖR en egen hook (inte useResultsStore): topplista-sektionen renderas
// ALONGSIDE tips-sektionerna (T15/T16), som ligger UTANFÖR ResultsProvider i
// App-trädet. Att kräva ResultsProvider här skulle tvinga en omplacering. I stället
// väver vi rummets delade resultat (useRoomsSync.sharedResults, tillgängligt var
// som helst i RoomsProvider) ovanpå den statiska planen med EXAKT samma rena
// funktion ResultsProvider använder (applyRoomResults), så facit blir IDENTISKT,
// EN sanning för hur ett delat resultat blir en match, ingen ny vävning uppfunnen.

import { useEffect, useMemo, useState } from 'react';
import { getDataSource } from '../../data';
import type { Group, Match, Team } from '../../domain/types';
import { useRoomsSync } from '../rooms';
import { applyRoomResults } from '../results';

/** Laddningstillstånd för den statiska turneringsdatan. */
export type LeaderboardDataStatus = 'loading' | 'ready' | 'error';

/** Det hooken exponerar: lag + grupper + den DELADE (vävda) matchlistan + status. */
export interface LeaderboardData {
  status: LeaderboardDataStatus;
  teams: Team[];
  groups: Group[];
  /** Matchlistan med rummets delade resultat invävda (facit-källan). */
  matches: Match[];
  error: string | null;
}

/**
 * Ladda lag + grupper + matchplan (en gång), och VÄV in rummets delade resultat
 * ovanpå matcherna (facit-källan för poäng-aggregeringen). Injicerbar env (default
 * import.meta.env), samma seam som datalagrets övriga. Fel FAIL-LOUD:ar.
 */
export function useLeaderboardData(env: ImportMetaEnv = import.meta.env): LeaderboardData {
  const { sharedResults } = useRoomsSync();

  const [status, setStatus] = useState<LeaderboardDataStatus>('loading');
  const [teams, setTeams] = useState<Team[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [baseMatches, setBaseMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    const ds = getDataSource(env);
    Promise.all([ds.getTeams(), ds.getGroups(), ds.getMatches()])
      .then(([t, g, m]) => {
        if (cancelled) {
          return;
        }
        setTeams(t);
        setGroups(g);
        setBaseMatches(m);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda turneringsdatan.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [env]);

  // Väv in rummets delade resultat ovanpå den statiska planen (samma rena funktion
  // som ResultsProvider). En ändring i sharedResults ger en ny facit-källa -> nya
  // poäng, utan en andra kopia av matchlistan.
  const matches = useMemo(
    () => applyRoomResults(baseMatches, sharedResults),
    [baseMatches, sharedResults]
  );

  return { status, teams, groups, matches, error };
}
