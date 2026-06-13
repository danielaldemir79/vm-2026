// Tester för den PERSONLIGA TIPS-STATISTIKEN (T23, #23). Bevisar definitionerna OCH
// deras edge-fall/fel-vägar: inga tips, inga avgjorda matcher än, allt miss, blandat,
// bästa call + dess tiebreak. Härledningen delar score.ts-poängvägen med topplistan,
// så testerna vaktar att statistiken speglar samma poäng-sanning.

import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import type { Prediction } from '../../data/predictions';
import { derivePersonalStats } from './personal-stats';

// ---- Testdata-fabriker (minsta giltiga former) -------------------------------

const USER = 'u1';

function finished(id: string, homeGoals: number, awayGoals: number, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'bra',
    awayTeamId: 'bih',
    kickoff,
    venue: 'Test Arena',
    status: 'finished',
    result: { homeGoals, awayGoals },
  };
}

function scheduled(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'bra',
    awayTeamId: 'bih',
    kickoff,
    venue: 'Test Arena',
    status: 'scheduled',
    result: null,
  };
}

function tip(matchId: string, homeGoals: number, awayGoals: number): Prediction {
  return { matchId, userId: USER, homeGoals, awayGoals, updatedAt: '2026-06-01T00:00:00.000Z' };
}

// ---- EDGE: inga tips ---------------------------------------------------------

describe('derivePersonalStats, edge-fall', () => {
  it('inga tips alls -> allt 0, accuracy null, bestCall null (ingen falsk 0 %)', () => {
    const matches = [finished('m1', 2, 0, '2026-06-11T18:00:00Z')];
    const stats = derivePersonalStats([], matches);
    expect(stats).toEqual({
      decidedTips: 0,
      exactHits: 0,
      outcomeHits: 0,
      misses: 0,
      accuracy: null,
      bestCall: null,
    });
  });

  it('tips finns men INGA avgjorda matcher än -> 0 avgjorda, accuracy null, bestCall null', () => {
    // Matchen är schemalagd (inget facit) -> tippet räknas inte än.
    const matches = [scheduled('m1', '2026-06-11T18:00:00Z')];
    const stats = derivePersonalStats([tip('m1', 2, 0)], matches);
    expect(stats.decidedTips).toBe(0);
    expect(stats.accuracy).toBeNull();
    expect(stats.bestCall).toBeNull();
  });

  it('ett tips på en match som inte finns i listan ignoreras (ingen krasch, 0 avgjorda)', () => {
    const stats = derivePersonalStats(
      [tip('saknas', 1, 0)],
      [finished('m1', 0, 0, '2026-06-11T18:00:00Z')]
    );
    expect(stats.decidedTips).toBe(0);
  });

  it('ALLT miss -> accuracy 0 (inte null), bestCall null', () => {
    const matches = [
      finished('m1', 2, 0, '2026-06-11T18:00:00Z'), // hemmavinst
      finished('m2', 0, 3, '2026-06-12T18:00:00Z'), // bortavinst
    ];
    const preds = [
      tip('m1', 0, 2), // tippade bortavinst, fel utfall -> miss
      tip('m2', 2, 0), // tippade hemmavinst, fel utfall -> miss
    ];
    const stats = derivePersonalStats(preds, matches);
    expect(stats.decidedTips).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.exactHits).toBe(0);
    expect(stats.outcomeHits).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(stats.bestCall).toBeNull();
  });
});

// ---- Räkning + träffsäkerhet -------------------------------------------------

describe('derivePersonalStats, räkning + träffsäkerhet', () => {
  it('klassar exakt / rätt utfall / miss och räknar träffsäkerhet som andel poäng-givande', () => {
    const matches = [
      finished('m1', 2, 0, '2026-06-11T18:00:00Z'),
      finished('m2', 1, 0, '2026-06-12T18:00:00Z'),
      finished('m3', 0, 2, '2026-06-13T18:00:00Z'),
      finished('m4', 1, 1, '2026-06-14T18:00:00Z'),
    ];
    const preds = [
      tip('m1', 2, 0), // exakt
      tip('m2', 3, 1), // rätt utfall (hemmavinst), ej exakt
      tip('m3', 2, 0), // miss (tippade hemmavinst, blev bortavinst)
      tip('m4', 0, 0), // rätt utfall (oavgjort), ej exakt
    ];
    const stats = derivePersonalStats(preds, matches);
    expect(stats.decidedTips).toBe(4);
    expect(stats.exactHits).toBe(1);
    expect(stats.outcomeHits).toBe(2);
    expect(stats.misses).toBe(1);
    // 3 av 4 gav poäng -> 0.75.
    expect(stats.accuracy).toBe(0.75);
  });

  it('en otippad avgjord match räknas INTE (statistiken bedömer medlemmens tips)', () => {
    const matches = [
      finished('m1', 2, 0, '2026-06-11T18:00:00Z'),
      finished('m2', 1, 0, '2026-06-12T18:00:00Z'),
    ];
    // Bara m1 tippad.
    const stats = derivePersonalStats([tip('m1', 2, 0)], matches);
    expect(stats.decidedTips).toBe(1);
    expect(stats.exactHits).toBe(1);
    expect(stats.accuracy).toBe(1);
  });
});

// ---- BÄSTA CALL (tiebreak) ---------------------------------------------------

describe('derivePersonalStats, bästa call', () => {
  it('väljer det enskilda tips som gav HÖGST poäng (exakt slår rätt utfall)', () => {
    const matches = [
      finished('m1', 1, 0, '2026-06-11T18:00:00Z'), // exakt-tippad nedan -> 3p
      finished('m2', 2, 1, '2026-06-12T18:00:00Z'), // rätt-utfall-tippad -> 1p
    ];
    const preds = [tip('m1', 1, 0), tip('m2', 3, 0)];
    const best = derivePersonalStats(preds, matches).bestCall;
    expect(best).not.toBeNull();
    expect(best?.matchId).toBe('m1');
    expect(best?.pointType).toBe('exact');
    expect(best?.points).toBe(3);
    // Bär lagens id:n (för matchup-rubriken i UI:t), ur den faktiska matchen.
    expect(best?.homeTeamId).toBe('bra');
    expect(best?.awayTeamId).toBe('bih');
  });

  it('ett FELTIPS (miss, 0p) kan aldrig bli bästa call', () => {
    const matches = [
      finished('m1', 1, 0, '2026-06-11T18:00:00Z'), // tippas exakt -> 3p
      finished('m2', 0, 2, '2026-06-12T18:00:00Z'), // tippas fel -> 0p (miss)
    ];
    const preds = [tip('m1', 1, 0), tip('m2', 2, 0)];
    const best = derivePersonalStats(preds, matches).bestCall;
    expect(best?.matchId).toBe('m1');
    expect(best?.points).toBe(3);
  });

  it('vid LIKA poäng vinner den TIDIGASTE matchen (stabil tiebreak)', () => {
    const matches = [
      finished('sen', 1, 0, '2026-06-15T18:00:00Z'), // exakt, senare
      finished('tidig', 2, 0, '2026-06-11T18:00:00Z'), // exakt, tidigare
    ];
    const preds = [tip('sen', 1, 0), tip('tidig', 2, 0)];
    const best = derivePersonalStats(preds, matches).bestCall;
    expect(best?.matchId).toBe('tidig');
  });
});
