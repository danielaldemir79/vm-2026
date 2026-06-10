// React-hook som matar slutspelsträd-vyn och gör trädet LIVE.
//
// Ansvar (tunt, en sak): läsa den DELADE results-storen (matcher = den enda
// sanningen) och HÄRLEDA slutspelsträdets tillstånd (deriveBracket) reaktivt.
// "Live" = när matcherna i storen ändras (en resultatinmatning anropar storens
// submitResult/setMatches) räknas BÅDE grupptabellerna OCH trädet om automatiskt
// via useMemo, inget lagras dubbelt. Exakt samma mönster som useGroupData (T5/T6).
//
// Trädet är en ren funktion av (grupptabeller, matcher). Grupptabellerna härleds
// först (deriveGroupTables, samma sanning som gruppspelsvyn använder), sedan
// matas de + matchlistan in i deriveBracket. Så gruppspelets gång (möjliga lag),
// låsningen vid grupp-slut (seedning) och slutspelsresultaten (vinnar-propagering)
// hänger ihop helt datadrivet.

import { useMemo } from 'react';
import type { DataSourceMode } from '../../data';
import type { Team } from '../../domain/types';
import { useResultsStore } from '../results/results-context';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { deriveBracket, type BracketState } from './derive-bracket';

/** Laddningstillstånd (samma vokabulär som useGroupData). */
export type BracketLoadStatus = 'loading' | 'ready' | 'error';

/** Det hooken exponerar till slutspelsträd-vyn. */
export interface BracketData {
  status: BracketLoadStatus;
  /** Det härledda trädet, tomt (men giltigt) tills status === 'ready'. */
  bracket: BracketState | null;
  /** Lagen, för att slå upp namn/landskod per teamId i vyn. */
  teams: Team[];
  /** Vilken datakälla som är aktiv, så vyn kan visa ett "demo-data"-märke. */
  mode: DataSourceMode;
  /** Felmeddelande vid status === 'error', annars null (fail loud, inte tyst tom). */
  error: string | null;
}

/**
 * Läs slutspelsdata ur den delade storen och härled det live-uppdaterande trädet.
 *
 * MÅSTE användas inuti en <ResultsProvider> (useResultsStore fail-loud:ar
 * annars). Vyn är därmed en ren konsument, env-injektionen sköts av providern.
 */
export function useBracketData(): BracketData {
  const { status, groups, matches, teams, mode, error } = useResultsStore();

  // Härled trädet reaktivt: räknas om bara när grupper, matcher eller status
  // ändras. Det är "live"-mekaniken (en resultatinmatning ändrar matcherna ->
  // ny härledning). Gata på status === 'ready' (samma kontrakt som useGroupData,
  // decisions.md C8): under en laddning/env-byte ligger gamla grupper/matcher
  // kvar i state, och en oavkortad härledning skulle exponera ett STALE träd
  // medan status är loading/error. Så vi släpper bara igenom i ready-läget.
  const bracket = useMemo(() => {
    if (status !== 'ready') {
      return null;
    }
    const tables = deriveGroupTables(groups, matches);
    return deriveBracket(tables, matches);
  }, [status, groups, matches]);

  return { status, bracket, teams, mode, error };
}
