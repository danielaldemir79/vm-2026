import { describe, expect, it } from 'vitest';
import { buildRevealRows, pageOfRevealRows } from './reveal-rows';
import type { RevealedMatch } from './reveal';

/** En FÄRDIG avslöjad match-fabrik (facit + picks med poäng). */
function finished(
  matchId: string,
  kickoff: string,
  picks: RevealedMatch['picks'] = []
): RevealedMatch {
  return {
    matchId,
    status: 'finished',
    homeTeamId: 'mex',
    awayTeamId: 'kor',
    kickoff,
    actual: { homeGoals: 2, awayGoals: 1 },
    picks: picks as never,
  };
}

/** En PÅGÅENDE avslöjad match (inget facit/poäng). */
function pending(
  matchId: string,
  kickoff: string,
  picks: RevealedMatch['picks'] = []
): RevealedMatch {
  return {
    matchId,
    status: 'live',
    homeTeamId: 'mex',
    awayTeamId: 'kor',
    kickoff,
    actual: null,
    picks: picks as never,
  };
}

describe('buildRevealRows, ordning (senaste spelade först)', () => {
  it('sorterar matcher på kickoff FALLANDE (senaste avspark först)', () => {
    const reveal: RevealedMatch[] = [
      finished('m-old', '2026-06-11T18:00:00Z'),
      finished('m-new', '2026-06-13T18:00:00Z'),
      finished('m-mid', '2026-06-12T18:00:00Z'),
    ];
    const rows = buildRevealRows(reveal, null);
    expect(rows.map((r) => r.match.matchId)).toEqual(['m-new', 'm-mid', 'm-old']);
  });

  it('är deterministisk vid IDENTISK kickoff (stabil sekundär-nyckel matchId)', () => {
    const reveal: RevealedMatch[] = [
      finished('m-b', '2026-06-12T18:00:00Z'),
      finished('m-a', '2026-06-12T18:00:00Z'),
    ];
    // Samma avspark => sortera på matchId (a före b), oberoende av in-ordning.
    expect(buildRevealRows(reveal, null).map((r) => r.match.matchId)).toEqual(['m-a', 'm-b']);
    expect(buildRevealRows([...reveal].reverse(), null).map((r) => r.match.matchId)).toEqual([
      'm-a',
      'm-b',
    ]);
  });

  it('muterar INTE den inkommande arrayen (kopierar före sort)', () => {
    const reveal: RevealedMatch[] = [
      finished('m-old', '2026-06-11T18:00:00Z'),
      finished('m-new', '2026-06-13T18:00:00Z'),
    ];
    const before = reveal.map((r) => r.matchId);
    buildRevealRows(reveal, null);
    expect(reveal.map((r) => r.matchId)).toEqual(before);
  });
});

describe('buildRevealRows, "ditt resultat" per rad', () => {
  const withMe = finished('m1', '2026-06-12T18:00:00Z', [
    {
      userId: 'me',
      displayName: 'Jag',
      predicted: { homeGoals: 2, awayGoals: 1 },
      points: 3,
      pointType: 'exact',
    },
    {
      userId: 'other',
      displayName: 'Annan',
      predicted: { homeGoals: 0, awayGoals: 0 },
      points: 0,
      pointType: 'miss',
    },
  ] as never);

  it('plockar ut den inloggades pick (predicted + poäng + typ) på en FÄRDIG match', () => {
    const [row] = buildRevealRows([withMe], 'me');
    expect(row.self).not.toBeNull();
    expect(row.self?.predicted).toEqual({ homeGoals: 2, awayGoals: 1 });
    expect(row.self?.points).toBe(3);
    expect(row.self?.pointType).toBe('exact');
  });

  it('ger self = null när användaren INTE tippade matchen (gissar aldrig)', () => {
    const [row] = buildRevealRows([withMe], 'someone-who-did-not-tip');
    expect(row.self).toBeNull();
  });

  it('ger self = null när det INTE finns någon identitet (currentUserId null)', () => {
    const [row] = buildRevealRows([withMe], null);
    expect(row.self).toBeNull();
  });

  it('på en PÅGÅENDE match bär self ditt tips men INGEN poäng/typ (ärligt pågår)', () => {
    const live = pending('m1', '2026-06-12T18:00:00Z', [
      { userId: 'me', displayName: 'Jag', predicted: { homeGoals: 1, awayGoals: 1 } },
    ] as never);
    const [row] = buildRevealRows([live], 'me');
    expect(row.self?.predicted).toEqual({ homeGoals: 1, awayGoals: 1 });
    expect(row.self?.points).toBeNull();
    expect(row.self?.pointType).toBeNull();
  });
});

describe('pageOfRevealRows, paginering (klampad slice-matematik)', () => {
  const rows = buildRevealRows(
    Array.from({ length: 7 }, (_, i) =>
      // Kickoff stigande med index, men buildRevealRows vänder till fallande, så
      // m6 (senaste) hamnar först. Vi testar mot den ordnade listan.
      finished(`m${i}`, `2026-06-1${i}T18:00:00Z`)
    ),
    null
  );

  it('sida 1 ger de pageSize FÖRSTA raderna (senaste spelade först)', () => {
    const p = pageOfRevealRows(rows, 1, 3);
    expect(p.rows.map((r) => r.match.matchId)).toEqual(['m6', 'm5', 'm4']);
    expect(p.page).toBe(1);
    expect(p.pageCount).toBe(3); // ceil(7 / 3)
  });

  it('sista sidan ger resten (kan vara färre än pageSize)', () => {
    const p = pageOfRevealRows(rows, 3, 3);
    expect(p.rows.map((r) => r.match.matchId)).toEqual(['m0']);
    expect(p.page).toBe(3);
  });

  it('KLAMPAR ett för stort sidnummer till sista giltiga sidan (ingen tom slice)', () => {
    const p = pageOfRevealRows(rows, 99, 3);
    expect(p.page).toBe(3);
    expect(p.rows).toHaveLength(1);
  });

  it('KLAMPAR ett för litet sidnummer (0 / negativt) till sida 1', () => {
    expect(pageOfRevealRows(rows, 0, 3).page).toBe(1);
    expect(pageOfRevealRows(rows, -5, 3).page).toBe(1);
  });

  it('en TOM lista ger pageCount 1 (inte 0), så UI:t aldrig visar "sida 1 av 0"', () => {
    const p = pageOfRevealRows([], 1, 3);
    expect(p.pageCount).toBe(1);
    expect(p.rows).toHaveLength(0);
  });
});
