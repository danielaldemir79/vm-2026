// Tester för tips-avslöjandet (T17, #17). FOKUS (HARD sekretess): tips-INNEHÅLL
// avslöjas FÖRST efter deadline (avspark), aldrig före, OCH bara för avgjorda
// matcher (då finns ett facit att visa poäng mot).

import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import type { Prediction } from '../../data/predictions';
import { buildMatchReveal, type DisplayNames } from './reveal';
import type { MatchFacit } from './derive-facit';

/* ------------------------------------------------------------------ *
 * Test-hjälpare.
 * ------------------------------------------------------------------ */

const KICKOFF = '2026-06-12T18:00:00Z';

function finishedMatch(id: string, home: string, away: string, hg: number, ag: number): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: KICKOFF,
    venue: 'Arena',
    status: 'finished',
    result: { homeGoals: hg, awayGoals: ag },
  };
}

function scheduledMatch(id: string, home: string, away: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: KICKOFF,
    venue: 'Arena',
    status: 'scheduled',
    result: null,
  };
}

function prediction(userId: string, matchId: string, hg: number, ag: number): Prediction {
  return { matchId, userId, homeGoals: hg, awayGoals: ag, updatedAt: '' };
}

const NAMES: DisplayNames = new Map([
  ['u1', 'Anna'],
  ['u2', 'Bertil'],
]);

const BEFORE = new Date('2026-06-12T17:00:00Z'); // 1h FÖRE avspark
const AFTER = new Date('2026-06-12T19:00:00Z'); // 1h EFTER avspark

describe('buildMatchReveal, sekretess-gate (avslöja FÖRST efter avspark)', () => {
  const matches = [finishedMatch('g-A-1', 'mex', 'kor', 2, 1)];
  const facit: MatchFacit[] = [{ matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } }];
  const predictions = [prediction('u1', 'g-A-1', 2, 1), prediction('u2', 'g-A-1', 0, 0)];

  it('FÖRE avspark avslöjas INGET (även om facit/tips råkar finnas i datan)', () => {
    const revealed = buildMatchReveal(matches, facit, predictions, NAMES, BEFORE);
    expect(revealed).toHaveLength(0);
  });

  it('EFTER avspark avslöjas matchen med alla synliga tips + poäng', () => {
    const revealed = buildMatchReveal(matches, facit, predictions, NAMES, AFTER);
    expect(revealed).toHaveLength(1);
    expect(revealed[0].matchId).toBe('g-A-1');
    expect(revealed[0].actual).toEqual({ homeGoals: 2, awayGoals: 1 });
    // Två picks, sorterade på poäng fallande: Anna 2-1 exakt (3p) före Bertil 0-0 (0p).
    expect(revealed[0].picks.map((p) => [p.displayName, p.points])).toEqual([
      ['Anna', 3],
      ['Bertil', 0],
    ]);
  });

  it('exakt PÅ avspark (now === kickoff) räknas som låst (avslöjas), gränsfallet', () => {
    const atKickoff = new Date(KICKOFF);
    const revealed = buildMatchReveal(matches, facit, predictions, NAMES, atKickoff);
    expect(revealed).toHaveLength(1); // now >= kickoff -> låst
  });
});

describe('buildMatchReveal, kräver BÅDE låst OCH avgjort', () => {
  it('en LÅST men EJ avgjord match (pågår efter avspark) avslöjas inte (inget facit)', () => {
    // Matchen är scheduled (inget facit), men avspark passerad. Inget att visa poäng mot.
    const matches = [scheduledMatch('g-A-1', 'mex', 'kor')];
    const revealed = buildMatchReveal(matches, [], [prediction('u1', 'g-A-1', 1, 1)], NAMES, AFTER);
    expect(revealed).toHaveLength(0);
  });

  it('en match med facit men EJ låst (avspark inte passerad) avslöjas inte', () => {
    const matches = [finishedMatch('g-A-1', 'mex', 'kor', 2, 1)];
    const facit: MatchFacit[] = [{ matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } }];
    const revealed = buildMatchReveal(
      matches,
      facit,
      [prediction('u1', 'g-A-1', 2, 1)],
      NAMES,
      BEFORE
    );
    expect(revealed).toHaveLength(0);
  });
});

describe('buildMatchReveal, picks-detaljer', () => {
  it('okänt userId faller tillbaka på userId som visningsnamn (ingen krasch)', () => {
    const matches = [finishedMatch('g-A-1', 'mex', 'kor', 1, 0)];
    const facit: MatchFacit[] = [{ matchId: 'g-A-1', actual: { homeGoals: 1, awayGoals: 0 } }];
    const revealed = buildMatchReveal(
      matches,
      facit,
      [prediction('u-okand', 'g-A-1', 1, 0)],
      new Map(), // inga namn
      AFTER
    );
    expect(revealed[0].picks[0].displayName).toBe('u-okand');
    expect(revealed[0].picks[0].points).toBe(3);
  });

  it('en avgjord+låst match UTAN tips avslöjas ändå (facit synligt, tom picks-lista)', () => {
    const matches = [finishedMatch('g-A-1', 'mex', 'kor', 3, 2)];
    const facit: MatchFacit[] = [{ matchId: 'g-A-1', actual: { homeGoals: 3, awayGoals: 2 } }];
    const revealed = buildMatchReveal(matches, facit, [], NAMES, AFTER);
    expect(revealed).toHaveLength(1);
    expect(revealed[0].picks).toHaveLength(0);
    expect(revealed[0].actual).toEqual({ homeGoals: 3, awayGoals: 2 });
  });

  it('picks sorteras på poäng fallande, sen namn (stabil ordning)', () => {
    const matches = [finishedMatch('g-A-1', 'mex', 'kor', 1, 1)];
    const facit: MatchFacit[] = [{ matchId: 'g-A-1', actual: { homeGoals: 1, awayGoals: 1 } }];
    // Båda 1p (rätt utfall, oavgjort), Anna och Bertil -> alfabetisk.
    const revealed = buildMatchReveal(
      matches,
      facit,
      [prediction('u2', 'g-A-1', 2, 2), prediction('u1', 'g-A-1', 0, 0)],
      NAMES,
      AFTER
    );
    expect(revealed[0].picks.map((p) => p.displayName)).toEqual(['Anna', 'Bertil']);
  });
});
