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

/** Som r(), men med explicit tidsstämpel (för reaktor-sorterings-testerna, T74). */
function rt(
  userId: string,
  matchId: string,
  emoji: RoomReaction['emoji'],
  createdAt: string
): RoomReaction {
  return { roomId: 'room1', userId, matchId, emoji, createdAt };
}

describe('aggregateReactionsByMatch', () => {
  it('räknar antal per emoji och markerar MIN valda', () => {
    const rows = [r('me', 'g-A-1', '🔥'), r('u2', 'g-A-1', '🔥'), r('u3', 'g-A-1', '⚽')];
    const byMatch = aggregateReactionsByMatch(rows, 'me');
    const s = summaryForMatch(byMatch, 'g-A-1');

    expect(s.total).toBe(3);
    expect(s.myEmoji).toBe('🔥');
    // Visnings-ordning = REACTION_EMOJIS: ⚽ kommer FÖRE 🔥 i listan.
    expect(s.tallies.map((t) => ({ emoji: t.emoji, count: t.count, mine: t.mine }))).toEqual([
      { emoji: '⚽', count: 1, mine: false },
      { emoji: '🔥', count: 2, mine: true },
    ]);
    // T74: varje bricka bär OCKSÅ sina reagerare (count === reactors.length).
    expect(s.tallies.map((t) => t.reactors.length)).toEqual([1, 2]);
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
    expect(s.tallies).toHaveLength(1);
    expect(s.tallies[0]).toMatchObject({ emoji: '🔥', count: 1, mine: false });
    expect(s.tallies[0].reactors).toHaveLength(1);
  });
});

describe('aggregateReactionsByMatch , reagerarna (T74, #157)', () => {
  it('bär VEM + NÄR per emoji (reactors.length === count)', () => {
    const rows = [
      rt('u2', 'g-A-1', '🔥', '2026-06-12T10:05:00Z'),
      rt('u1', 'g-A-1', '🔥', '2026-06-12T10:01:00Z'),
    ];
    const s = summaryForMatch(aggregateReactionsByMatch(rows, null), 'g-A-1');
    const fire = s.tallies.find((t) => t.emoji === '🔥')!;
    expect(fire.count).toBe(2);
    expect(fire.reactors).toHaveLength(2);
  });

  it('sorterar reagerarna ÄLDST FÖRST (createdAt stigande)', () => {
    const rows = [
      rt('sent', 'g-A-1', '🔥', '2026-06-12T12:00:00Z'),
      rt('tidig', 'g-A-1', '🔥', '2026-06-12T08:00:00Z'),
      rt('mitt', 'g-A-1', '🔥', '2026-06-12T10:00:00Z'),
    ];
    const fire = summaryForMatch(aggregateReactionsByMatch(rows, null), 'g-A-1').tallies[0];
    expect(fire.reactors.map((r) => r.userId)).toEqual(['tidig', 'mitt', 'sent']);
  });

  it('vid EXAKT lika tid sorteras stabilt på userId (deterministisk ordning)', () => {
    const t = '2026-06-12T10:00:00Z';
    const rows = [
      rt('charlie', 'g-A-1', '👏', t),
      rt('alice', 'g-A-1', '👏', t),
      rt('bob', 'g-A-1', '👏', t),
    ];
    const clap = summaryForMatch(aggregateReactionsByMatch(rows, null), 'g-A-1').tallies[0];
    expect(clap.reactors.map((r) => r.userId)).toEqual(['alice', 'bob', 'charlie']);
  });

  it('reagerarna bär den råa created_at (för utskriven tid i popovern)', () => {
    const rows = [rt('u1', 'g-A-1', '🎉', '2026-06-13T18:30:00Z')];
    const party = summaryForMatch(aggregateReactionsByMatch(rows, null), 'g-A-1').tallies[0];
    expect(party.reactors[0]).toEqual({ userId: 'u1', createdAt: '2026-06-13T18:30:00Z' });
  });
});

describe('summaryForMatch', () => {
  it('faller till en TOM (giltig) sammanfattning för en match ingen reagerat på', () => {
    const byMatch = aggregateReactionsByMatch([r('u1', 'g-A-1', '🔥')], null);
    const s = summaryForMatch(byMatch, 'g-Z-9'); // okänd match
    expect(s).toEqual({ matchId: 'g-Z-9', tallies: [], myEmoji: null, total: 0 });
  });
});
