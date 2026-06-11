// Hook som laddar matchlistan + lagen för admin-facit-inmatningen (T42, #72).
//
// ANSVAR: ladda den statiska matchplanen + lagen EN gång (via samma getDataSource-
// seam som resten av appen), och VÄVA in det GLOBALA officiella facit ovanpå (samma
// rena applyRoomResults), så admin ser de NUVARANDE officiella resultaten och kan
// redigera dem. Lag-namns-uppslaget byggs ur lag-listan (för en läsbar match-etikett).
//
// VARFÖR en egen liten hook (inte useResultsStore): admin-sektionen ligger UTANFÖR
// ResultsProvider i App-trädet (alongside topplistan), samma skäl som
// useLeaderboardData. Vi laddar därför basplanen själva och väver in officialResults.

import { useEffect, useMemo, useState } from 'react';
import { getDataSource } from '../../data';
import type { Match, Team } from '../../domain/types';
import { applyRoomResults } from '../results';
import { useOfficialResultsSync } from '../official-results';

export type AdminMatchesStatus = 'loading' | 'ready' | 'error';

export interface AdminMatchesData {
  status: AdminMatchesStatus;
  /** Matchplanen med det globala officiella facit invävt (admin redigerar detta). */
  matches: Match[];
  /** Uppslag Team.id -> visningsnamn (för en läsbar match-etikett). */
  teamName: (id: string | null) => string;
  error: string | null;
}

export function useAdminMatches(env: ImportMetaEnv = import.meta.env): AdminMatchesData {
  const { officialResults } = useOfficialResultsSync();
  const [status, setStatus] = useState<AdminMatchesStatus>('loading');
  const [baseMatches, setBaseMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    const ds = getDataSource(env);
    Promise.all([ds.getMatches(), ds.getTeams()])
      .then(([m, t]) => {
        if (cancelled) {
          return;
        }
        setBaseMatches(m);
        setTeams(t);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda matchplanen.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [env]);

  const matches = useMemo(
    () => applyRoomResults(baseMatches, officialResults),
    [baseMatches, officialResults]
  );

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) {
      map.set(t.id, t.name);
    }
    return map;
  }, [teams]);

  const teamName = useMemo(
    () => (id: string | null) => (id ? (nameById.get(id) ?? id) : 'TBD'),
    [nameById]
  );

  return { status, matches, teamName, error };
}
