import { describe, expect, it } from 'vitest';
import { selectPredictableBracket } from './bracket-predictable-slots';
import type { BracketMatchState, BracketSlotState, BracketState } from '../bracket';
import type { Match, Team } from '../../domain/types';

// Lag i BÅDA identitets-rymderna (F1-seamen): Team.id är GEMEN ("bra"), Team.code är
// VERSAL ("BRA"). Det härledda trädet (deriveBracket) bär Team.id; tipsen LAGRAS som
// code. Testet bevisar att slot-valen mappar id -> code (annars tyst 0 poäng i T17).
const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A' },
  { id: 'arg', name: 'Argentina', code: 'ARG', group: 'B' },
  { id: 'fra', name: 'Frankrike', code: 'FRA', group: 'C' },
  { id: 'esp', name: 'Spanien', code: 'ESP', group: 'D' },
];

/** Bygg en slot-state (resolved bär Team.id, tbd bär null). */
function slot(
  id: string,
  matchId: string,
  side: 'home' | 'away',
  stage: BracketSlotState['stage'],
  teamId: string | null
): BracketSlotState {
  return {
    id,
    matchId,
    side,
    stage,
    nextSlotId: null,
    resolution: teamId !== null ? 'resolved' : 'tbd',
    label: teamId !== null ? teamId : 'Vinnare okänd',
    teamId,
    candidateTeamIds: [],
  };
}

/** Bygg en match-state med home/away-lag (Team.id eller null = okänt). */
function bracketMatch(
  matchId: string,
  stage: BracketSlotState['stage'],
  homeTeamId: string | null,
  awayTeamId: string | null
): BracketMatchState {
  return {
    matchId,
    stage,
    home: slot(`${matchId}-home`, matchId, 'home', stage, homeTeamId),
    away: slot(`${matchId}-away`, matchId, 'away', stage, awayTeamId),
    winnerSlotId: null,
  };
}

/** En kickoff-bärande match (för deadline-uppslaget). */
function kickoffMatch(id: string, kickoff: string): Match {
  return {
    id,
    stage: id.startsWith('g-') ? 'group' : 'round-of-32',
    groupId: id.startsWith('g-') ? (id.charAt(2) as Match['groupId']) : null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  } as Match;
}

// Matchplan: turneringsstart g-A-1, två slutspelsmatcher med olika avspark.
const MATCHES: Match[] = [
  kickoffMatch('g-A-1', '2026-06-11T16:00:00.000Z'),
  kickoffMatch('M73', '2026-07-01T16:00:00.000Z'),
  kickoffMatch('M74', '2026-07-02T16:00:00.000Z'),
];

function bracket(matches: BracketMatchState[]): BracketState {
  return { matches, locked: true };
}

describe('selectPredictableBracket', () => {
  it('mappar Team.id (gemen) -> Team.code (versal) i slot-valen (F1-seamen)', () => {
    const state = bracket([bracketMatch('M73', 'round-of-32', 'bra', 'arg')]);
    const result = selectPredictableBracket(
      state,
      TEAMS,
      MATCHES,
      new Date('2026-06-01T00:00:00Z')
    );
    const slot73 = result.rounds.flatMap((r) => r.slots).find((s) => s.slotId === 'M73')!;
    expect(slot73.teamsKnown).toBe(true);
    // KRITISKT: value:t som lagras/jämförs är CODE (versal), inte det härledda id:t.
    expect(slot73.teams.map((t) => t.code)).toEqual(['BRA', 'ARG']);
    expect(slot73.teams.map((t) => t.name)).toEqual(['Brasilien', 'Argentina']);
  });

  it('OKÄNDA LAG: en slot med en otippad (tbd) sida är otippbar, inga lag-val', () => {
    // M74 har bara hemmalaget känt -> teamsKnown=false (gissa aldrig motståndaren).
    const state = bracket([bracketMatch('M74', 'round-of-32', 'fra', null)]);
    const result = selectPredictableBracket(
      state,
      TEAMS,
      MATCHES,
      new Date('2026-06-01T00:00:00Z')
    );
    const slot74 = result.rounds.flatMap((r) => r.slots).find((s) => s.slotId === 'M74')!;
    expect(slot74.teamsKnown).toBe(false);
    expect(slot74.teams).toEqual([]);
  });

  it('PER-SLOT-LÅS: M73 låst efter sin avspark, M74 öppen (olika deadlines)', () => {
    const state = bracket([
      bracketMatch('M73', 'round-of-32', 'bra', 'arg'),
      bracketMatch('M74', 'round-of-32', 'fra', 'esp'),
    ]);
    // Tid mellan M73 (1 juli) och M74 (2 juli) avspark: M73 låst, M74 öppen.
    const result = selectPredictableBracket(
      state,
      TEAMS,
      MATCHES,
      new Date('2026-07-01T18:00:00.000Z')
    );
    const slots = result.rounds.flatMap((r) => r.slots);
    expect(slots.find((s) => s.slotId === 'M73')!.locked).toBe(true);
    expect(slots.find((s) => s.slotId === 'M74')!.locked).toBe(false);
  });

  it('CHAMPION: alla lag som val, deadline = turneringsstart (g-A-1)', () => {
    const result = selectPredictableBracket(
      bracket([]),
      TEAMS,
      MATCHES,
      new Date('2026-06-01T00:00:00Z')
    );
    expect(result.champion.slotId).toBe('champion');
    // Alla 4 lagen (KISS, fritt val), som versal code.
    expect(result.champion.teams.map((t) => t.code)).toEqual(['BRA', 'ARG', 'FRA', 'ESP']);
    expect(result.champion.locked).toBe(false);
    expect(result.champion.deadlineIso).toBe('2026-06-11T16:00:00.000Z');
  });

  it('CHAMPION-LÅS: låst när turneringen startat (now >= g-A-1)', () => {
    const result = selectPredictableBracket(
      bracket([]),
      TEAMS,
      MATCHES,
      new Date('2026-06-11T18:00:00.000Z')
    );
    expect(result.champion.locked).toBe(true);
  });

  it('FAIL-SAFE: en slot vars deadline-match saknas behandlas som låst', () => {
    // M99 finns i trädet men inte i matchplanen (inget kickoff-uppslag).
    const state = bracket([bracketMatch('M99', 'semi-final', 'bra', 'arg')]);
    const result = selectPredictableBracket(
      state,
      TEAMS,
      MATCHES,
      new Date('2026-06-01T00:00:00Z')
    );
    const slot99 = result.rounds.flatMap((r) => r.slots).find((s) => s.slotId === 'M99')!;
    expect(slot99.deadlineIso).toBeNull();
    expect(slot99.locked).toBe(true);
  });

  it('null bracket (data ej laddad): tomma rundor men champion finns ändå', () => {
    const result = selectPredictableBracket(null, TEAMS, MATCHES, new Date('2026-06-01T00:00:00Z'));
    expect(result.rounds).toEqual([]);
    expect(result.champion.teams).toHaveLength(4);
  });

  it('rund-grupperar slottarna i officiell ordning (sextondel före semifinal)', () => {
    const state = bracket([
      bracketMatch('M99', 'semi-final', 'bra', 'arg'),
      bracketMatch('M73', 'round-of-32', 'fra', 'esp'),
    ]);
    const result = selectPredictableBracket(
      state,
      TEAMS,
      MATCHES,
      new Date('2026-06-01T00:00:00Z')
    );
    expect(result.rounds.map((r) => r.stage)).toEqual(['round-of-32', 'semi-final']);
  });
});
