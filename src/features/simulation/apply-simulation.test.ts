import { describe, expect, it } from 'vitest';
import type { FinishedMatch, Match, ScheduledMatch } from '../../domain/types';
import { applySimulationOverlay, EMPTY_OVERLAY } from './apply-simulation';

// Den rena overlay-sammanvävningen (T12). Testar ISOLERINGEN (riktig data rörs
// aldrig), BLANDA-fallet (riktig + hypotetisk samtidigt), ordnings-bevarande,
// och fel-vägen (overlay-nyckel utan riktig match = fail loud).

/** En schemalagd gruppmatch (utan resultat) för id `id`, lag a vs b. */
function scheduled(id: string, home: string, away: string): ScheduledMatch {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-11T18:00:00Z',
    venue: 'Test Arena',
    status: 'scheduled',
    result: null,
  };
}

/** En färdigspelad variant av samma match (för att bygga en hypotetisk overlay-post). */
function finished(id: string, home: string, away: string, h: number, a: number): FinishedMatch {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-11T18:00:00Z',
    venue: 'Test Arena',
    status: 'finished',
    result: { homeGoals: h, awayGoals: a },
  };
}

describe('applySimulationOverlay, tom overlay', () => {
  it('ger en kopia av de riktiga matcherna (samma värden, ny array-referens)', () => {
    const real: Match[] = [scheduled('m1', 'swe', 'bra'), scheduled('m2', 'arg', 'fra')];
    const result = applySimulationOverlay(real, EMPTY_OVERLAY);

    expect(result).toEqual(real);
    expect(result).not.toBe(real); // ny array, inte samma referens
    // Element-referenserna är oförändrade (inga onödiga kopior av oberörda matcher).
    expect(result[0]).toBe(real[0]);
    expect(result[1]).toBe(real[1]);
  });

  it('en explicit tom Map beter sig som EMPTY_OVERLAY', () => {
    const real: Match[] = [scheduled('m1', 'swe', 'bra')];
    expect(applySimulationOverlay(real, new Map())).toEqual(real);
  });
});

describe('applySimulationOverlay, ISOLERING (riktig data rörs aldrig)', () => {
  it('muterar aldrig den riktiga matchlistan eller dess element', () => {
    const real: Match[] = [scheduled('m1', 'swe', 'bra'), scheduled('m2', 'arg', 'fra')];
    const snapshot = structuredClone(real);
    const overlay = new Map<string, Match>([['m1', finished('m1', 'swe', 'bra', 2, 0)]]);

    applySimulationOverlay(real, overlay);

    // Den riktiga listan och varje element är BYTE-IDENTISK med innan (deep equal).
    expect(real).toEqual(snapshot);
    expect(real[0].status).toBe('scheduled');
    expect(real[0].result).toBeNull();
  });
});

describe('applySimulationOverlay, BLANDA-fallet (riktig + hypotetisk samtidigt)', () => {
  it('matcher MED overlay-post blir hypotetiska, matcher UTAN behåller riktig data', () => {
    const real: Match[] = [
      finished('m1', 'swe', 'bra', 1, 1), // riktigt resultat
      scheduled('m2', 'arg', 'fra'), // ej spelad
    ];
    // Hypotetiskt: m2 spelas 3-0. m1 lämnas utan overlay (behåller riktigt 1-1).
    const overlay = new Map<string, Match>([['m2', finished('m2', 'arg', 'fra', 3, 0)]]);

    const effective = applySimulationOverlay(real, overlay);

    // m1 = riktig (oförändrad referens), m2 = hypotetisk (overlay-värdet).
    expect(effective[0]).toBe(real[0]);
    expect(effective[0].result).toEqual({ homeGoals: 1, awayGoals: 1 });
    expect(effective[1].status).toBe('finished');
    expect(effective[1].result).toEqual({ homeGoals: 3, awayGoals: 0 });
  });

  it('overlay har FÖRETRÄDE för en match som även har ett riktigt resultat', () => {
    // m1 har riktigt 1-1; overlayn säger hypotetiskt 0-5 för SAMMA match.
    const real: Match[] = [finished('m1', 'swe', 'bra', 1, 1)];
    const overlay = new Map<string, Match>([['m1', finished('m1', 'swe', 'bra', 0, 5)]]);

    const effective = applySimulationOverlay(real, overlay);

    // Effektivt visas det hypotetiska tills overlayn töms (decisions.md T12).
    expect(effective[0].result).toEqual({ homeGoals: 0, awayGoals: 5 });
    // Riktig data orörd: töms overlayn återkommer 1-1.
    expect(real[0].result).toEqual({ homeGoals: 1, awayGoals: 1 });
  });
});

describe('applySimulationOverlay, ordning + fail loud', () => {
  it('bevarar matchordningen (samma index som realMatches)', () => {
    const real: Match[] = [
      scheduled('m1', 'a', 'b'),
      scheduled('m2', 'c', 'd'),
      scheduled('m3', 'e', 'f'),
    ];
    const overlay = new Map<string, Match>([['m2', finished('m2', 'c', 'd', 1, 0)]]);

    const effective = applySimulationOverlay(real, overlay);

    expect(effective.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('KASTAR (fail loud) om overlayn bär en nyckel utan motsvarande riktig match', () => {
    const real: Match[] = [scheduled('m1', 'a', 'b')];
    const overlay = new Map<string, Match>([['ghost', finished('ghost', 'a', 'b', 1, 0)]]);

    expect(() => applySimulationOverlay(real, overlay)).toThrow(/ghost/);
  });
});
