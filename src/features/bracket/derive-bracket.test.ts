import { describe, expect, it } from 'vitest';
import type { GroupId, GroupStanding, GroupTable, Match } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { ROUND_OF_32 } from '../../domain/bracket/bracket-structure';
import { deriveBracket, groupByRound, isGroupStageComplete } from './derive-bracket';

// ============================================================================
// Härledning av det LEVANDE slutspelsträdet (T9, SPEC §5 + §6). Tre lägen:
// gruppspel pågår (möjliga lag), grupperna klara (låst till riktiga lag via
// FIFA-seedningen), slutspelsresultat (vinnar-propagering, inkl. straffar).
// Trädet är STRUKTURELLT (positioner), så vi testar oberoende av 2026-lottningen.
// ============================================================================

/** Bygg en standing-rad (bara fälten härledningen läser spelar roll). */
function row(
  teamId: string,
  rank: number,
  played: number,
  points = 0,
  gd = 0,
  gf = 0
): GroupStanding {
  return {
    teamId,
    played,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: gf,
    goalsAgainst: gf - gd,
    goalDifference: gd,
    points,
    rank,
  };
}

/**
 * En FÄRDIGSPELAD grupptabell för grupp `g`: 4 lag, alla spelat 3 matcher, med
 * distinkta poäng (12,9,6,3) så rank 1-4 är entydig. Lag-id = "<g>1".."<g>4".
 * Trean (rank 3) får parametriserbar poäng/MS/GM så treplats-rankningen kan styras.
 */
function completeTable(g: GroupId, thirdPoints = 4, thirdGD = 0, thirdGF = 3): GroupTable {
  return {
    groupId: g,
    standings: [
      row(`${g}1`, 1, 3, 9, 6, 8),
      row(`${g}2`, 2, 3, 6, 2, 5),
      row(`${g}3`, 3, 3, thirdPoints, thirdGD, thirdGF),
      row(`${g}4`, 4, 3, 0, -6, 1),
    ],
  };
}

/** En IGÅNG (ofullständig) grupptabell: lagen har bara spelat 1 match. */
function inProgressTable(g: GroupId): GroupTable {
  return {
    groupId: g,
    standings: [
      row(`${g}1`, 1, 1, 3, 1, 1),
      row(`${g}2`, 2, 1, 1, 0, 1),
      row(`${g}3`, 3, 1, 1, 0, 1),
      row(`${g}4`, 4, 1, 0, -1, 0),
    ],
  };
}

/** Alla 12 grupper, färdigspelade. Treornas poäng styr vilka 8 som kvalificerar. */
function allComplete(thirdPointsByGroup?: Partial<Record<GroupId, number>>): GroupTable[] {
  return GROUP_IDS.map((g) => completeTable(g, thirdPointsByGroup?.[g] ?? 4));
}

/** En scheduled slutspelsmatch (lagen seedas av härledningen, inte här). */
function knockoutMatch(id: string): Match {
  return {
    id,
    stage: 'round-of-32',
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: '2026-07-01T19:00:00Z',
    venue: 'Arena',
    result: null,
    status: 'scheduled',
  };
}

describe('isGroupStageComplete', () => {
  it('är false med färre än 12 grupper', () => {
    expect(isGroupStageComplete([completeTable('A')])).toBe(false);
  });

  it('är false om någon grupp har ospelade matcher', () => {
    const tables = allComplete();
    tables[5] = inProgressTable('F');
    expect(isGroupStageComplete(tables)).toBe(false);
  });

  it('är true när alla 12 grupper är färdigspelade', () => {
    expect(isGroupStageComplete(allComplete())).toBe(true);
  });
});

describe('deriveBracket, GRUPPSPEL PÅGÅR (möjliga lag + etiketter)', () => {
  const tables = GROUP_IDS.map(inProgressTable);
  const state = deriveBracket(
    tables,
    ROUND_OF_32.map((m) => knockoutMatch(m.id))
  );

  it('är INTE låst medan gruppspelet pågår', () => {
    expect(state.locked).toBe(false);
  });

  it('en gruppvinnar-slot visar etikett "1:a grupp X" och inget låst lag', () => {
    // M73 home = Runner-up A, away = Runner-up B (se bracket-structure).
    // M75 home = Winner F. Hitta en winner-slot.
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    // M74 home = Winner E.
    expect(m74.home.label).toBe('1:a grupp E');
    expect(m74.home.resolution).toBe('possible');
    expect(m74.home.teamId).toBeNull();
    // Möjliga lag = grupp E:s nuvarande lag.
    expect(m74.home.candidateTeamIds).toContain('E1');
  });

  it('en bästa-trea-slot visar etiketten EXAKT enligt motorns eligibleGroups (Art. 12.6)', () => {
    // M74 away = Best 3rd of A,B,C,D,F (bracket-structure).
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    expect(m74.away.label).toBe('3:a A/B/C/D/F');
    expect(m74.away.resolution).toBe('possible');
    // Kandidater = de NUVARANDE treorna i just de behöriga grupperna.
    expect(m74.away.candidateTeamIds).toEqual(['A3', 'B3', 'C3', 'D3', 'F3']);
  });

  it('en senare runda (åttondel) utan kända föregångare är TBD med vinnar-etikett', () => {
    const m89 = state.matches.find((m) => m.matchId === 'M89')!;
    // M89 home = Winner M74.
    expect(m89.home.label).toBe('Vinnare M74');
    expect(m89.home.resolution).toBe('tbd');
  });
});

describe('deriveBracket, GRUPPERNA KLARA (låst till riktiga lag via FIFA-seedningen)', () => {
  // Treornas poäng: A-H höga (kvalificerar), I-L låga (faller utanför).
  const tables = allComplete({
    A: 6,
    B: 6,
    C: 6,
    D: 6,
    E: 6,
    F: 6,
    G: 6,
    H: 6,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
  });
  const state = deriveBracket(
    tables,
    ROUND_OF_32.map((m) => knockoutMatch(m.id))
  );

  it('är LÅST när alla grupper är klara', () => {
    expect(state.locked).toBe(true);
  });

  it('gruppvinnar-/tvåa-slots är resolved till rätt lag (rank 1/2)', () => {
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    // M73 home = Runner-up A, away = Runner-up B.
    expect(m73.home.resolution).toBe('resolved');
    expect(m73.home.teamId).toBe('A2');
    expect(m73.away.teamId).toBe('B2');
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    // M74 home = Winner E.
    expect(m74.home.teamId).toBe('E1');
  });

  it('bästa-trea-slotarna är seedade till EXAKT en behörig grupps trea (Annexe C)', () => {
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    // M74 away = Best 3rd of A,B,C,D,F. Den seedade trean MÅSTE vara en av dem.
    expect(m74.away.resolution).toBe('resolved');
    expect(m74.away.teamId).not.toBeNull();
    const eligible = ['A3', 'B3', 'C3', 'D3', 'F3'];
    expect(eligible).toContain(m74.away.teamId);
  });

  it('alla 8 bästa-trea-slots är resolved och KOLLISIONSFRIA (varje trea en gång)', () => {
    const thirdTeams = state.matches
      .flatMap((m) => [m.home, m.away])
      .filter((s) => s.label.startsWith('3:a'))
      .map((s) => s.teamId);
    expect(thirdTeams).toHaveLength(8);
    expect(thirdTeams.every((t) => t !== null)).toBe(true);
    // Inga dubbletter: 8 distinkta treor seedade.
    expect(new Set(thirdTeams).size).toBe(8);
    // Alla 8 kommer från de kvalificerade grupperna A-H (treans id slutar på "3").
    for (const t of thirdTeams) {
      expect(['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3']).toContain(t);
    }
  });
});

describe('deriveBracket, SLUTSPELSRESULTAT propagerar vinnaren', () => {
  const tables = allComplete({
    A: 6,
    B: 6,
    C: 6,
    D: 6,
    E: 6,
    F: 6,
    G: 6,
    H: 6,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
  });

  /** Bygg slutspelsmatcherna och sätt ett finished-resultat på M73. */
  function matchesWithM73Result(
    homeGoals: number,
    awayGoals: number,
    penalties?: { homeGoals: number; awayGoals: number }
  ): Match[] {
    return ROUND_OF_32.map((m) => {
      if (m.id === 'M73') {
        const finished: Match = {
          id: 'M73',
          stage: 'round-of-32',
          groupId: null,
          homeTeamId: null,
          awayTeamId: null,
          kickoff: '2026-07-01T19:00:00Z',
          venue: 'Arena',
          status: 'finished',
          result: penalties ? { homeGoals, awayGoals, penalties } : { homeGoals, awayGoals },
        };
        return finished;
      }
      return knockoutMatch(m.id);
    });
  }

  it('en avgjord sextondelsfinal pekar ut winnerSlotId och propagerar laget till åttondelen', () => {
    // M73: Runner-up A (A2) mot Runner-up B (B2). 2-0 -> A2 vidare.
    const state = deriveBracket(tables, matchesWithM73Result(2, 0));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.winnerSlotId).toBe(m73.home.id); // hemma (A2) vann
    // M73:s vinnare matar M90-home (bracket-structure: M90 home = Winner M73).
    const m90 = state.matches.find((m) => m.matchId === 'M90')!;
    expect(m90.home.resolution).toBe('resolved');
    expect(m90.home.teamId).toBe('A2');
    expect(m90.home.label).toBe('Vinnare M73');
  });

  it('STRAFFAR avgör en lika sextondelsfinal (FIFA Art. 14), vinnaren propagerar', () => {
    // M73 1-1, straffar 2-4 -> bortalaget (B2) vidare.
    const state = deriveBracket(tables, matchesWithM73Result(1, 1, { homeGoals: 2, awayGoals: 4 }));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.winnerSlotId).toBe(m73.away.id); // borta (B2) vann på straffar
    const m90 = state.matches.find((m) => m.matchId === 'M90')!;
    expect(m90.home.teamId).toBe('B2');
  });

  it('en LIKA match UTAN avgörande straffar propagerar INGEN vinnare (fail-safe)', () => {
    // 1-1 utan penalties: kan inte avgöras, ingen gissning propageras.
    const state = deriveBracket(tables, matchesWithM73Result(1, 1));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.winnerSlotId).toBeNull();
    const m90 = state.matches.find((m) => m.matchId === 'M90')!;
    expect(m90.home.teamId).toBeNull();
  });
});

describe('deriveBracket, struktur + bronsmatch/final', () => {
  const state = deriveBracket(GROUP_IDS.map(inProgressTable), []);

  it('innehåller alla 32 slutspelsmatcher (M73-M104)', () => {
    expect(state.matches).toHaveLength(32);
  });

  it('bronsmatchen (M103) matas av semifinal-FÖRLORARNA (match-loser-etikett)', () => {
    const m103 = state.matches.find((m) => m.matchId === 'M103')!;
    expect(m103.home.label).toBe('Förlorare M101');
    expect(m103.away.label).toBe('Förlorare M102');
  });

  it('finalen (M104) matas av semifinal-vinnarna och har ingen nästa slot', () => {
    const m104 = state.matches.find((m) => m.matchId === 'M104')!;
    expect(m104.home.label).toBe('Vinnare M101');
    expect(m104.away.label).toBe('Vinnare M102');
    expect(m104.home.nextSlotId).toBeNull();
  });
});

describe('groupByRound', () => {
  const state = deriveBracket(GROUP_IDS.map(inProgressTable), []);
  const rounds = groupByRound(state);

  it('delar upp trädet i rundor i officiell progressions-ordning', () => {
    expect(rounds.map((r) => r.stage)).toEqual([
      'round-of-32',
      'round-of-16',
      'quarter-final',
      'semi-final',
      'final',
      'third-place',
    ]);
  });

  it('har rätt antal matcher per runda (16/8/4/2/1/1)', () => {
    expect(rounds.map((r) => r.matches.length)).toEqual([16, 8, 4, 2, 1, 1]);
  });

  it('har svenska rundrubriker', () => {
    expect(rounds[0].label).toBe('Sextondelsfinaler');
    expect(rounds.find((r) => r.stage === 'final')!.label).toBe('Final');
  });
});
