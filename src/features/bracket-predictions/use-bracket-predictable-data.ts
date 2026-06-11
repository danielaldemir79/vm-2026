// React-hook som laddar lagen + matchplanen och HÄRLEDER slutspelsträdet för
// bracket-tips-vyn (T16b, #59). Systerfil till use-group-predictable-data.ts (T16).
//
// Ansvar (tunt): hämta den STATISKA turneringsdatan (grupper, lag, matcher) via
// datakällan (getDataSource, fixtures-först-seamen) och HÄRLEDA slutspelsträdet
// (deriveGroupTables -> deriveBracket, samma kedja som useBracketData/T9) , trädet
// ger slottarnas lag-tillstånd (resolved/possible/tbd), matcherna ger deadline-
// ankaret (slottens egen avspark / g-A-1 för champion). Tipsen själva lever i
// BracketPredictionsProvider.
//
// VARFÖR egen data-laddning (inte useBracketData/results-storen): bracket-tips-vyn
// ska kunna stå fristående under sin egen sektion (rooms-gatad), precis som grupp-
// tips-vyn, utan att kräva att den ligger inuti en ResultsProvider. Vi härleder
// trädet med SAMMA rena funktioner (en sanning för strukturen), bara med en egen
// data-källa-laddning. I appen är båda källorna samma fixtures/live-data.

import { useEffect, useMemo, useState } from 'react';
import { getDataSource } from '../../data';
import type { Match, Team } from '../../domain/types';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { deriveBracket, type BracketState } from '../bracket';

/** Laddningstillstånd, explicit. */
export type BracketPredictableLoadStatus = 'loading' | 'ready' | 'error';

/** Det hooken exponerar: härlett träd + lag + matcher + status. */
export interface BracketPredictableData {
  status: BracketPredictableLoadStatus;
  /** Det härledda slutspelsträdet (eller null tills laddat), ger slottarnas lag. */
  bracket: BracketState | null;
  teams: Team[];
  matches: Match[];
  error: string | null;
}

/**
 * Ladda lag + matchplan + grupper (en gång) och härled trädet. Injicerbar env
 * (default import.meta.env), samma seam som datalagrets övriga. Fel FAIL-LOUD:ar.
 */
export function useBracketPredictableData(
  env: ImportMetaEnv = import.meta.env
): BracketPredictableData {
  const [status, setStatus] = useState<BracketPredictableLoadStatus>('loading');
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  // Grupperna behövs bara för härledningen (tabeller), inte i UI:t, så de hålls lokalt.
  const [groups, setGroups] = useState<Parameters<typeof deriveGroupTables>[0]>([]);
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
        setError(err instanceof Error ? err.message : 'Kunde inte ladda slutspelsträdet.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [env]);

  // Härled trädet reaktivt ur grupper + matcher (samma rena kedja som T9, en
  // sanning för strukturen). Gata på status === 'ready' så ett STALE träd inte
  // härleds ur tomma/halv-laddade listor under laddning (samma kontrakt som
  // useBracketData/decisions.md C8).
  const bracket = useMemo<BracketState | null>(() => {
    if (status !== 'ready') {
      return null;
    }
    const tables = deriveGroupTables(groups, matches);
    return deriveBracket(tables, matches);
  }, [status, groups, matches]);

  return { status, bracket, teams, matches, error };
}
