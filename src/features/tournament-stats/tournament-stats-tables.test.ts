// Tester för de TABELL-härledda turneringsstatistik-aggregaten (T88, #180): clean sheets +
// skrällar (upsets). Härledda ur den RESOLVADE matchplanen (FinishedMatch med result) +
// lagens FIFA-ranking , inte ur live-events. Vi bygger Match-fixtures direkt (domän-typen),
// och en ranking-uppslagning injiceras (ren funktion, trivialt testbar).

import { describe, expect, it } from 'vitest';
import { aggregateCleanSheets, aggregateUpsets } from './tournament-stats-tables';
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
