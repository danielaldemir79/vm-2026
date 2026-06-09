import { describe, expect, it } from 'vitest';
import { computeStandings } from './compute-standings';
import type { Match, MatchResult } from '../types';

// Testhjälpare: bygg en färdigspelad gruppmatch kort och läsbart. Bara fälten
// som tabellberäkningen bryr sig om varierar per test, resten är konstanter.
let matchCounter = 0;
function groupMatch(
  homeTeamId: string,
  awayTeamId: string,
  homeGoals: number,
  awayGoals: number
): Match {
  matchCounter += 1;
  const result: MatchResult = { homeGoals, awayGoals };
  return {
    id: `m${matchCounter}`,
    stage: 'group',
    groupId: 'A',
    homeTeamId,
    awayTeamId,
    kickoff: '2026-06-12T18:00:00Z',
    venue: 'Testarena',
    result,
    status: 'finished',
  };
}

/** Bekvämlighet: slå upp en lag-rad i en beräknad tabell. */
function row(standings: ReturnType<typeof computeStandings>, teamId: string) {
  const found = standings.find((s) => s.teamId === teamId);
  if (!found) {
    throw new Error(`Förväntade en rad för ${teamId}`);
  }
  return found;
}

describe('computeStandings, grundläggande poäng- och målräkning', () => {
  it('räknar vinst (3p), oavgjort (1p) och förlust (0p) korrekt', () => {
    const teams = ['SWE', 'BRA', 'ARG', 'GER'];
    const matches = [
      groupMatch('SWE', 'BRA', 2, 1), // SWE vinner
      groupMatch('ARG', 'GER', 0, 0), // oavgjort
    ];

    const table = computeStandings(teams, matches);

    expect(row(table, 'SWE').points).toBe(3);
    expect(row(table, 'SWE').won).toBe(1);
    expect(row(table, 'BRA').points).toBe(0);
    expect(row(table, 'BRA').lost).toBe(1);
    expect(row(table, 'ARG').points).toBe(1);
    expect(row(table, 'ARG').drawn).toBe(1);
    expect(row(table, 'GER').points).toBe(1);
  });

  it('summerar gjorda/insläppta mål och målskillnad (GM/IM/MS)', () => {
    const teams = ['SWE', 'BRA'];
    const matches = [groupMatch('SWE', 'BRA', 3, 1)];

    const table = computeStandings(teams, matches);

    const swe = row(table, 'SWE');
    expect(swe.goalsFor).toBe(3);
    expect(swe.goalsAgainst).toBe(1);
    expect(swe.goalDifference).toBe(2);

    const bra = row(table, 'BRA');
    expect(bra.goalsFor).toBe(1);
    expect(bra.goalsAgainst).toBe(3);
    expect(bra.goalDifference).toBe(-2);
  });

  it('ger en rad per lag och sätter 1-baserad rank i sorterad ordning', () => {
    const teams = ['SWE', 'BRA', 'ARG', 'GER'];
    const matches = [
      groupMatch('SWE', 'BRA', 1, 0),
      groupMatch('ARG', 'GER', 1, 0),
      groupMatch('SWE', 'ARG', 1, 0),
    ];

    const table = computeStandings(teams, matches);

    expect(table).toHaveLength(4);
    // SWE 2 vinster -> rank 1.
    expect(table[0].teamId).toBe('SWE');
    expect(table[0].rank).toBe(1);
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe('computeStandings, edge-fall: tomma och ofullständiga grupper', () => {
  it('inga matcher spelade ger en noll-rad per lag (alla nollor)', () => {
    const teams = ['SWE', 'BRA', 'ARG', 'GER'];

    const table = computeStandings(teams, []);

    expect(table).toHaveLength(4);
    for (const r of table) {
      expect(r.played).toBe(0);
      expect(r.won).toBe(0);
      expect(r.drawn).toBe(0);
      expect(r.lost).toBe(0);
      expect(r.goalsFor).toBe(0);
      expect(r.goalsAgainst).toBe(0);
      expect(r.goalDifference).toBe(0);
      expect(r.points).toBe(0);
    }
    // Alla lika -> stabil fallback på teamId (deterministisk, ej FIFA-tiebreak).
    expect(table.map((r) => r.teamId)).toEqual(['ARG', 'BRA', 'GER', 'SWE']);
  });

  it('tom grupp utan lag ger en tom tabell', () => {
    expect(computeStandings([], [])).toEqual([]);
  });

  it('ofullständig grupp: bara spelade matcher räknas, övriga lag står på noll', () => {
    const teams = ['SWE', 'BRA', 'ARG', 'GER'];
    // Bara en av sex gruppmatcher spelad.
    const matches = [groupMatch('SWE', 'BRA', 2, 0)];

    const table = computeStandings(teams, matches);

    expect(row(table, 'SWE').played).toBe(1);
    expect(row(table, 'BRA').played).toBe(1);
    // ARG och GER har inte spelat än.
    expect(row(table, 'ARG').played).toBe(0);
    expect(row(table, 'GER').played).toBe(0);
  });
});

describe('computeStandings, fel-vägar: ogiltiga/ofullständiga matcher ignoreras', () => {
  it('matcher utan resultat (null) räknas inte in', () => {
    const teams = ['SWE', 'BRA'];
    const scheduled: Match = {
      id: 'future',
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'SWE',
      awayTeamId: 'BRA',
      kickoff: '2026-06-20T18:00:00Z',
      venue: 'Testarena',
      result: null,
      status: 'scheduled',
    };

    const table = computeStandings(teams, [scheduled]);

    expect(row(table, 'SWE').played).toBe(0);
    expect(row(table, 'BRA').played).toBe(0);
  });

  it('match med okänt lag (utanför teamIds) hoppas över utan att krascha', () => {
    const teams = ['SWE', 'BRA'];
    // FRA är inte med i gruppen, matchen ska inte påverka tabellen.
    const matches = [groupMatch('SWE', 'FRA', 5, 0)];

    const table = computeStandings(teams, matches);

    expect(row(table, 'SWE').played).toBe(0);
    expect(row(table, 'BRA').played).toBe(0);
    // FRA ska inte få en rad, den hör inte till gruppen.
    expect(table.map((r) => r.teamId).sort()).toEqual(['BRA', 'SWE']);
  });

  it('slutspelsmatch med okänt lag (null homeTeamId) räknas inte in', () => {
    const teams = ['SWE', 'BRA'];
    const bracketMatch: Match = {
      id: 'r32',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: null, // ännu inte seedat (T4)
      awayTeamId: 'SWE',
      kickoff: '2026-06-28T18:00:00Z',
      venue: 'Testarena',
      result: { homeGoals: 1, awayGoals: 0 },
      status: 'finished',
    };

    const table = computeStandings(teams, [bracketMatch]);

    expect(row(table, 'SWE').played).toBe(0);
  });
});

describe('computeStandings, tiebreak: lika poäng löses i FIFA-ordning', () => {
  it('lika poäng löses av TOTAL målskillnad när inbördes ej skiljer', () => {
    // Tre lag, två står lika på poäng efter olika motstånd. Vi konstruerar så
    // att inbördes inte spelats mellan de lika (de mötte ett tredje lag), så
    // total målskillnad (kriterium 5) avgör.
    const teams = ['AAA', 'BBB', 'CCC'];
    const matches = [
      groupMatch('AAA', 'CCC', 3, 0), // AAA: 3p, MS +3
      groupMatch('BBB', 'CCC', 1, 0), // BBB: 3p, MS +1
    ];

    const table = computeStandings(teams, matches);

    // AAA och BBB båda 3p, AAA bättre total MS -> AAA före BBB.
    expect(table[0].teamId).toBe('AAA');
    expect(table[1].teamId).toBe('BBB');
  });

  it('lika poäng OCH lika total MS löses av totalt gjorda mål', () => {
    const teams = ['AAA', 'BBB', 'CCC'];
    const matches = [
      groupMatch('AAA', 'CCC', 2, 1), // AAA: 3p, MS +1, GM 2
      groupMatch('BBB', 'CCC', 1, 0), // BBB: 3p, MS +1, GM 1
    ];

    const table = computeStandings(teams, matches);

    // Lika poäng, lika MS (+1), AAA fler gjorda mål -> AAA före BBB.
    expect(table[0].teamId).toBe('AAA');
    expect(table[1].teamId).toBe('BBB');
  });

  it('INBÖRDES (2-lags) går FÖRE total målskillnad, VM 2026-ändringens kärn-nyans', () => {
    // Kärn-nyansen i VM 2026: head-to-head kommer FÖRE total MS (ändring mot
    // tidigare mästerskap). För att isolera en REN 2-lags-tiebreak behövs ett
    // fjärde lag så att EXAKT AAA och BBB hamnar lika på poäng (annars blir det
    // en 3-lags-tie där inbördes-mini-tabellen ser annorlunda ut).
    //
    // Fyra lag. AAA och BBB ska sluta lika på poäng, BBB med bättre TOTAL MS,
    // men AAA vann det inbördes mötet -> AAA ska rankas före BBB (FIFA 2026).
    //
    //   AAA: vinst mot BBB (1-0), vinst mot DDD (1-0), förlust mot CCC (0-3)
    //        -> 6p, total MS -1, GM 2
    //   BBB: förlust mot AAA (0-1), vinst mot CCC (3-0), vinst mot DDD (3-0)
    //        -> 6p, total MS +5, GM 6
    //   CCC: vinst mot AAA (3-0), förlust mot BBB (0-3), ... -> 3p
    //   DDD: förluster -> 0p
    // AAA (6p) och BBB (6p) lika på poäng. BBB klart bättre TOTAL MS (+5 vs -1),
    // men AAA vann inbördes (1-0) -> inbördes går före total MS -> AAA före BBB.
    const teams = ['AAA', 'BBB', 'CCC', 'DDD'];
    const matches = [
      groupMatch('AAA', 'BBB', 1, 0), // inbördes: AAA slår BBB
      groupMatch('AAA', 'DDD', 1, 0),
      groupMatch('CCC', 'AAA', 3, 0),
      groupMatch('BBB', 'CCC', 3, 0),
      groupMatch('BBB', 'DDD', 3, 0),
    ];

    const table = computeStandings(teams, matches);

    const aaa = row(table, 'AAA');
    const bbb = row(table, 'BBB');
    // Förutsättningarna stämmer: lika poäng, BBB bättre TOTAL MS.
    expect(aaa.points).toBe(6);
    expect(bbb.points).toBe(6);
    expect(bbb.goalDifference).toBeGreaterThan(aaa.goalDifference);
    // Utfallet: inbördes (AAA slog BBB) går FÖRE total MS i VM 2026 -> AAA före.
    expect(table.findIndex((r) => r.teamId === 'AAA')).toBeLessThan(
      table.findIndex((r) => r.teamId === 'BBB')
    );
  });

  it('3-lags-tie: inbördes-mini-tabellens MS avgör (= total MS när alla tre är lika)', () => {
    // När ALLA tre lag står lika på poäng är inbördes-tabellen lika med hela
    // tabellen (alla matcher är inbördes). Då avgör inbördes-MS, vilket här
    // sammanfaller med total MS. Detta dokumenterar att 3-lags-fallet beräknas
    // på rätt mängd matcher (mini-tabell över de likställda), inte fel.
    //
    //   AAA slår BBB 1-0, BBB slår CCC 4-0, CCC slår AAA 1-0 -> alla 3p.
    //   Inbördes/total MS: AAA 0, BBB +3, CCC -3 -> BBB, AAA, CCC.
    const teams = ['AAA', 'BBB', 'CCC'];
    const matches = [
      groupMatch('AAA', 'BBB', 1, 0),
      groupMatch('BBB', 'CCC', 4, 0),
      groupMatch('CCC', 'AAA', 1, 0),
    ];

    const table = computeStandings(teams, matches);

    expect(table.map((r) => r.teamId)).toEqual(['BBB', 'AAA', 'CCC']);
  });

  it('inbördes tiebreak mellan 2 lag (de vann/förlorade mot varandra)', () => {
    // AAA och BBB lika på allt totalt, men AAA vann inbördes -> AAA före BBB.
    // AAA: vinst mot BBB (2-1) + förlust mot CCC (0-1) = 3p, MS 0, GM 2.
    // BBB: förlust mot AAA (1-2) + vinst mot CCC (1-0) = 3p, MS 0, GM 2.
    // Total MS lika (0), totalt GM lika (2). Inbördes: AAA vann -> AAA före.
    const teams = ['AAA', 'BBB', 'CCC'];
    const matches = [
      groupMatch('AAA', 'BBB', 2, 1),
      groupMatch('CCC', 'AAA', 1, 0),
      groupMatch('BBB', 'CCC', 1, 0),
    ];

    const table = computeStandings(teams, matches);

    expect(table.findIndex((r) => r.teamId === 'AAA')).toBeLessThan(
      table.findIndex((r) => r.teamId === 'BBB')
    );
  });

  it('inbördes tiebreak mellan 3 lag (mini-tabell över de likställda)', () => {
    // Tre lag exakt lika på poäng totalt (alla 3p). Inbördes mini-tabell ska
    // skilja dem. Vi bygger en cykel-bruten konstruktion där inbördes-resultaten
    // ger en tydlig ordning.
    //
    // Alla tre möts (en match var inbördes), plus en match mot ett fjärde lag
    // för att hålla poängen lika på 3 ENBART via inbördes? Nej, enklare: bara
    // de tre lagen, varje par möts en gång (3 matcher). Då ÄR alla matcher
    // inbördes, och mini-tabellen = hela tabellen. Vi gör resultaten så att:
    //   AAA slår BBB 1-0, BBB slår CCC 1-0, CCC slår AAA 1-0  (perfekt cykel)
    // Alla får 3p, MS 0, GM 1, IM 1. Inbördes = total här, fortfarande helt
    // lika -> stabil fallback på teamId (AAA, BBB, CCC).
    const teams = ['AAA', 'BBB', 'CCC'];
    const matches = [
      groupMatch('AAA', 'BBB', 1, 0),
      groupMatch('BBB', 'CCC', 1, 0),
      groupMatch('CCC', 'AAA', 1, 0),
    ];

    const table = computeStandings(teams, matches);

    // Perfekt cykel: helt lika -> deterministisk stabil ordning på teamId.
    expect(table.map((r) => r.teamId)).toEqual(['AAA', 'BBB', 'CCC']);
    for (const r of table) {
      expect(r.points).toBe(3);
      expect(r.goalDifference).toBe(0);
    }
  });

  it('inbördes mellan 3 lag med ASYMMETRISKT resultat ger korrekt inbördes-ordning', () => {
    // Tre lag, bara de tre, men resultaten ger olika inbördes-målskillnad.
    //   AAA slår BBB 2-0, AAA slår CCC 0-0? Nej, vi vill alla på samma poäng.
    // Konstruktion: alla tre slutar på 3p men med olika inbördes-MS.
    //   AAA: slår BBB 3-0, förlorar mot CCC 0-1  -> 3p, inbördes-MS +2
    //   BBB: slår CCC 2-0, förlorar mot AAA 0-3  -> 3p, inbördes-MS -1
    //   CCC: slår AAA 1-0, förlorar mot BBB 0-2  -> 3p, inbördes-MS -1
    // Inbördes-MS: AAA +2 (etta). BBB och CCC båda -1, inbördes gjorda mål:
    //   BBB gjorde 2, CCC gjorde 1 inbördes -> BBB före CCC.
    const teams = ['AAA', 'BBB', 'CCC'];
    const matches = [
      groupMatch('AAA', 'BBB', 3, 0),
      groupMatch('CCC', 'AAA', 1, 0),
      groupMatch('BBB', 'CCC', 2, 0),
    ];

    const table = computeStandings(teams, matches);

    expect(table.map((r) => r.teamId)).toEqual(['AAA', 'BBB', 'CCC']);
  });
});

describe('computeStandings, determinism och renhet', () => {
  it('är ren: muterar inte input-matcherna', () => {
    const teams = ['SWE', 'BRA'];
    const matches = [groupMatch('SWE', 'BRA', 2, 1)];
    const snapshot = JSON.stringify(matches);

    computeStandings(teams, matches);

    expect(JSON.stringify(matches)).toBe(snapshot);
  });

  it('ger identiskt resultat vid upprepade anrop (idempotent/deterministisk)', () => {
    const teams = ['SWE', 'BRA', 'ARG', 'GER'];
    const matches = [
      groupMatch('SWE', 'BRA', 1, 1),
      groupMatch('ARG', 'GER', 2, 0),
      groupMatch('SWE', 'ARG', 0, 0),
    ];

    const first = computeStandings(teams, matches);
    const second = computeStandings(teams, matches);

    expect(second).toEqual(first);
  });

  it('är oberoende av lagens ordning i teamIds (stabil sortering avgör)', () => {
    const matches = [groupMatch('SWE', 'BRA', 1, 0), groupMatch('ARG', 'GER', 1, 0)];

    const a = computeStandings(['SWE', 'BRA', 'ARG', 'GER'], matches);
    const b = computeStandings(['GER', 'ARG', 'BRA', 'SWE'], matches);

    expect(b.map((r) => r.teamId)).toEqual(a.map((r) => r.teamId));
  });
});
