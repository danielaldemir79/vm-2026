import { describe, expect, it } from 'vitest';
import type { RoomComment } from '../../data/rooms';
import { groupCommentsByMatch, threadForMatch } from './match-comments-aggregate';

/** Kort hjälpare för att bygga en match-kommentar-rad. */
function c(
  id: string,
  userId: string,
  matchId: string | null,
  createdAt: string,
  body = 'hej'
): RoomComment {
  return { id, userId, body, createdAt, matchId };
}

describe('groupCommentsByMatch', () => {
  it('grupperar kommentarer per matchId med antal = listans längd', () => {
    const rows = [
      c('a', 'u1', 'g-A-1', '2026-06-12T10:00:00Z'),
      c('b', 'u2', 'g-A-1', '2026-06-12T10:01:00Z'),
      c('d', 'u3', 'g-B-2', '2026-06-12T10:02:00Z'),
    ];
    const byMatch = groupCommentsByMatch(rows);

    expect(threadForMatch(byMatch, 'g-A-1').count).toBe(2);
    expect(threadForMatch(byMatch, 'g-B-2').count).toBe(1);
    // En match ingen kommenterat ger en tom, giltig tråd (ingen null-kontroll i UI:t).
    expect(threadForMatch(byMatch, 'g-C-3')).toEqual({
      matchId: 'g-C-3',
      comments: [],
      count: 0,
    });
  });

  it('sorterar varje tråd ÄLDST FÖRST (createdAt stigande), oavsett indatans ordning', () => {
    const rows = [
      c('senare', 'u1', 'g-A-1', '2026-06-12T12:00:00Z', 'andra'),
      c('tidigare', 'u2', 'g-A-1', '2026-06-12T09:00:00Z', 'första'),
    ];
    const thread = threadForMatch(groupCommentsByMatch(rows), 'g-A-1');
    expect(thread.comments.map((x) => x.body)).toEqual(['första', 'andra']);
  });

  it('stabil sekundär sortering på id vid EXAKT lika tid (deterministisk ordning)', () => {
    const rows = [
      c('z-id', 'u1', 'g-A-1', '2026-06-12T10:00:00Z', 'z'),
      c('a-id', 'u2', 'g-A-1', '2026-06-12T10:00:00Z', 'a'),
    ];
    const thread = threadForMatch(groupCommentsByMatch(rows), 'g-A-1');
    // Samma tid -> id som tie-break (a-id före z-id), så ordningen aldrig hoppar.
    expect(thread.comments.map((x) => x.id)).toEqual(['a-id', 'z-id']);
  });

  it('hoppar defensivt en rad med matchId null (rums-chatt får ALDRIG en match-tråd)', () => {
    const rows = [
      c('chat', 'u1', null, '2026-06-12T10:00:00Z'),
      c('match', 'u2', 'g-A-1', '2026-06-12T10:01:00Z'),
    ];
    const byMatch = groupCommentsByMatch(rows);
    // Bara match-tråden finns; null-raden (rums-chatt) grupperas aldrig in.
    expect([...byMatch.keys()]).toEqual(['g-A-1']);
    expect(threadForMatch(byMatch, 'g-A-1').count).toBe(1);
  });

  it('tom indata ger en tom karta', () => {
    expect(groupCommentsByMatch([]).size).toBe(0);
  });
});
