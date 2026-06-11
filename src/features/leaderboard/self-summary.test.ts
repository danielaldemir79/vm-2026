// Tester för aktuell användares sammanfattning (T46, #79). Fokus: den egna raden plockas
// TROGET ur den rangordnade topplistan (ingen omräkning), och null-fallen (ingen identitet,
// identitet ej i listan, tom lista) ger ingen gissad panel.

import { describe, expect, it } from 'vitest';
import { deriveSelfSummary } from './self-summary';
import type { LeaderboardEntry } from './aggregate-scores';

const entry = (
  userId: string,
  displayName: string,
  points: number,
  rank: number,
  exactHits = 0
): LeaderboardEntry => ({ userId, displayName, points, rank, exactHits });

describe('deriveSelfSummary', () => {
  // Delad rank vid lika (T17): Anna + Bertil båda rank 1, Cecilia rank 3.
  const board: LeaderboardEntry[] = [
    entry('u1', 'Anna', 12, 1, 2),
    entry('u2', 'Bertil', 12, 1, 1),
    entry('u3', 'Cecilia', 5, 3),
  ];

  it('plockar aktuell användares poäng + rank + antal medlemmar ur listan', () => {
    expect(deriveSelfSummary(board, 'u3')).toEqual({ points: 5, rank: 3, totalMembers: 3 });
  });

  it('speglar DELAD placering troget (rank 1 även om man inte ligger överst i sorteringen)', () => {
    // Bertil delar rank 1 med Anna fast han står på rad 2 i sorteringen. Sammanfattningen
    // ska visa hans RANK (1), inte hans radindex (2). Bevisar att vi läser rank, inte position.
    expect(deriveSelfSummary(board, 'u2')).toEqual({ points: 12, rank: 1, totalMembers: 3 });
  });

  it('returnerar null när identiteten är okänd (currentUserId null) -> ingen panel', () => {
    expect(deriveSelfSummary(board, null)).toBeNull();
  });

  it('returnerar null när användaren inte finns i listan -> ingen gissad rad', () => {
    expect(deriveSelfSummary(board, 'u-finns-ej')).toBeNull();
  });

  it('returnerar null för en tom lista (inga medlemmar att peka ut)', () => {
    expect(deriveSelfSummary([], 'u1')).toBeNull();
  });

  it('en ENDA medlem: rank 1 av 1', () => {
    const solo = [entry('u1', 'Anna', 0, 1)];
    expect(deriveSelfSummary(solo, 'u1')).toEqual({ points: 0, rank: 1, totalMembers: 1 });
  });
});
