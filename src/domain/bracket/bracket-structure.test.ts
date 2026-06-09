import { describe, expect, it } from 'vitest';
import { GROUP_IDS, type GroupId } from '../types';
import {
  BRACKET_MATCHES,
  FINAL,
  QUARTER_FINALS,
  ROUND_OF_16,
  ROUND_OF_32,
  SEMI_FINALS,
  THIRD_PLACE_MATCH,
} from './bracket-structure';

// Strukturtest för slutspelsträdet (positions-data ur FIFA Article 12.6-12.11).
// Bevisar att den källhänvisade kopian är komplett och internt konsistent:
// rätt antal matcher per runda, varje match-källa pekar på en match som finns,
// och varje gruppvinnare/tvåa/bästa-trea-plats är korrekt och unik.

describe('slutspelsträdets struktur: antal och rundor', () => {
  it('har rätt antal matcher per runda (16/8/4/2/1/1)', () => {
    expect(ROUND_OF_32).toHaveLength(16);
    expect(ROUND_OF_16).toHaveLength(8);
    expect(QUARTER_FINALS).toHaveLength(4);
    expect(SEMI_FINALS).toHaveLength(2);
    expect([THIRD_PLACE_MATCH]).toHaveLength(1);
    expect([FINAL]).toHaveLength(1);
    // Totalt 32 slutspelsmatcher (M73-M104).
    expect(BRACKET_MATCHES).toHaveLength(32);
  });

  it('match-id:na är M73-M104, unika och kompletta', () => {
    const ids = BRACKET_MATCHES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const expected = Array.from({ length: 32 }, (_, i) => `M${73 + i}`);
    expect([...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))).toEqual(expected);
  });
});

describe('slutspelsträdets struktur: grupp-positioner vid sextondelsfinalen', () => {
  it('varje gruppvinnare (1A-1L) förekommer exakt en gång i R32', () => {
    const winners = ROUND_OF_32.flatMap((m) =>
      [m.home, m.away].filter((s) => s.kind === 'group-winner').map((s) => s.group)
    );
    expect([...winners].sort()).toEqual([...GROUP_IDS].sort());
  });

  it('varje grupptvåa (2A-2L) förekommer exakt en gång i R32', () => {
    const runnersUp = ROUND_OF_32.flatMap((m) =>
      [m.home, m.away].filter((s) => s.kind === 'group-runner-up').map((s) => s.group)
    );
    expect([...runnersUp].sort()).toEqual([...GROUP_IDS].sort());
  });

  it('har exakt 8 bästa-trea-platser, var och en med 5 behöriga grupper', () => {
    const bestThird = ROUND_OF_32.flatMap((m) =>
      [m.home, m.away].filter((s) => s.kind === 'best-third')
    );
    expect(bestThird).toHaveLength(8);
    for (const s of bestThird) {
      if (s.kind !== 'best-third') throw new Error('förväntade best-third');
      expect(s.eligibleGroups).toHaveLength(5);
      // Inga dubbletter, alla giltiga grupper.
      expect(new Set(s.eligibleGroups).size).toBe(5);
      for (const g of s.eligibleGroups) {
        expect(GROUP_IDS).toContain(g);
      }
    }
  });

  it('matchar FIFA:s officiella behörighetslistor (Article 12.6, spot-check)', () => {
    // Källhänvisad spot-check: M79 (1A) behöriga treor = C,E,F,H,I.
    const m79 = ROUND_OF_32.find((m) => m.id === 'M79');
    expect(m79?.away.kind).toBe('best-third');
    if (m79?.away.kind === 'best-third') {
      expect([...m79.away.eligibleGroups].sort()).toEqual(['C', 'E', 'F', 'H', 'I']);
    }
    // M74 (1E) behöriga treor = A,B,C,D,F.
    const m74 = ROUND_OF_32.find((m) => m.id === 'M74');
    if (m74?.away.kind === 'best-third') {
      expect([...m74.away.eligibleGroups].sort()).toEqual(['A', 'B', 'C', 'D', 'F']);
    }
  });
});

describe('slutspelsträdets struktur: referentiell integritet i progressionen', () => {
  const ids = new Set(BRACKET_MATCHES.map((m) => m.id));

  it('varje match-winner/match-loser-källa pekar på en match som finns', () => {
    for (const m of BRACKET_MATCHES) {
      for (const source of [m.home, m.away]) {
        if (source.kind === 'match-winner' || source.kind === 'match-loser') {
          expect(ids.has(source.matchId), `${m.id} pekar på okänd ${source.matchId}`).toBe(true);
        }
      }
    }
  });

  it('bronsmatchen (M103) matas av de två semifinal-FÖRLORARNA', () => {
    expect(THIRD_PLACE_MATCH.home).toEqual({ kind: 'match-loser', matchId: 'M101' });
    expect(THIRD_PLACE_MATCH.away).toEqual({ kind: 'match-loser', matchId: 'M102' });
  });

  it('finalen (M104) matas av de två semifinal-VINNARNA', () => {
    expect(FINAL.home).toEqual({ kind: 'match-winner', matchId: 'M101' });
    expect(FINAL.away).toEqual({ kind: 'match-winner', matchId: 'M102' });
  });

  it('inget lag möter sin egen grupp i R32 (FIFA-regel: samma grupp möts ej)', () => {
    // För matcher med två KÄNDA grupp-positioner (vinnare/tvåa) får grupperna
    // inte vara samma. Bästa-trea-platser kontrolleras inte här (de utesluter
    // egna gruppen i Annexe C), men de explicita vinnare/tvåa-mötena ska hålla.
    for (const m of ROUND_OF_32) {
      const groups: GroupId[] = [];
      for (const s of [m.home, m.away]) {
        if (s.kind === 'group-winner' || s.kind === 'group-runner-up') groups.push(s.group);
      }
      if (groups.length === 2) {
        expect(groups[0], `${m.id}: samma grupp möter sig själv`).not.toBe(groups[1]);
      }
    }
  });
});
