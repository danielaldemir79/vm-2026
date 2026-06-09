// React-hook som matar gruppspelsvyn med data och gör tabellerna LIVE.
//
// Ansvar (tunt, en sak): läsa den DELADE results-storen (matcher = den enda
// sanningen) och HÄRLEDA grupptabellerna (deriveGroupTables) reaktivt. "Live" =
// när matcherna i storen ändras (en resultatinmatning i T6 anropar storens
// submitResult/setMatches) räknas tabellerna om automatiskt via useMemo, ingen
// tabell lagras dubbelt.
//
// ÄNDRING I T6 (arkitektur): FÖRR ägde denna hook matchlistan i lokal vy-state
// och seedade den själv. T6 LYFTE matchlistan till ResultsProvider (en delad
// källa) så att resultatinmatnings-UI:t och gruppspelsvyn delar EXAKT samma
// matcher, en inmatning uppdaterar tabellerna. Hooken är nu en tunn KONSUMENT av
// storen: den läser status/matcher/lag därifrån och äger bara HÄRLEDNINGEN av
// tabeller (sin enda kvarvarande egna logik). GroupData-kontraktet utåt är
// oförändrat (status/tables/teams/mode/error/setMatches), så vyn och dess tester
// står still, bara sanningens hemvist flyttade upp.
//
// VARFÖR matcher i storen men tabeller härledda: matchresultaten är den enda
// sanningen (SPEC §6). Tabellen är en ren funktion av dem, så att lagra tabellen
// vore dubbellagring som kan driva isär. useMemo gör om-beräkningen reaktiv utan
// en extra state-kopia.

import { useMemo } from 'react';
import type { DataSourceMode } from '../../data';
import type { GroupTable, Match, Team } from '../../domain/types';
import { useResultsStore } from '../results/results-context';
import { deriveGroupTables } from './derive-group-tables';

/** Laddningstillstånd för en async datahämtning, explicit (inte bara "data | null"). */
export type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Det hooken exponerar till gruppspelsvyn. Vid 'ready' bär den härledda
 * tabeller + lagen (för namn/koder i UI:t); vid 'error' ett begripligt
 * felmeddelande (fail loud, inte en tyst tom vy).
 */
export interface GroupData {
  status: LoadStatus;
  /** Härledda grupptabeller (A-L), tomt tills status === 'ready'. */
  tables: GroupTable[];
  /** Lagen, för att slå upp namn/landskod per teamId i vyn. */
  teams: Team[];
  /** Vilken datakälla som är aktiv, så vyn kan visa ett "demo-data"-märke. */
  mode: DataSourceMode;
  /** Felmeddelande vid status === 'error', annars null. */
  error: string | null;
  /**
   * Ersätt matchlistan i den delade storen (lågnivå-seam, T18:s realtid + tester
   * använder det). Resultatinmatnings-UI:t använder hellre storens submitResult.
   * Kvar i GroupData-kontraktet så befintliga konsumenter/tester står still.
   */
  setMatches: (matches: Match[]) => void;
}

/**
 * Läs gruppspelsdata ur den delade storen och härled live-tabeller.
 *
 * MÅSTE användas inuti en <ResultsProvider> (useResultsStore fail-loud:ar
 * annars). Env-injektionen som T5 hade flyttade till providern (den äger
 * seedningen nu), så hooken tar inga argument längre.
 */
export function useGroupData(): GroupData {
  const { status, groups, matches, teams, mode, error, setMatches } = useResultsStore();

  // Härled tabellerna reaktivt: räknas om bara när grupper, matcher eller status
  // ändras. Det är "live"-mekaniken, en resultatinmatning (submitResult) ändrar
  // matcherna i storen och triggar en ny härledning.
  //
  // VARFÖR gata på status: GroupData-kontraktet säger att tables är tomt tills
  // status === 'ready'. Vid en initial laddning (eller env-byte i providern)
  // ligger gamla groups/matches kvar i state tills den nya hämtningen settlar,
  // och en oavkortad härledning skulle då exponera STALE tabeller medan status är
  // loading/error (kontraktsbrott, se decisions.md C8). Så vi släpper bara igenom
  // härledningen i ready-läget; annars [].
  const tables = useMemo(
    () => (status === 'ready' ? deriveGroupTables(groups, matches) : []),
    [status, groups, matches]
  );

  return { status, tables, teams, mode, error, setMatches };
}
