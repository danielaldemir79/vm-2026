import { describe, expect, it } from 'vitest';
import type { BracketMatchState, BracketSlotState, BracketState } from '../bracket/derive-bracket';
import { championTeamIdFromBracket } from './champion-from-bracket';

// Minimala fixturer: bara fälten härledningen läser (id/teamId på slotarna,
// stage/winnerSlotId på matchen). Resten fylls med giltiga men irrelevanta värden.
function slot(id: string, teamId: string | null): BracketSlotState {
  return {
    id,
    matchId: 'M104',
    side: id.endsWith('home') ? 'home' : 'away',
    stage: 'final',
    nextSlotId: null,
    resolution: teamId ? 'resolved' : 'possible',
    label: id,
    teamId,
    candidateTeamIds: [],
  };
}

function finalMatch(
  homeTeam: string | null,
  awayTeam: string | null,
  winnerSlotId: string | null
): BracketMatchState {
  return {
    matchId: 'M104',
    stage: 'final',
    home: slot('M104-home', homeTeam),
    away: slot('M104-away', awayTeam),
    winnerSlotId,
    result: null,
    kickoff: null,
  };
}

function bracketWith(matches: BracketMatchState[]): BracketState {
  // Bara `matches` läses av härledningen, resten av BracketState är irrelevant här.
  return { matches } as BracketState;
}

describe('championTeamIdFromBracket', () => {
  it('null när trädet saknas', () => {
    expect(championTeamIdFromBracket(null)).toBeNull();
  });

  it('null när det inte finns någon final-match', () => {
    const semi = { ...finalMatch('esp', 'arg', 'M104-home'), stage: 'semi-final' as const };
    expect(championTeamIdFromBracket(bracketWith([semi]))).toBeNull();
  });

  it('null när finalen inte är avgjord (winnerSlotId null)', () => {
    expect(championTeamIdFromBracket(bracketWith([finalMatch('esp', 'arg', null)]))).toBeNull();
  });

  it('hemma-vinst ger hemmalagets teamId', () => {
    expect(championTeamIdFromBracket(bracketWith([finalMatch('esp', 'arg', 'M104-home')]))).toBe(
      'esp'
    );
  });

  it('borta-vinst ger bortalagets teamId', () => {
    expect(championTeamIdFromBracket(bracketWith([finalMatch('esp', 'arg', 'M104-away')]))).toBe(
      'arg'
    );
  });

  it('null när vinnar-sloten pekar på ett obestämt lag (teamId null)', () => {
    // Fail-safe: winnerSlotId satt men slotens teamId saknas -> ingen gissad mästare.
    expect(
      championTeamIdFromBracket(bracketWith([finalMatch(null, 'arg', 'M104-home')]))
    ).toBeNull();
  });
});
