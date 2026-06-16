// Tester för de TABELL-härledda turneringsstatistik-aggregaten (T88, #180): clean sheets +
// skrällar (upsets). Härledda ur den RESOLVADE matchplanen (FinishedMatch med result) +
// lagens FIFA-ranking , inte ur live-events. Vi bygger Match-fixtures direkt (domän-typen),
// och en ranking-uppslagning injiceras (ren funktion, trivialt testbar).

import { describe, expect, it } from 'vitest';
import {
  aggregateCleanSheets,
  aggregateTeamScoreGoals,
  aggregateUpsets,
} from './tournament-stats-tables';
import type { Match, MatchResult } from '../../domain/types';

/** Bygg en FÄRDIGSPELAD match (status finished bär alltid result, per typgaranti). */
function finished(id: string, homeTeamId: string, awayTeamId: string, result: MatchResult): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId,
    awayTeamId,
    kickoff: '2026-06-11T19:00:00.000Z',
    venue: 'Test Arena, Test City, Testland',
    result,
    status: 'finished',
  };
}

/** En kommande match (inget resultat , ska aldrig räknas). */
function scheduled(id: string, homeTeamId: string, awayTeamId: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId,
    awayTeamId,
    kickoff: '2026-06-11T19:00:00.000Z',
    venue: 'Test Arena, Test City, Testland',
    result: null,
    status: 'scheduled',
  };
}

// Ranking-uppslag för testet: lägre tal = bättre lag (FIFA-ranking). Okänt lag -> null.
const RANK: Record<string, number> = { arg: 1, bra: 6, swe: 38, ksa: 61 };
const rankOf = (teamId: string): number | null => RANK[teamId] ?? null;

describe('aggregateCleanSheets , lag utan insläppt', () => {
  it('räknar en clean sheet för laget vars motståndare gjorde 0 mål', () => {
    const rows = aggregateCleanSheets([
      finished('m1', 'bra', 'swe', { homeGoals: 2, awayGoals: 0 }), // bra höll nollan
      finished('m2', 'arg', 'ksa', { homeGoals: 1, awayGoals: 1 }), // ingen nolla
    ]);
    const bra = rows.find((r) => r.teamId === 'bra');
    expect(bra?.cleanSheets).toBe(1);
    // Sverige släppte in 2 -> ingen clean sheet, ingen rad.
    expect(rows.find((r) => r.teamId === 'swe')).toBeUndefined();
  });

  it('en 0-0 ger BÅDA lagen en clean sheet', () => {
    const rows = aggregateCleanSheets([
      finished('m1', 'bra', 'swe', { homeGoals: 0, awayGoals: 0 }),
    ]);
    expect(rows.find((r) => r.teamId === 'bra')?.cleanSheets).toBe(1);
    expect(rows.find((r) => r.teamId === 'swe')?.cleanSheets).toBe(1);
  });

  it('aggregerar över flera matcher + räknar spelade matcher (rankas på flest nollor)', () => {
    const rows = aggregateCleanSheets([
      finished('m1', 'bra', 'swe', { homeGoals: 1, awayGoals: 0 }),
      finished('m2', 'bra', 'arg', { homeGoals: 0, awayGoals: 0 }),
    ]);
    const bra = rows.find((r) => r.teamId === 'bra');
    expect(bra?.cleanSheets).toBe(2);
    expect(bra?.played).toBe(2);
    expect(rows[0]?.teamId).toBe('bra'); // flest nollor överst
  });

  it('ignorerar matcher utan resultat (scheduled/live) och lag utan id', () => {
    const rows = aggregateCleanSheets([
      scheduled('m1', 'bra', 'swe'),
      finished('m2', null as unknown as string, 'swe', { homeGoals: 0, awayGoals: 0 }),
    ]);
    // scheduled hoppas; m2:s hemmalag saknar id -> bara bortalaget (swe) kan få nollan.
    expect(rows.find((r) => r.teamId === 'swe')?.cleanSheets).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it('tom data -> tom lista', () => {
    expect(aggregateCleanSheets([])).toEqual([]);
  });
});

describe('aggregateUpsets , skrällar (lågt rankat slår högt)', () => {
  it('en lägre rankad vinst räknas som skräll, gapet = rankning-skillnaden', () => {
    // ksa (61) slår arg (1): skräll med gap 60.
    const rows = aggregateUpsets(
      [finished('m1', 'ksa', 'arg', { homeGoals: 2, awayGoals: 1 })],
      rankOf
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.winnerTeamId).toBe('ksa');
    expect(rows[0]?.loserTeamId).toBe('arg');
    expect(rows[0]?.rankGap).toBe(60);
  });

  it('en HÖGRE rankad vinst är INGEN skräll (favoriten vann som väntat)', () => {
    const rows = aggregateUpsets(
      [finished('m1', 'arg', 'ksa', { homeGoals: 2, awayGoals: 0 })],
      rankOf
    );
    expect(rows).toEqual([]);
  });

  it('oavgjort är ingen skräll (ingen vinnare)', () => {
    const rows = aggregateUpsets(
      [finished('m1', 'ksa', 'arg', { homeGoals: 1, awayGoals: 1 })],
      rankOf
    );
    expect(rows).toEqual([]);
  });

  it('straffavgjord match: vinnaren avgörs av straffarna', () => {
    // Ordinarie 1-1, ksa (61) vinner på straffar mot arg (1) -> skräll.
    const rows = aggregateUpsets(
      [
        finished('m1', 'ksa', 'arg', {
          homeGoals: 1,
          awayGoals: 1,
          penalties: { homeGoals: 4, awayGoals: 3 },
        }),
      ],
      rankOf
    );
    expect(rows[0]?.winnerTeamId).toBe('ksa');
    expect(rows[0]?.rankGap).toBe(60);
  });

  it('ett lag utan känd ranking hoppas (gissa aldrig ett gap)', () => {
    const rows = aggregateUpsets(
      [finished('m1', 'xyz', 'arg', { homeGoals: 1, awayGoals: 0 })],
      rankOf
    );
    expect(rows).toEqual([]);
  });

  it('rankar skrällarna störst gap först', () => {
    const rows = aggregateUpsets(
      [
        finished('m1', 'swe', 'bra', { homeGoals: 1, awayGoals: 0 }), // swe 38 slår bra 6: gap 32
        finished('m2', 'ksa', 'arg', { homeGoals: 1, awayGoals: 0 }), // ksa 61 slår arg 1: gap 60
      ],
      rankOf
    );
    expect(rows.map((r) => r.rankGap)).toEqual([60, 32]);
  });

  it('ignorerar matcher utan resultat (scheduled/live)', () => {
    expect(aggregateUpsets([scheduled('m1', 'ksa', 'arg')], rankOf)).toEqual([]);
  });
});

describe('aggregateTeamScoreGoals , lag-mål + turnerings-mål ur OFFICIELLT facit (G3, T100)', () => {
  it('krediterar varje lags mål ur slutresultatet (hemma: home_goals, borta: away_goals)', () => {
    const result = aggregateTeamScoreGoals([
      finished('m1', 'ger', 'cuw', { homeGoals: 7, awayGoals: 1 }),
      finished('m2', 'swe', 'tun', { homeGoals: 5, awayGoals: 1 }),
    ]);
    const ger = result.teams.find((t) => t.teamId === 'ger');
    const cuw = result.teams.find((t) => t.teamId === 'cuw');
    const swe = result.teams.find((t) => t.teamId === 'swe');
    expect(ger?.goals).toBe(7);
    expect(cuw?.goals).toBe(1);
    expect(swe?.goals).toBe(5);
    // Rankas på flest mål: Tyskland (7) före Sverige (5).
    expect(result.teams[0]?.teamId).toBe('ger');
    expect(result.teams[1]?.teamId).toBe('swe');
  });

  it('en 0-0 RÄKNAS som spelad match (matchesPlayed + lagens matches), 0 mål', () => {
    const result = aggregateTeamScoreGoals([
      finished('m1', 'esp', 'cpv', { homeGoals: 0, awayGoals: 0 }),
    ]);
    expect(result.matchesPlayed).toBe(1);
    expect(result.totalGoals).toBe(0);
    expect(result.goalAverage).toBe(0);
    // Bägge lag har en spelad match med 0 mål (raden finns med goals=0, played=1).
    expect(result.teams.find((t) => t.teamId === 'esp')).toEqual({
      teamId: 'esp',
      goals: 0,
      matches: 1,
    });
    expect(result.teams.find((t) => t.teamId === 'cpv')?.matches).toBe(1);
    // En 0-0 är ingen "stor match" att lyfta fram.
    expect(result.biggestMatch).toBeNull();
  });

  it('summerar ett lags mål över FLERA matcher + räknar dess matcher', () => {
    const result = aggregateTeamScoreGoals([
      finished('m1', 'ger', 'cuw', { homeGoals: 7, awayGoals: 1 }), // ger 7
      finished('m2', 'esp', 'ger', { homeGoals: 1, awayGoals: 2 }), // ger 2 (borta)
    ]);
    const ger = result.teams.find((t) => t.teamId === 'ger');
    expect(ger?.goals).toBe(9);
    expect(ger?.matches).toBe(2);
  });

  it('oavgjort (draw) krediterar bägge lag sina mål', () => {
    const result = aggregateTeamScoreGoals([
      finished('m1', 'ned', 'jpn', { homeGoals: 2, awayGoals: 2 }),
    ]);
    expect(result.teams.find((t) => t.teamId === 'ned')?.goals).toBe(2);
    expect(result.teams.find((t) => t.teamId === 'jpn')?.goals).toBe(2);
    expect(result.totalGoals).toBe(4);
  });

  it('egenmål i slutresultatet räknas till det gynnade laget (scorelinen ÄR sanningen, G3)', () => {
    // Ett egenmål är redan inräknat i slutsiffran (1-0 vunnet på ett egenmål). Vi gör INGEN
    // egenmåls-justering här , till skillnad från den gamla events-varianten , scorelinen sätter
    // sanningen. Laget som tjänade på egenmålet får sitt mål, motståndaren 0.
    const result = aggregateTeamScoreGoals([
      finished('m1', 'bra', 'mar', { homeGoals: 1, awayGoals: 0 }),
    ]);
    expect(result.teams.find((t) => t.teamId === 'bra')?.goals).toBe(1);
    expect(result.totalGoals).toBe(1);
  });

  it('biggestMatch = den färdiga matchen med högst total scoreline (g-E-1 7-1)', () => {
    const result = aggregateTeamScoreGoals([
      finished('g-D-1', 'usa', 'par', { homeGoals: 4, awayGoals: 1 }), // total 5
      finished('g-E-1', 'ger', 'cuw', { homeGoals: 7, awayGoals: 1 }), // total 8
      finished('g-F-2', 'swe', 'tun', { homeGoals: 5, awayGoals: 1 }), // total 6
    ]);
    expect(result.biggestMatch?.matchId).toBe('g-E-1');
    expect(result.biggestMatch?.homeTeamId).toBe('ger');
    expect(result.biggestMatch?.awayTeamId).toBe('cuw');
    expect(result.biggestMatch?.homeGoals).toBe(7);
    expect(result.biggestMatch?.awayGoals).toBe(1);
    expect(result.biggestMatch?.total).toBe(8);
  });

  it('vid lika total scoreline vinner lägst match-id (stabil ordning)', () => {
    const result = aggregateTeamScoreGoals([
      finished('g-B-1', 'can', 'bih', { homeGoals: 2, awayGoals: 1 }), // total 3
      finished('g-A-2', 'kor', 'cze', { homeGoals: 2, awayGoals: 1 }), // total 3, lägre id
    ]);
    expect(result.biggestMatch?.matchId).toBe('g-A-2');
  });

  it('matchesPlayed/total/snitt: tom data -> 0 (ingen division med noll)', () => {
    const empty = aggregateTeamScoreGoals([]);
    expect(empty.matchesPlayed).toBe(0);
    expect(empty.totalGoals).toBe(0);
    expect(empty.goalAverage).toBe(0);
    expect(empty.biggestMatch).toBeNull();
    expect(empty.teams).toEqual([]);
  });

  it('ignorerar matcher utan resultat (scheduled/live) , de spelades inte', () => {
    const result = aggregateTeamScoreGoals([scheduled('m1', 'ger', 'cuw')]);
    expect(result.matchesPlayed).toBe(0);
    expect(result.teams).toEqual([]);
    expect(result.biggestMatch).toBeNull();
  });

  it('ett lag utan id (oseedad slutspelsmatch) hoppas för den sidan men målen räknas i totalen', () => {
    const result = aggregateTeamScoreGoals([
      finished('m1', null as unknown as string, 'cuw', { homeGoals: 2, awayGoals: 1 }),
    ]);
    // Hemmalaget saknar id -> ingen lag-rad för det, men totalen + bortalaget räknas.
    expect(result.teams.find((t) => t.teamId === 'cuw')?.goals).toBe(1);
    expect(result.teams).toHaveLength(1);
    expect(result.totalGoals).toBe(3);
    // Saknar BÅDA lag-id krävs för biggestMatch -> denna match exkluderas ur "Flest mål i en match".
    expect(result.biggestMatch).toBeNull();
  });

  it('NEGATIV-KONTROLL (T100 buggen): facit-källan ser matcher som event-lagret MISSAR', () => {
    // Detta LÅSER T100-fixen. Den verkliga buggen: events-lagret (match_live_data) saknade en rad
    // för g-E-1 (7-1), så den events-härledda "Flest mål per lag" missade Tysklands 7 mål och
    // visade fel lag som etta. Här bevisar vi att facit-aggregatorn SER g-E-1 och placerar
    // 7-måls-laget överst. De 7 "event-täckta" matcherna (g-F-2 m.fl.) räcker INTE för rätt svar.
    const eventCoveredOnly: Match[] = [
      finished('g-F-2', 'swe', 'tun', { homeGoals: 5, awayGoals: 1 }), // 7-matchers-subsetets toppmål
    ];
    const fullFacit: Match[] = [
      ...eventCoveredOnly,
      finished('g-E-1', 'ger', 'cuw', { homeGoals: 7, awayGoals: 1 }), // SAKNAS i event-subsetet
    ];

    const subsetResult = aggregateTeamScoreGoals(eventCoveredOnly);
    expect(subsetResult.teams[0]?.teamId).toBe('swe'); // bara subset -> Sverige (5) överst (buggen)

    const facitResult = aggregateTeamScoreGoals(fullFacit);
    expect(facitResult.teams[0]?.teamId).toBe('ger'); // hela facit -> Tyskland (7) överst (fixen)
    expect(facitResult.teams[0]?.goals).toBe(7);
    expect(facitResult.biggestMatch?.matchId).toBe('g-E-1');
  });

  it('reproducerar prod-helheten: 16 matcher -> total 46, snitt 2,875, ger 7 överst', () => {
    // GROUND TRUTH (verifierad via Supabase MCP 2026-06-16, official_match_results): de 16 färdiga
    // matchernas slutresultat + lag ur matchschemat (src/data/wc2026/matches.ts). Vi bygger exakt
    // dessa och bevisar att aggregatorn reproducerar facit-siffrorna ända ut.
    const matches: Match[] = [
      finished('g-E-1', 'ger', 'cuw', { homeGoals: 7, awayGoals: 1 }),
      finished('g-F-2', 'swe', 'tun', { homeGoals: 5, awayGoals: 1 }),
      finished('g-D-1', 'usa', 'par', { homeGoals: 4, awayGoals: 1 }),
      finished('g-F-1', 'ned', 'jpn', { homeGoals: 2, awayGoals: 2 }),
      finished('g-G-2', 'irn', 'nzl', { homeGoals: 2, awayGoals: 2 }),
      finished('g-A-2', 'kor', 'cze', { homeGoals: 2, awayGoals: 1 }),
      finished('g-A-1', 'mex', 'rsa', { homeGoals: 2, awayGoals: 0 }),
      finished('g-B-1', 'can', 'bih', { homeGoals: 1, awayGoals: 1 }),
      finished('g-B-2', 'qat', 'sui', { homeGoals: 1, awayGoals: 1 }),
      finished('g-C-1', 'bra', 'mar', { homeGoals: 1, awayGoals: 1 }),
      finished('g-D-2', 'aus', 'tur', { homeGoals: 2, awayGoals: 0 }),
      finished('g-G-1', 'bel', 'egy', { homeGoals: 1, awayGoals: 1 }),
      finished('g-H-2', 'ksa', 'uru', { homeGoals: 1, awayGoals: 1 }),
      finished('g-C-2', 'hai', 'sco', { homeGoals: 0, awayGoals: 1 }),
      finished('g-E-2', 'civ', 'ecu', { homeGoals: 1, awayGoals: 0 }),
      finished('g-H-1', 'esp', 'cpv', { homeGoals: 0, awayGoals: 0 }),
    ];
    const result = aggregateTeamScoreGoals(matches);
    expect(result.matchesPlayed).toBe(16);
    expect(result.totalGoals).toBe(46);
    expect(result.goalAverage).toBeCloseTo(2.875, 4);
    expect(result.teams[0]).toEqual({ teamId: 'ger', goals: 7, matches: 1 });
    expect(result.teams[1]).toEqual({ teamId: 'swe', goals: 5, matches: 1 });
    expect(result.teams[2]).toEqual({ teamId: 'usa', goals: 4, matches: 1 });
    expect(result.biggestMatch).toMatchObject({ matchId: 'g-E-1', total: 8 });
  });
});
