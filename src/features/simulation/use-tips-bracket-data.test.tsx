// Integrationstest för den TIPS-härledda slutspels-vyns datakoppling (T64, #118).
//
// Vaktar att treplats-seedningen ur match-tipsen faktiskt är INKOPPLAD hela vägen
// (lessons "handoff-pastar-ett-krav-levererat-men-koden-wirar-aldrig-in-ytan"):
// match-tips-storen -> useTipsBracketData -> deriveTipsThirdSeeding -> bracket med
// 'tipped-third'-slots. Vi använder den RIKTIGA fixtures-datan (alla 72 gruppmatcher)
// + en komplett match-tips-store, så de TVÅ verkliga källorna möts (inte bara
// handskriven data), exakt det seamen finns till för.

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Group, Match, Team } from '../../domain/types';
import { WC2026_GROUPS, WC2026_MATCHES, WC2026_TEAMS } from '../../data/wc2026';
import type { Prediction } from '../../data/predictions';
import {
  GroupPredictionsStoreContext,
  type GroupPredictionsStore,
} from '../group-predictions/group-predictions-context';
import { PredictionsStoreContext, type PredictionsStore } from '../predictions/predictions-context';
import type { GroupPredictableData } from '../group-predictions/use-group-predictable-data';
import { useTipsBracketData } from './use-tips-bracket-data';

const GROUPS: Group[] = WC2026_GROUPS;
const TEAMS: Team[] = WC2026_TEAMS;
const MATCHES: Match[] = WC2026_MATCHES;
const GROUP_MATCHES = MATCHES.filter((m) => m.stage === 'group' && m.groupId !== null);

const predictableData: GroupPredictableData = {
  status: 'ready',
  groups: GROUPS,
  teams: TEAMS,
  matches: MATCHES,
  error: null,
};

/** En grupp-tips-store (treorna kommer INTE härifrån, men hooken läser den). */
function groupStore(): GroupPredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myGroupPredictions: new Map(),
    saveGroupPrediction: async () => {},
  };
}

/** En match-tips-store med givna tips (matchId -> mål). */
function matchStore(myPredictions: ReadonlyMap<string, Prediction>): PredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myPredictions,
    savePrediction: async () => {},
  };
}

/** Bygg ett KOMPLETT match-tips-set (alla 72 gruppmatcher) med en deterministisk regel. */
function fullMatchTips(): Map<string, Prediction> {
  const positionByTeam = new Map<string, number>();
  for (const group of GROUPS) {
    group.teamIds.forEach((teamId, index) => positionByTeam.set(teamId, index + 1));
  }
  const tips = new Map<string, Prediction>();
  for (const match of GROUP_MATCHES) {
    const homePos = positionByTeam.get(match.homeTeamId!)!;
    const awayPos = positionByTeam.get(match.awayTeamId!)!;
    // Lägre lottnings-position vinner (entydig 1>2>3>4 per grupp).
    const homeGoals = homePos < awayPos ? 2 : homePos > awayPos ? 0 : 1;
    const awayGoals = awayPos < homePos ? 2 : awayPos > homePos ? 0 : 1;
    tips.set(match.id, {
      matchId: match.id,
      userId: 'me',
      homeGoals,
      awayGoals,
      updatedAt: 't',
    });
  }
  return tips;
}

function wrapper(matchPreds: ReadonlyMap<string, Prediction>) {
  return ({ children }: { children: ReactNode }) => (
    <PredictionsStoreContext.Provider value={matchStore(matchPreds)}>
      <GroupPredictionsStoreContext.Provider value={groupStore()}>
        {children}
      </GroupPredictionsStoreContext.Provider>
    </PredictionsStoreContext.Provider>
  );
}

describe('useTipsBracketData, treorna seedas ur match-tipsen (inkopplat hela vägen)', () => {
  it('KOMPLETT match-tips -> 8 bästa-trea-slots blir tipped-third (lag placerade)', () => {
    const { result } = renderHook(() => useTipsBracketData(predictableData), {
      wrapper: wrapper(fullMatchTips()),
    });
    const slots = result.current.bracket!.matches.flatMap((m) => [m.home, m.away]);
    expect(slots.filter((s) => s.resolution === 'tipped-third').length).toBe(8);
    expect(slots.filter((s) => s.resolution === 'open-third').length).toBe(0);
    // Varje tipped-third-slot bär ett placerat lag (Team.id, icke-null).
    for (const slot of slots.filter((s) => s.resolution === 'tipped-third')) {
      expect(slot.teamId).not.toBeNull();
    }
  });

  it('OFULLSTÄNDIGT match-tips (en match otippad) -> alla trea-slots öppna (gissa aldrig)', () => {
    const tips = fullMatchTips();
    tips.delete('g-A-1'); // en enda otippad gruppmatch
    const { result } = renderHook(() => useTipsBracketData(predictableData), {
      wrapper: wrapper(tips),
    });
    const slots = result.current.bracket!.matches.flatMap((m) => [m.home, m.away]);
    expect(slots.filter((s) => s.resolution === 'open-third').length).toBe(8);
    expect(slots.filter((s) => s.resolution === 'tipped-third').length).toBe(0);
  });

  it('INGA match-tips -> trea-slots öppna (T51-beteendet, oförändrat)', () => {
    const { result } = renderHook(() => useTipsBracketData(predictableData), {
      wrapper: wrapper(new Map()),
    });
    const slots = result.current.bracket!.matches.flatMap((m) => [m.home, m.away]);
    expect(slots.filter((s) => s.resolution === 'open-third').length).toBe(8);
    expect(slots.filter((s) => s.resolution === 'tipped-third').length).toBe(0);
  });
});
