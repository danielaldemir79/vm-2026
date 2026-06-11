// Tester för tips-avslöjandet (T17, #17 + T55, #96). FOKUS (HARD sekretess): tips-
// INNEHÅLL avslöjas FÖRST efter deadline (avspark), aldrig före. T55: avslöjandet
// visas redan VID AVSPARK (status 'live', allas tips UTAN poäng), inte först vid
// slutsignal; en FÄRDIG match visar facit + poäng som förut.

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

function liveMatch(id: string, home: string, away: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: KICKOFF,
    venue: 'Arena',
    status: 'live',
    result: null,
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
    const match = revealed[0];
    expect(match.matchId).toBe('g-A-1');
    expect(match.status).toBe('finished');
    if (match.status !== 'finished') {
      throw new Error('förväntade en färdig match');
    }
    expect(match.actual).toEqual({ homeGoals: 2, awayGoals: 1 });
    // Två picks, sorterade på poäng fallande: Anna 2-1 exakt (3p) före Bertil 0-0 (0p).
    expect(match.picks.map((p) => [p.displayName, p.points])).toEqual([
      ['Anna', 3],
      ['Bertil', 0],
    ]);
  });

  it('varje pick bär VARFÖR-typen (T46) härledd ur SAMMA facit som poängen (exact/miss)', () => {
    // Anna prickade exakt (2-1 mot 2-1) -> 'exact'; Bertil bommade utfallet (0-0) -> 'miss'.
    // pointType ska följa pointTypeOf, inte en egen tröskel mot siffran.
    const revealed = buildMatchReveal(matches, facit, predictions, NAMES, AFTER);
    const match = revealed[0];
    if (match.status !== 'finished') {
      throw new Error('förväntade en färdig match');
    }
    expect(match.picks.map((p) => [p.displayName, p.points, p.pointType])).toEqual([
      ['Anna', 3, 'exact'],
      ['Bertil', 0, 'miss'],
    ]);
  });

  it('rätt utfall men fel siffror ger pointType "outcome" (1p), inte exact/miss', () => {
    // Facit 2-1 (hemmavinst). Tips 3-0 = hemmavinst men ej exakt -> 'outcome'.
    const outcomePred = [prediction('u1', 'g-A-1', 3, 0)];
    const revealed = buildMatchReveal(matches, facit, outcomePred, NAMES, AFTER);
    const match = revealed[0];
    if (match.status !== 'finished') {
      throw new Error('förväntade en färdig match');
    }
    expect(match.picks[0].points).toBe(1);
    expect(match.picks[0].pointType).toBe('outcome');
  });

  it('exakt PÅ avspark (now === kickoff) räknas som låst (avslöjas), gränsfallet', () => {
    const atKickoff = new Date(KICKOFF);
    const revealed = buildMatchReveal(matches, facit, predictions, NAMES, atKickoff);
    expect(revealed).toHaveLength(1); // now >= kickoff -> låst
  });
});

describe('buildMatchReveal, PÅGÅR-läget (T55: avslöja vid avspark, inte vid slutsignal)', () => {
  // En LÅST men PÅGÅENDE match (avspark passerad, status 'live', inget facit än).
  const matches = [liveMatch('g-A-1', 'mex', 'kor')];
  const predictions = [prediction('u2', 'g-A-1', 0, 0), prediction('u1', 'g-A-1', 2, 1)];

  it('LÅST men EJ avgjord match avslöjar allas tips, status "live", UTAN facit/poäng', () => {
    const revealed = buildMatchReveal(matches, [], predictions, NAMES, AFTER);
    expect(revealed).toHaveLength(1);
    const match = revealed[0];
    expect(match.matchId).toBe('g-A-1');
    expect(match.status).toBe('live');
    if (match.status !== 'live') {
      throw new Error('förväntade en pågående match');
    }
    // Inget facit (matchen pågår). Diskriminanten ger actual === null.
    expect(match.actual).toBeNull();
    // Allas tips syns, sorterade på NAMN (ingen poäng att sortera på), UTAN poäng-fält.
    expect(match.picks.map((p) => p.displayName)).toEqual(['Anna', 'Bertil']);
    expect(match.picks.map((p) => p.predicted)).toEqual([
      { homeGoals: 2, awayGoals: 1 }, // Anna
      { homeGoals: 0, awayGoals: 0 }, // Bertil
    ]);
    // HARD T55: en pågående pick bär INGA poäng-fält (ärligt "pågår", ingen gissad poäng).
    for (const pick of match.picks) {
      expect(pick).not.toHaveProperty('points');
      expect(pick).not.toHaveProperty('pointType');
    }
  });

  it('NEGATIV KONTROLL (HARD): en OLÅST match (avspark inte passerad) avslöjar ALDRIG andras tips', () => {
    // Samma pågående match, men FÖRE avspark: sekretessen får inte luckras av T55.
    const revealed = buildMatchReveal(matches, [], predictions, NAMES, BEFORE);
    expect(revealed).toHaveLength(0);
  });

  it('en pågående match UTAN tips avslöjas ändå (tom picks-lista), status "live"', () => {
    const revealed = buildMatchReveal(matches, [], [], NAMES, AFTER);
    expect(revealed).toHaveLength(1);
    expect(revealed[0].status).toBe('live');
    expect(revealed[0].picks).toHaveLength(0);
  });

  it('en match som GÅR FRÅN pågår TILL färdig byter status och får facit + poäng', () => {
    // Samma id, men nu finished + facit finns: samma reveal-rad blir 'finished' med poäng.
    const finished = [finishedMatch('g-A-1', 'mex', 'kor', 2, 1)];
    const facit: MatchFacit[] = [{ matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } }];
    const revealed = buildMatchReveal(finished, facit, predictions, NAMES, AFTER);
    expect(revealed).toHaveLength(1);
    const match = revealed[0];
    expect(match.status).toBe('finished');
    if (match.status !== 'finished') {
      throw new Error('förväntade en färdig match');
    }
    // Nu sorteras på poäng: Anna 2-1 exakt (3p) före Bertil 0-0 (0p).
    expect(match.picks.map((p) => [p.displayName, p.points])).toEqual([
      ['Anna', 3],
      ['Bertil', 0],
    ]);
  });
});

describe('buildMatchReveal, picks-detaljer', () => {
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
    const match = revealed[0];
    if (match.status !== 'finished') {
      throw new Error('förväntade en färdig match');
    }
    expect(match.picks[0].displayName).toBe('u-okand');
    expect(match.picks[0].points).toBe(3);
  });

  it('en avgjord+låst match UTAN tips avslöjas ändå (facit synligt, tom picks-lista)', () => {
    const matches = [finishedMatch('g-A-1', 'mex', 'kor', 3, 2)];
    const facit: MatchFacit[] = [{ matchId: 'g-A-1', actual: { homeGoals: 3, awayGoals: 2 } }];
    const revealed = buildMatchReveal(matches, facit, [], NAMES, AFTER);
    expect(revealed).toHaveLength(1);
    const match = revealed[0];
    if (match.status !== 'finished') {
      throw new Error('förväntade en färdig match');
    }
    expect(match.picks).toHaveLength(0);
    expect(match.actual).toEqual({ homeGoals: 3, awayGoals: 2 });
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

  it('en SCHEDULED match (avspark inte passerad, inget facit) avslöjas aldrig', () => {
    // En kommande match: varken låst eller avgjord, ska inte synas alls.
    const matches = [scheduledMatch('g-A-1', 'mex', 'kor')];
    const revealed = buildMatchReveal(
      matches,
      [],
      [prediction('u1', 'g-A-1', 1, 1)],
      NAMES,
      BEFORE
    );
    expect(revealed).toHaveLength(0);
  });
});
