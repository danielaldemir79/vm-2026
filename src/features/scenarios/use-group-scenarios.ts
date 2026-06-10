// React-hook som matar "Vad krävs"-vyn med LIVE scenario-data (T11).
//
// Ansvar (tunt, en sak): läsa den DELADE results-storen (matcher = enda
// sanningen) och HÄRLEDA per-grupp-scenarierna (computeGroupScenario) reaktivt.
// Exakt samma mönster som useGroupData (T5/T6): en resultatinmatning ändrar
// matcherna i storen -> useMemo räknar om scenarierna automatiskt ("live").
//
// VARFÖR matcher i storen men scenarier härledda: matchresultaten är den enda
// sanningen (SPEC §6). Scenarierna är en ren funktion av dem, så att lagra dem
// vore dubbellagring som kan driva isär. useMemo gör om-beräkningen reaktiv.

import { useMemo } from 'react';
import type { DataSourceMode } from '../../data';
import type { Group, Match, Team } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import type { LoadStatus } from '../groups/use-group-data';
import { useResultsStore } from '../results/results-context';
import { computeGroupScenario, type GroupScenario } from './scenario-engine';

/** Det hooken exponerar till scenario-vyn (samma kontrakt-form som GroupData). */
export interface GroupScenarioData {
  status: LoadStatus;
  /** Ett scenario per grupp (A-L), tomt tills status === 'ready'. */
  scenarios: GroupScenario[];
  /** Lagen (uppslag namn/landskod i vyn). */
  teams: Team[];
  /** Vilken datakälla som är aktiv (för "demo-data"-märke). */
  mode: DataSourceMode;
  /** Felmeddelande vid status === 'error', annars null. */
  error: string | null;
}

/**
 * Härled "Vad krävs"-scenarierna per grupp ur den delade storen.
 *
 * MÅSTE användas inuti en <ResultsProvider> (useResultsStore fail-loud:ar
 * annars). Härledningen gatas på `status === 'ready'`: under en laddning (eller
 * env-byte) ligger gamla grupper/matcher kvar i state tills den nya hämtningen
 * settlar, och en oavkortad härledning skulle exponera STALE scenarier medan
 * status är loading/error (samma kontrakt som useGroupData, decisions.md C8).
 */
export function useGroupScenarios(): GroupScenarioData {
  const { status, groups, matches, teams, mode, error } = useResultsStore();

  const scenarios = useMemo(
    () => (status === 'ready' ? deriveScenarios(groups, matches) : []),
    [status, groups, matches]
  );

  return { status, scenarios, teams, mode, error };
}

/**
 * Bygg ett scenario per grupp i kanonisk A-L-ordning (GROUP_IDS, enda sanningen
 * för grupp-ordningen, samma som deriveGroupTables), oberoende av hur storen
 * råkar leverera grupperna. Ren hjälpare (testbar utan React). Delegerar HELA
 * beräkningen till computeGroupScenario, räknar inget själv (DRY). En grupp som
 * saknas i datakällan (tidiga fixtures med < 12 grupper) hoppas över i stället
 * för att gissa fram en tom grupp.
 */
function deriveScenarios(groups: readonly Group[], matches: readonly Match[]): GroupScenario[] {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const scenarios: GroupScenario[] = [];
  for (const groupId of GROUP_IDS) {
    const group = groupsById.get(groupId);
    if (!group) {
      continue;
    }
    scenarios.push(computeGroupScenario(group.teamIds, matches, groupId));
  }
  return scenarios;
}
