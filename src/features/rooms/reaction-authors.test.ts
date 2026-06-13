// Tester för resolveReactionAuthors (T74, #157): userId -> displayName-mappningen för
// "vem reagerade"-popovern. Edge: okänd medlem (lämnat rummet) -> fallback, tom lista,
// min-markering, och att ordningen ärvs från reaktor-listan (aggregeringen sorterar).

import { describe, expect, it } from 'vitest';
import { resolveReactionAuthors, UNKNOWN_MEMBER_NAME } from './reaction-authors';
import type { ReactionReactor } from './reaction-aggregate';

function reactor(userId: string, createdAt = '2026-06-12T10:00:00Z'): ReactionReactor {
  return { userId, createdAt };
}

const names = new Map<string, string>([
  ['u1', 'Daniel'],
  ['u2', 'Elin'],
  ['me', 'Jag Själv'],
]);

describe('resolveReactionAuthors', () => {
  it('mappar varje reagerare till displayName + tid + min-flagga', () => {
    const rows = resolveReactionAuthors(
      [reactor('u1', '2026-06-12T10:00:00Z'), reactor('me', '2026-06-12T10:05:00Z')],
      names,
      'me'
    );
    expect(rows).toEqual([
      { userId: 'u1', name: 'Daniel', createdAtIso: '2026-06-12T10:00:00Z', mine: false },
      { userId: 'me', name: 'Jag Själv', createdAtIso: '2026-06-12T10:05:00Z', mine: true },
    ]);
  });

  it('en reagerare som LÄMNAT rummet (saknas i kartan) faller till "Tidigare medlem"', () => {
    const rows = resolveReactionAuthors([reactor('ghost')], names, 'me');
    expect(rows[0].name).toBe(UNKNOWN_MEMBER_NAME);
    expect(rows[0].name).toBe('Tidigare medlem');
    expect(rows[0].mine).toBe(false);
  });

  it('utan min identitet (null) markeras INGEN rad som min', () => {
    const rows = resolveReactionAuthors([reactor('me')], names, null);
    expect(rows[0].mine).toBe(false);
  });

  it('tom reaktor-lista ger en tom rad-lista (defensivt, ingen krasch)', () => {
    expect(resolveReactionAuthors([], names, 'me')).toEqual([]);
  });

  it('bevarar ingångs-ordningen (aggregeringen har redan sorterat äldst-först)', () => {
    const rows = resolveReactionAuthors(
      [reactor('u2'), reactor('u1'), reactor('ghost')],
      names,
      null
    );
    expect(rows.map((r) => r.name)).toEqual(['Elin', 'Daniel', 'Tidigare medlem']);
  });
});
