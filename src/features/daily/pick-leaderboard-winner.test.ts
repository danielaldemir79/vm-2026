import { describe, expect, it } from 'vitest';
import type { TotalLeaderboardEntry } from '../total-leaderboard';
import { pickLeaderboardWinner } from './pick-leaderboard-winner';

function entry(rank: number, displayName: string, points: number): TotalLeaderboardEntry {
  return { userId: displayName.toLowerCase(), displayName, points, rank, exactHits: 0 };
}

describe('pickLeaderboardWinner', () => {
  it('null för tom lista', () => {
    expect(pickLeaderboardWinner([])).toBeNull();
  });

  it('returnerar rank-1-raden (först i listan)', () => {
    const winner = pickLeaderboardWinner([
      entry(1, 'Recardo Adam', 143),
      entry(2, 'Daniel Aldemir', 126),
    ]);
    expect(winner?.displayName).toBe('Recardo Adam');
    expect(winner?.points).toBe(143);
  });

  it('null när toppraden inte är rank 1 (skydd mot ofärdig lista)', () => {
    expect(pickLeaderboardWinner([entry(2, 'Ingen', 100)])).toBeNull();
  });
});
