import { describe, expect, it } from 'vitest';
import type { RoomReaction } from '../../data/rooms';
import { aggregateReactionsByMatch, summaryForMatch } from './reaction-aggregate';

/** Kort hjälpare för att bygga en reaktions-rad. */
function r(
  userId: string,
  matchId: string,
  emoji: RoomReaction['emoji'],
  roomId = 'room1'
): RoomReaction {
  return { roomId, userId, matchId, emoji, createdAt: '2026-06-12T10:00:00Z' };
}

describe('aggregateReactionsByMatch', () => {
  it('räknar antal per emoji och markerar MIN valda', () => {
    const rows = [r('me', 'g-A-1', '🔥'), r('u2', 'g-A-1', '🔥'), r('u3', 'g-A-1', '⚽')];
    const byMatch = aggregateReactionsByMatch(rows, 'me');
    const s = summaryForMatch(byMatch, 'g-A-1');

    expect(s.total).toBe(3);
    expect(s.myEmoji).toBe('🔥');
    // Visnings-ordning = REACTION_EMOJIS: ⚽ kommer FÖRE 🔥 i listan.
    expect(s.tallies).toEqual([
      { emoji: '⚽', count: 1, mine: false },
      { emoji: '🔥', count: 2, mine: true },
    ]);
  });

  it('aggregerar SEPARAT per match (en match påverkar inte en annan)', () => {
    const rows = [r('me', 'g-A-1', '🔥'), r('u2', 'g-A-2', '😱')];
    const byMatch = aggregateReactionsByMatch(rows, 'me');

    expect(summaryForMatch(byMatch, 'g-A-1').total).toBe(1);
    expect(summaryForMatch(byMatch, 'g-A-1').myEmoji).toBe('🔥');
    expect(summaryForMatch(byMatch, 'g-A-2').total).toBe(1);
    expect(summaryForMatch(byMatch, 'g-A-2').myEmoji).toBeNull(); // inte min
  });

  it('utan min identitet (null) markeras INGEN bricka som min', () => {
    const rows = [r('u1', 'g-A-1', '🔥')];
    const s = summaryForMatch(aggregateReactionsByMatch(rows, null), 'g-A-1');
    expect(s.myEmoji).toBeNull();
    expect(s.tallies[0].mine).toBe(false);
  });

  it('visnings-ordningen följer REACTION_EMOJIS (stabil, ej insättnings-ordning)', () => {
    // Sätts i "fel" ordning: 🧊 (sist i listan) först, ⚽ (först i listan) sist.
    const rows = [r('u1', 'g-A-1', '🧊'), r('u2', 'g-A-1', '⚽')];
    const s = summaryForMatch(aggregateReactionsByMatch(rows, null), 'g-A-1');
    expect(s.tallies.map((t) => t.emoji)).toEqual(['⚽', '🧊']);
  });

  it('en emoji UTANFÖR listan räknas inte (defensivt, kan ej hända via CHECK)', () => {
    const rows = [
      { ...r('u1', 'g-A-1', '🔥'), emoji: '💩' } as unknown as RoomReaction,
      r('u2', 'g-A-1', '🔥'),
    ];
    const s = summaryForMatch(aggregateReactionsByMatch(rows, null), 'g-A-1');
    expect(s.total).toBe(1); // bara den giltiga 🔥
    expect(s.tallies).toEqual([{ emoji: '🔥', count: 1, mine: false }]);
  });
});

describe('summaryForMatch', () => {
  it('faller till en TOM (giltig) sammanfattning för en match ingen reagerat på', () => {
    const byMatch = aggregateReactionsByMatch([r('u1', 'g-A-1', '🔥')], null);
    const s = summaryForMatch(byMatch, 'g-Z-9'); // okänd match
    expect(s).toEqual({ matchId: 'g-Z-9', tallies: [], myEmoji: null, total: 0 });
  });
});
