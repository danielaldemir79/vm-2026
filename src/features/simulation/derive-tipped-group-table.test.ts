// Tester för per-grupp-förslaget UR match-tipsen (T65, #119).
//
// Testerna vaktar de FAKTISKA invarianterna (inte en svagare form, jfr lessons
// "uttömmande-test-vaktar-svagare-invariant" + "tva-identitetsrymder"):
//   - KOMPLETT tippad grupp -> förslag = rank 1/2 i den tippade tabellen, MED de två
//     verkliga källorna kopplade (deriveGroupTables ur tipsen vs förslaget), så en
//     id/code-mappnings-drift failar testet i stället för att ge tyst fel lag,
//   - förslaget bär CODE (versal), inte id (gemen): rymden vid seamen är bevisad,
//   - OFULLSTÄNDIGT tippad grupp (en match otippad) -> null, ingen gissning,
//   - NOLL tips -> null (den farliga fällan: computeStandings ger en tabell även utan
//     tips via teamId-fallback, men den får ALDRIG föreslås),
//   - förslaget RÖR SIG med tipsen (ändra ett resultat -> annan 1:a/2:a),
//   - per-grupp-oberoende: grupp A komplett ger förslag ÄVEN om grupp B är otippad
//     (skillnaden mot T64:s alla-12-krav),
//   - funktionen muterar inte sina argument.

import { describe, expect, it } from 'vitest';
import type { GroupId, Group, Match, Team } from '../../domain/types';
import { WC2026_GROUPS, WC2026_MATCHES, WC2026_TEAMS } from '../../data/wc2026';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { deriveTippedGroupSuggestion, type GroupSuggestion } from './derive-tipped-group-table';
import { tippedGroupMatch, type MatchTipScore } from './derive-tips-thirds';

const GROUPS: readonly Group[] = WC2026_GROUPS;
const TEAMS: readonly Team[] = WC2026_TEAMS;
const MATCHES: readonly Match[] = WC2026_MATCHES;

/** Alla gruppmatcher som tillhör en given grupp i matchplanen. */
function groupMatches(groupId: GroupId): Match[] {
  return MATCHES.filter((m) => m.stage === 'group' && m.groupId === groupId);
}

/**
 * Bygg ett KOMPLETT tips-set för EN grupp med en deterministisk scoreline-regel:
 * lägre lottnings-position (gruppens första lag) vinner stort, så rank 1>2>3>4 blir
 * entydig. Det låter testet veta exakt vilken 1:a/2:a förslaget SKA ge.
 */
function fullTipsForGroup(groupId: GroupId): Map<string, MatchTipScore> {
  const group = GROUPS.find((g) => g.id === groupId)!;
  const positionByTeam = new Map<string, number>();
  group.teamIds.forEach((teamId, index) => positionByTeam.set(teamId, index + 1));

  const tips = new Map<string, MatchTipScore>();
  for (const match of groupMatches(groupId)) {
    const homePos = positionByTeam.get(match.homeTeamId!)!;
    const awayPos = positionByTeam.get(match.awayTeamId!)!;
    if (homePos < awayPos) {
      tips.set(match.id, { homeGoals: 2, awayGoals: 0 });
    } else {
      tips.set(match.id, { homeGoals: 0, awayGoals: 2 });
    }
  }
  return tips;
}

/** Code (versal) för ett Team.id, ur lag-listan (för att korsläsa förväntad 1:a/2:a). */
function codeOf(teamId: string): string {
  return TEAMS.find((t) => t.id === teamId)!.code;
}

describe('deriveTippedGroupSuggestion, komplett tippad grupp', () => {
  it('föreslår rank 1 + rank 2 ur den TIPPADE tabellen (de två verkliga källorna kopplade)', () => {
    const tips = fullTipsForGroup('A');
    const suggestion = deriveTippedGroupSuggestion('A', GROUPS, TEAMS, MATCHES, tips);

    // Oberoende facit: bygg samma tippade tabell DIREKT via den källlåsta kedjan
    // (deriveGroupTables -> computeStandings) och plocka rank 1/2. Detta matar de
    // TVÅ VERKLIGA källorna mot varandra: en id/code-mappnings-drift failar HÄR i
    // stället för att ge tyst fel lag (T16-lärdomen).
    const groupA = GROUPS.find((g) => g.id === 'A')!;
    const synthetic = groupMatches('A').map((m) => tippedGroupMatch(m, tips.get(m.id)!));
    const standings = deriveGroupTables([groupA], synthetic)[0].standings;
    const expected: GroupSuggestion = {
      winnerCode: codeOf(standings.find((r) => r.rank === 1)!.teamId),
      runnerUpCode: codeOf(standings.find((r) => r.rank === 2)!.teamId),
    };

    expect(suggestion).toEqual(expected);
  });

  it('förslaget bär CODE (versal "^[A-Z]{3}$"), inte ett gemen Team.id', () => {
    const suggestion = deriveTippedGroupSuggestion(
      'C',
      GROUPS,
      TEAMS,
      MATCHES,
      fullTipsForGroup('C')
    );
    expect(suggestion).not.toBeNull();
    expect(suggestion!.winnerCode).toMatch(/^[A-Z]{3}$/);
    expect(suggestion!.runnerUpCode).toMatch(/^[A-Z]{3}$/);
    // 1:a och 2:a är olika lag (speglar formulärets/DB:ns distinct-krav).
    expect(suggestion!.winnerCode).not.toBe(suggestion!.runnerUpCode);
  });

  it('RÖR SIG med tipsen: vänd alla resultat -> annan 1:a/2:a', () => {
    const base = deriveTippedGroupSuggestion('A', GROUPS, TEAMS, MATCHES, fullTipsForGroup('A'));

    // Vänd varje resultat (förloraren vinner nu), så tabellen kastas om.
    const flipped = new Map<string, MatchTipScore>();
    for (const [matchId, score] of fullTipsForGroup('A')) {
      flipped.set(matchId, { homeGoals: score.awayGoals, awayGoals: score.homeGoals });
    }
    const after = deriveTippedGroupSuggestion('A', GROUPS, TEAMS, MATCHES, flipped);

    expect(after).not.toBeNull();
    expect(after).not.toEqual(base);
  });
});

describe('deriveTippedGroupSuggestion, ofullständigt tippat (gissa aldrig)', () => {
  it('en enda gruppmatch otippad -> null, ingen gissning', () => {
    const tips = fullTipsForGroup('A');
    // Ta bort EN match ur tipset: gruppen är inte längre komplett.
    const [firstMatchId] = [...tips.keys()];
    tips.delete(firstMatchId);
    expect(deriveTippedGroupSuggestion('A', GROUPS, TEAMS, MATCHES, tips)).toBeNull();
  });

  it('NOLL tips -> null (computeStandings ger en tabell även utan tips, men den får inte föreslås)', () => {
    expect(deriveTippedGroupSuggestion('A', GROUPS, TEAMS, MATCHES, new Map())).toBeNull();
  });

  it('en grupp som saknas i matchplanen (total 0) -> null (fail-safe)', () => {
    const noGroupMatches = MATCHES.filter((m) => m.stage !== 'group');
    expect(deriveTippedGroupSuggestion('A', GROUPS, TEAMS, noGroupMatches, new Map())).toBeNull();
  });
});

describe('deriveTippedGroupSuggestion, per-grupp-oberoende (skillnad mot T64:s alla-12-krav)', () => {
  it('grupp A komplett ger förslag ÄVEN om grupp B är helt otippad', () => {
    // BARA grupp A:s matcher tippas. B..L är otippade. T64:s tre-seedning hade gett
    // INGET (kräver alla 12); HÄR ska grupp A ändå få sitt förslag (1:a/2:a beror
    // bara på A:s egna matcher).
    const tips = fullTipsForGroup('A');
    expect(deriveTippedGroupSuggestion('A', GROUPS, TEAMS, MATCHES, tips)).not.toBeNull();
    // Grupp B (otippad) ger fortfarande null, ärligt.
    expect(deriveTippedGroupSuggestion('B', GROUPS, TEAMS, MATCHES, tips)).toBeNull();
  });
});

describe('deriveTippedGroupSuggestion, renhet', () => {
  it('muterar inte sina argument', () => {
    const tips = fullTipsForGroup('A');
    const groupsCopy = structuredClone(GROUPS) as Group[];
    const teamsCopy = structuredClone(TEAMS) as Team[];
    const matchesCopy = structuredClone(MATCHES) as Match[];
    const tipsCopy = new Map(tips);

    deriveTippedGroupSuggestion('A', groupsCopy, teamsCopy, matchesCopy, tips);

    expect(groupsCopy).toEqual(GROUPS);
    expect(teamsCopy).toEqual(TEAMS);
    expect(matchesCopy).toEqual(MATCHES);
    expect([...tips.entries()]).toEqual([...tipsCopy.entries()]);
  });
});
