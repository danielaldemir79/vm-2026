import { describe, expect, it } from 'vitest';
import { deriveCopyLocks, type CopyLockSource } from './derive-copy-locks';

// Kickoff-karta för testet (match_id -> avspark). Bara ankar-matcherna behövs:
//   g-A-1 = grupp A:s deadline OCH champion-ankaret (turneringsstart),
//   g-B-1 = grupp B:s deadline,
//   M73   = en slutspels-slots egen avspark.
const KICKOFFS = new Map<string, string>([
  ['g-A-1', '2026-06-11T19:00:00.000Z'], // tidig (premiär)
  ['g-A-3', '2026-06-20T19:00:00.000Z'], // en senare match i grupp A
  ['g-B-1', '2026-06-25T19:00:00.000Z'], // senare
  ['M73', '2026-07-04T19:00:00.000Z'], // slutspel
]);

// "Nu" mellan g-A-1 (passerad) och g-B-1/M73 (kommande), och g-A-3 (kommande).
const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('deriveCopyLocks, match-tips', () => {
  it('markerar en match vars avspark PASSERAT som låst, en kommande som olåst', () => {
    const source: CopyLockSource = {
      matchKeys: ['g-A-1', 'g-A-3'],
      groupKeys: [],
      bracketKeys: [],
    };
    const locks = deriveCopyLocks(source, KICKOFFS, NOW);
    expect(locks.matchKeys.has('g-A-1')).toBe(true); // passerad -> låst
    expect(locks.matchKeys.has('g-A-3')).toBe(false); // kommande -> olåst (ej i mängden)
  });

  it('FAIL-SAFE: en match som saknas i kickoff-kartan behandlas som låst', () => {
    const source: CopyLockSource = { matchKeys: ['saknas-X'], groupKeys: [], bracketKeys: [] };
    const locks = deriveCopyLocks(source, KICKOFFS, NOW);
    expect(locks.matchKeys.has('saknas-X')).toBe(true);
  });
});

describe('deriveCopyLocks, grupp-tips (ankare = gruppens första match g-X-1)', () => {
  it('grupp A låst (g-A-1 passerad), grupp B olåst (g-B-1 kommande)', () => {
    const source: CopyLockSource = { matchKeys: [], groupKeys: ['A', 'B'], bracketKeys: [] };
    const locks = deriveCopyLocks(source, KICKOFFS, NOW);
    expect(locks.groupKeys.has('A')).toBe(true);
    expect(locks.groupKeys.has('B')).toBe(false);
  });
});

describe('deriveCopyLocks, bracket-tips (slot-ankare + champion = g-A-1)', () => {
  it('champion-tipset låst när turneringen börjat (g-A-1 passerad)', () => {
    const source: CopyLockSource = { matchKeys: [], groupKeys: [], bracketKeys: ['champion'] };
    const locks = deriveCopyLocks(source, KICKOFFS, NOW);
    // champion-ankaret är g-A-1 (turneringsstart), som passerat -> låst.
    expect(locks.bracketKeys.has('champion')).toBe(true);
  });

  it('en slutspels-slot låses av SIN EGEN avspark (M73 kommande -> olåst)', () => {
    const source: CopyLockSource = { matchKeys: [], groupKeys: [], bracketKeys: ['M73'] };
    const locks = deriveCopyLocks(source, KICKOFFS, NOW);
    expect(locks.bracketKeys.has('M73')).toBe(false); // 4 juli, kommande
  });
});

describe('deriveCopyLocks, exakt på avspark', () => {
  it('LÅST på avsparkssekunden (now === kickoff), samma riktning som isMatchLocked', () => {
    const source: CopyLockSource = { matchKeys: ['g-B-1'], groupKeys: [], bracketKeys: [] };
    const onKickoff = new Date('2026-06-25T19:00:00.000Z');
    const locks = deriveCopyLocks(source, KICKOFFS, onKickoff);
    expect(locks.matchKeys.has('g-B-1')).toBe(true);
  });
});
