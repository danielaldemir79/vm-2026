import { describe, expect, it } from 'vitest';
import { selectPredictableBracket } from './bracket-predictable-slots';
import { POOL_EXTENDED_DEADLINE_ISO } from '../../data/predictions';
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
  // preliminary: false = skarpt läge (T56-fältet), dessa tester gäller låsta slots.
  return { matches, locked: true, preliminary: false };
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

  it('CHAMPION (T67): alla lag som val, deadline = FÖRLÄNGD till fasta söndagstiden', () => {
    // g-A-1 (11/6) ligger FÖRE fasta tiden, så champion FÖRLÄNGS: GREATEST(g-A-1, fast)
    // = fasta tiden (21/6 21:59Z). decisions.md T67.
    const result = selectPredictableBracket(
      bracket([]),
      TEAMS,
      MATCHES,
      new Date('2026-06-01T00:00:00Z')
    );
    expect(result.champion.slotId).toBe('champion');
    // Alla 4 lagen (KISS, fritt val), som versal code, ALFABETISKT sorterade på namn
    // (T68/#129 punkt 12, sv-locale): Argentina, Brasilien, Frankrike, Spanien.
    expect(result.champion.teams.map((t) => t.code)).toEqual(['ARG', 'BRA', 'FRA', 'ESP']);
    expect(result.champion.locked).toBe(false);
    expect(result.champion.deadlineIso).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('CHAMPION (T68/#129): VM-mästar-listan är ALFABETISK på namn (svensk locale)', () => {
    // Daniels spec punkt 12: bland alla lag är det enklast att hitta sitt lag när
    // listan är i bokstavsordning. Lägg in lag i OORDNAD ordning + en med å/ä/ö (Österrike)
    // så vi bevisar svensk kollation (Ö EFTER Z, inte som O). Indata-ordning != utdata.
    const teams: Team[] = [
      { id: 'ost', name: 'Österrike', code: 'OST', group: 'A' },
      { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'B' },
      { id: 'arg', name: 'Argentina', code: 'ARG', group: 'C' },
      { id: 'ang', name: 'Angola', code: 'ANG', group: 'D' },
    ];
    const result = selectPredictableBracket(
      bracket([]),
      teams,
      MATCHES,
      new Date('2026-06-01T00:00:00Z')
    );
    // Svensk ordning: Angola, Argentina, Brasilien, ... Österrike (Ö sist, efter Z).
    expect(result.champion.teams.map((t) => t.name)).toEqual([
      'Angola',
      'Argentina',
      'Brasilien',
      'Österrike',
    ]);
  });

  it('CHAMPION (T67): ÖPPEN igen efter turneringsstart, fram till fasta tiden (reopen)', () => {
    // Efter g-A-1 (11/6 16:00, turneringen startad) men före fasta tiden (21/6): champion ska
    // vara ÖPPEN igen (de som inte hann före premiären får tippa VM-vinnare t.o.m. söndag).
    const result = selectPredictableBracket(
      bracket([]),
      TEAMS,
      MATCHES,
      new Date('2026-06-13T12:00:00.000Z')
    );
    expect(result.champion.locked).toBe(false);
  });

  it('CHAMPION-LÅS (T67): GRÄNS , öppen sekunden före fasta tiden, låst exakt på den', () => {
    const oneSecBefore = selectPredictableBracket(
      bracket([]),
      TEAMS,
      MATCHES,
      new Date('2026-06-21T21:58:59.000Z')
    );
    expect(oneSecBefore.champion.locked).toBe(false);

    // Exakt på fasta tiden (now === deadline): låst, samma riktning som server-RLS.
    const atDeadline = selectPredictableBracket(
      bracket([]),
      TEAMS,
      MATCHES,
      new Date(POOL_EXTENDED_DEADLINE_ISO)
    );
    expect(atDeadline.champion.locked).toBe(true);
  });

  it('T67: en match-SLOT förlängs ALDRIG (behåller sin EGEN avspark, inte fasta tiden)', () => {
    // Konstruerat: en slot vars avspark ligger FÖRE fasta tiden. Om koden av misstag
    // förlängde SLOTS (den ska bara förlänga champion) skulle deadlinen bli fasta tiden.
    // Bevis: slottens deadlineIso = dess EGNA avspark, och den är LÅST efter den (inte
    // öppen till söndagen). Detta vaktar att förlängningen INTE läckte in på slot-grenen.
    const earlySlotMatches: Match[] = [
      kickoffMatch('g-A-1', '2026-06-11T16:00:00.000Z'),
      kickoffMatch('M73', '2026-06-12T16:00:00.000Z'), // före fasta tiden (hypotetiskt)
    ];
    const state = bracket([bracketMatch('M73', 'round-of-32', 'bra', 'arg')]);
    const result = selectPredictableBracket(
      state,
      TEAMS,
      earlySlotMatches,
      new Date('2026-06-13T00:00:00.000Z') // efter slot-avspark, före fasta tiden
    );
    const slot73 = result.rounds.flatMap((r) => r.slots).find((s) => s.slotId === 'M73')!;
    expect(slot73.deadlineIso).toBe('2026-06-12T16:00:00.000Z'); // EGEN avspark, ej förlängd
    expect(slot73.locked).toBe(true); // låst vid sin egen avspark, inte öppen till söndag
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
