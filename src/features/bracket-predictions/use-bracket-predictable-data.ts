// React-hook som HÄRLEDER slutspelsträdet för bracket-tips-vyn (T16b, #59).
// Systerfil till use-group-predictable-data.ts (T16).
//
// Ansvar (tunt): ge grupper/lag/matcher till härledningen (deriveGroupTables ->
// deriveBracket, samma kedja som useBracketData/T9) , trädet ger slottarnas lag-
// tillstånd (resolved/possible/tbd), matcherna ger deadline-ankaret (slottens egen
// avspark / g-A-1 för champion). Tipsen själva lever i BracketPredictionsProvider.
//
// DATA-KÄLLA (BUGGFIX 2026-06-28): hooken läser nu I FÖRSTA HAND den delade results-
// storen (useOptionalResultsStore) , SAMMA matcher som slutspelsträdet i Turnering,
// dvs matchplanen MED det officiella facit invävt. Tidigare laddade hooken den RÅA
// matchplanen via getDataSource (utan resultat), så när gruppspelet väl var avgjort
// seedades tips-trädet ALDRIG (alla matcher såg 'scheduled' ut -> isGroupStageComplete
// false) och slot-tipsen förblev stängda ("Lagen avgörs av tidigare resultat") trots
// att facit var komplett och TRÄDET seedats korrekt. Roten: getDataSource (supabase-
// client.ts) bär den STATISKA planen i BÅDE fixtures och live; facit vävs in i storen,
// inte i datakällan. Bracket-tips-sektionen ligger alltid inuti ResultsProvider i appen,
// så storen finns. FALLBACK (getDataSource) behålls för fristående render (utan en
// ResultsProvider, t.ex. enhetstester): då finns inget facit ändå, så råa planen duger.

import { useEffect, useMemo, useState } from 'react';
import { getDataSource } from '../../data';
import type { Match, Team } from '../../domain/types';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { deriveBracket, type BracketState } from '../bracket';
import { useOptionalResultsStore } from '../results/results-context';

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
  // FÖRSTAHANDSKÄLLA: den delade results-storen (samma invävda facit som trädet i
  // Turnering). Tolerant hook -> null när ingen ResultsProvider finns (fristående/test),
  // då används fallback-laddningen nedan.
  const store = useOptionalResultsStore();

  // FALLBACK-laddning via datakällan (RÅ matchplan), BARA när storen saknas. I appen
  // finns storen alltid (bracket-tips ligger inuti ResultsProvider), så denna vilar då.
  const [status, setStatus] = useState<BracketPredictableLoadStatus>('loading');
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groups, setGroups] = useState<Parameters<typeof deriveGroupTables>[0]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (store) {
      return; // storen är källan -> ingen egen laddning behövs
    }
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
  }, [env, store]);

  // Välj källa: storen (matcher MED invävt facit) om den finns, annars fallback-laddningen.
  // En sanning för bracket-tips-trädet: i appen är detta exakt samma matcher som Turnering-
  // trädet seedas ur, så tipsen öppnas i samma stund trädet får sina riktiga lag.
  const effStatus: BracketPredictableLoadStatus = store ? store.status : status;
  const effGroups = store ? store.groups : groups;
  const effMatches = store ? store.matches : matches;
  const effTeams = store ? store.teams : teams;
  const effError = store ? store.error : error;

  // Härled trädet reaktivt ur grupper + matcher (samma rena kedja som T9, en sanning
  // för strukturen). Gata på status === 'ready' så ett STALE träd inte härleds ur
  // tomma/halv-laddade listor under laddning (samma kontrakt som useBracketData).
  const bracket = useMemo<BracketState | null>(() => {
    if (effStatus !== 'ready') {
      return null;
    }
    const tables = deriveGroupTables(effGroups, effMatches);
    return deriveBracket(tables, effMatches);
  }, [effStatus, effGroups, effMatches]);

  return { status: effStatus, bracket, teams: effTeams, matches: effMatches, error: effError };
}
