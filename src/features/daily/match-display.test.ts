import { describe, expect, it } from 'vitest';
import type { Match, Team } from '../../domain/types';
import {
  isVenuePlaceholder,
  stageLabel,
  teamDisplayName,
  UNKNOWN_TEAM_LABEL,
} from './match-display';

function team(id: string, name: string): Team {
  return { id, name, code: id.toUpperCase(), group: 'A' };
}

describe('stageLabel, svensk etikett per steg', () => {
  it('visar grupp-bokstaven för en gruppmatch', () => {
    expect(stageLabel({ stage: 'group', groupId: 'C' })).toBe('Grupp C');
  });

  it('visar slutspels-etiketten på svenska', () => {
    expect(stageLabel({ stage: 'round-of-32', groupId: null })).toBe('Sextondelsfinal');
    expect(stageLabel({ stage: 'round-of-16', groupId: null })).toBe('Åttondelsfinal');
    expect(stageLabel({ stage: 'quarter-final', groupId: null })).toBe('Kvartsfinal');
    expect(stageLabel({ stage: 'semi-final', groupId: null })).toBe('Semifinal');
    expect(stageLabel({ stage: 'third-place', groupId: null })).toBe('Bronsmatch');
    expect(stageLabel({ stage: 'final', groupId: null })).toBe('Final');
  });
});

describe('teamDisplayName, namn ur uppslag eller platshållare (gissar aldrig)', () => {
  const teamsById = new Map<string, Team>([['mex', team('mex', 'Mexiko')]]);

  it('slår upp ett känt lags namn', () => {
    expect(teamDisplayName('mex', teamsById)).toBe('Mexiko');
  });

  it('ger platshållaren för ett ÄNNU okänt slutspelslag (teamId null)', () => {
    expect(teamDisplayName(null, teamsById)).toBe(UNKNOWN_TEAM_LABEL);
  });

  it('ger platshållaren för ett id som saknas i uppslaget (gissar inte)', () => {
    expect(teamDisplayName('saknas', teamsById)).toBe(UNKNOWN_TEAM_LABEL);
  });
});

describe('isVenuePlaceholder, känner igen "ej verifierad"-platshållaren (#35)', () => {
  it('är true för parserns platshållare', () => {
    expect(isVenuePlaceholder('Arena ej verifierad (egen data-punkt)')).toBe(true);
  });

  it('är okänslig för versaler/extra mellanslag (inte spröd exakt-matchning)', () => {
    expect(isVenuePlaceholder('arena   EJ   Verifierad')).toBe(true);
  });

  it('är false för en riktig arena (då ska den visas)', () => {
    expect(isVenuePlaceholder('MetLife Stadium, East Rutherford')).toBe(false);
  });
});

// Sanity: en slutspelsmatch utan kända lag (homeTeamId null) ska ge två
// platshållare, inte krascha (typ-kontraktet tillåter null i slutspel).
describe('integration: slutspelsmatch utan kända lag', () => {
  it('ger platshållare för båda sidor', () => {
    const m: Match = {
      id: 'M73',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
      kickoff: '2026-06-28T19:00:00.000Z',
      venue: 'Arena ej verifierad (egen data-punkt)',
      tvChannel: 'TV4',
      result: null,
      status: 'scheduled',
    };
    const empty = new Map<string, Team>();
    expect(teamDisplayName(m.homeTeamId, empty)).toBe(UNKNOWN_TEAM_LABEL);
    expect(teamDisplayName(m.awayTeamId, empty)).toBe(UNKNOWN_TEAM_LABEL);
    expect(stageLabel(m)).toBe('Sextondelsfinal');
  });
});
