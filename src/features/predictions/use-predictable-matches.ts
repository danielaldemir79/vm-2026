// React-hook som laddar matchplanen + lagen för tipsvyn (T15, #15).
//
// Ansvar (tunt, en sak): hämta den STATISKA matchplanen + lagen via datakällan
// (getDataSource, fixtures-först-seamen) och exponera dem + laddningsstatus. Tipsen
// själva (mina gissningar) lever i PredictionsProvider/-storen; denna hook ger bara
// det STATISKA underlaget (vilka matcher finns, vilka lag). De är skilda: matcherna
// är samma för alla (turneringsdata), tipsen är personliga (per rum, via Supabase).
//
// VARFÖR egen laddning (inte results-storen): tips-sektionen ligger UTANFÖR
// ResultsProvider i appen (den hör till det sociala rums-lagret). Matchplanen är
// statisk och identisk oavsett källa, så vi läser den direkt via datakällan i
// stället för att tvinga in tips-sektionen under results-storen (lägre koppling).

import { useEffect, useState } from 'react';
import { getDataSource } from '../../data';
import type { Match, Team } from '../../domain/types';

/** Laddningstillstånd, explicit (inte bara "data | null"). */
export type PredictableLoadStatus = 'loading' | 'ready' | 'error';

/** Det hooken exponerar: matcher + lag + status. */
export interface PredictableData {
  status: PredictableLoadStatus;
  matches: Match[];
  teams: Team[];
  error: string | null;
}

/**
 * Ladda matchplanen + lagen (en gång). Injicerbar env (default import.meta.env)
 * samma som datalagrets övriga seamar, så datakälle-läget kan testas utan att mocka
 * import.meta globalt. Fel FAIL-LOUD:ar (status 'error' + meddelande), inte tyst tom.
 */
export function usePredictableData(env: ImportMetaEnv = import.meta.env): PredictableData {
  const [status, setStatus] = useState<PredictableLoadStatus>('loading');
  const [matches, setMatches] = useState<Match[]>([]);
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
        setMatches(m);
        setTeams(t);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda matcherna.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [env]);

  return { status, matches, teams, error };
}
