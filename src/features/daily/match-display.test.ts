import { describe, expect, it } from 'vitest';
import type { Match, MatchResult, Team } from '../../domain/types';
import {
  formatPenalties,
  formatScore,
  isFinished,
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

describe('teamDisplayName, KORT namn i trånga ytor (matchkort/slutspelsträd, T50)', () => {
  // Matchkortet och slutspelsträdets celler är trånga; ett lag med långt namn bär
  // ett shortName som visas där (det fulla name står kvar i lagprofilen).
  const bih: Team = {
    id: 'bih',
    name: 'Bosnien och Hercegovina',
    shortName: 'Bosnien',
    code: 'BIH',
    group: 'B',
  };
  const teamsById = new Map<string, Team>([
    ['bih', bih],
    ['mex', team('mex', 'Mexiko')],
  ]);

  it('visar shortName när laget har ett (det LÅNGA name trycker ihop kortet)', () => {
    expect(teamDisplayName('bih', teamsById)).toBe('Bosnien');
  });

  it('faller tillbaka till name när laget INTE satt shortName (default-fallet)', () => {
    expect(teamDisplayName('mex', teamsById)).toBe('Mexiko');
  });
});

describe('isFinished, narrowar typen för en färdigspelad match (T57)', () => {
  function withStatus(status: Match['status'], result: Match['result']): Match {
    return {
      id: 'm',
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'mex',
      awayTeamId: 'rsa',
      kickoff: '2026-06-11T19:00:00.000Z',
      venue: 'Arena ej verifierad (egen data-punkt)',
      tvChannel: 'TV4',
      status,
      result,
    } as Match;
  }

  it('är true för en finished-match och false för scheduled/live', () => {
    expect(isFinished(withStatus('finished', { homeGoals: 2, awayGoals: 1 }))).toBe(true);
    expect(isFinished(withStatus('scheduled', null))).toBe(false);
    expect(isFinished(withStatus('live', null))).toBe(false);
  });
});

describe('formatScore, ordinarie-resultatet "hemma-borta" (T57)', () => {
  it('formaterar mål med bindestreck (inte em-dash, svensk copy-regel)', () => {
    expect(formatScore({ homeGoals: 2, awayGoals: 1 })).toBe('2-1');
    expect(formatScore({ homeGoals: 0, awayGoals: 0 })).toBe('0-0');
  });

  it('hanterar tvåsiffriga mål (osannolikt men inte trasigt)', () => {
    expect(formatScore({ homeGoals: 10, awayGoals: 0 })).toBe('10-0');
  });
});

describe('formatPenalties, straffresultat bara när straffar avgjorde (slutspel, T57)', () => {
  it('ger null när matchen inte avgjordes på straffar (gruppspel/ordinarie)', () => {
    const result: MatchResult = { homeGoals: 2, awayGoals: 1 };
    expect(formatPenalties(result)).toBeNull();
  });

  it('formaterar straffarna SEPARAT så slutspels-resultatet inte blir tvetydigt', () => {
    const result: MatchResult = {
      homeGoals: 2,
      awayGoals: 2,
      penalties: { homeGoals: 4, awayGoals: 3 },
    };
    expect(formatPenalties(result)).toBe('(4-3 på straffar)');
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
