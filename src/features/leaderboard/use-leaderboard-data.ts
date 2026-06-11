// React-hook som laddar facit-källan för topplistan (T17, #17; facit-källa bytt i
// T42, #72): lag + grupper + matchlistan med det GLOBALA officiella facit invävt.
//
// VARFÖR en egen hook (inte useResultsStore): topplista-sektionen renderas
// ALONGSIDE tips-sektionerna (T15/T16), som ligger UTANFÖR ResultsProvider i
// App-trädet. Att kräva ResultsProvider här skulle tvinga en omplacering.
//
// FACIT-KÄLLAN BYTTE I T42 (#72, TÄVLINGSINTEGRITET): tidigare vävdes RUMMETS
// delade resultat (useRoomsSync.sharedResults, per-rum room_match_results) in som
// facit, vilket lät vem som helst i rummet styra poängen. Nu väver vi de GLOBALA
// officiella resultaten (useOfficialResultsSync.officialResults, official_match_
// results, BARA admin kan skriva, RLS-bevisat) , EN sanning för facit, delad av
// alla rum/användare. Själva VÄVNINGEN är OFÖRÄNDRAD (samma rena applyRoomResults,
// official-resultaten är strukturellt samma form som rummets var), bara KÄLLAN
// bytte. derivePoolFacit + TeamCode-kontraktet (id->code, T16 F1) är helt orörda.

import { useEffect, useMemo, useState } from 'react';
import { getDataSource } from '../../data';
import type { Group, Match, Team } from '../../domain/types';
import { useOfficialResultsSync } from '../official-results';
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
  const { officialResults } = useOfficialResultsSync();

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

  // Väv in det GLOBALA officiella facit ovanpå den statiska planen (samma rena
  // funktion ResultsProvider använder). En ändring i officialResults (admin matade
  // in ett resultat) ger en ny facit-källa -> nya poäng, utan en andra kopia av
  // matchlistan. Facit är nu GLOBALT (T42), inte per-rum.
  const matches = useMemo(
    () => applyRoomResults(baseMatches, officialResults),
    [baseMatches, officialResults]
  );

  return { status, teams, groups, matches, error };
}
