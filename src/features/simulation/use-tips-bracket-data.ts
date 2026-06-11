// React-hook som matar den SIMULERADE slutspelsbilden ur grupp-tipsen (T51, #88).
//
// Ansvar (tunt, en sak): läsa MINA grupp-tips (ur grupp-tips-storen) + lag-listan,
// adaptera tipsen till deriveTipsBracket-formen och härleda bilden reaktivt. Exakt
// samma härledd-state-mönster som useBracketData (T9): tipsen ändras -> useMemo
// räknar om bilden, inget lagras dubbelt. Hooken skriver ALDRIG, den läser bara
// tipsen och härleder en vy (de riktiga resultaten/facit rörs inte).
//
// IDENTITETS-RYMD vid seamen: grupp-tipsen bär winnerTeamId/runnerUpTeamId som
// Team.CODE (versal "BRA", se group-predictions-api / team-code.ts). Vi skickar
// koderna vidare som code; deriveTipsBracket översätter code -> Team.id internt
// (en sanning för den översättningen), så hooken behöver inte känna till rymden.
//
// MÅSTE renderas inuti en <GroupPredictionsProvider> (useGroupPredictionsStore
// fail-loud:ar annars). Lag-listan tas via useGroupPredictableData (samma seam
// grupp-tips-vyn redan använder, DRY).

import { useMemo } from 'react';
import type { Team } from '../../domain/types';
import { useGroupPredictionsStore } from '../group-predictions/group-predictions-context';
import { useGroupPredictableData } from '../group-predictions/use-group-predictable-data';
import { deriveTipsBracket, type GroupTipPick, type TipsBracketState } from './derive-tips-bracket';

/** Det hooken exponerar till den simulerade slutspels-vyn. */
export interface TipsBracketData {
  /** Den härledda bilden, eller null tills datat är klart. */
  bracket: TipsBracketState | null;
  /** Lagen, för att slå upp namn/landskod per teamId i vyn. */
  teams: Team[];
  /** Är lag-datat (statisk turneringsdata) klart att rendera? */
  ready: boolean;
}

/**
 * Härled den simulerade slutspelsbilden ur mina grupp-tips + lag-listan.
 *
 * @param env Injicerbar env (testbarhet), default import.meta.env (vidare till
 *            lag-datat). Tipsen kommer ur storen (redan rum-/env-medveten).
 */
export function useTipsBracketData(env: ImportMetaEnv = import.meta.env): TipsBracketData {
  const store = useGroupPredictionsStore();
  const { status, teams } = useGroupPredictableData(env);

  // Adaptera mina grupp-tips (groupId -> GroupPrediction, code-bärande) till
  // deriveTipsBracket-formen (groupId -> 1:a/2:a som code). Vi behåller koderna
  // som code, översättningen till Team.id görs i motorn.
  const picksByGroup = useMemo<Map<string, GroupTipPick>>(() => {
    const picks = new Map<string, GroupTipPick>();
    for (const [groupId, pred] of store.myGroupPredictions) {
      picks.set(groupId, {
        winnerCode: pred.winnerTeamId,
        runnerUpCode: pred.runnerUpTeamId,
      });
    }
    return picks;
  }, [store.myGroupPredictions]);

  // Härled bilden reaktivt. Gata på att lag-datat är klart (status 'ready'), annars
  // är `teams` tomt och code -> id-uppslaget skulle ge tbd för allt (stale-skydd,
  // samma kontrakt som useBracketData/useGroupData).
  const bracket = useMemo<TipsBracketState | null>(() => {
    if (status !== 'ready') {
      return null;
    }
    return deriveTipsBracket(picksByGroup, teams);
  }, [status, picksByGroup, teams]);

  return { bracket, teams, ready: status === 'ready' };
}
