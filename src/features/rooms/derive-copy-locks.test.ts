import { describe, expect, it } from 'vitest';
import { deriveCopyLocks, type CopyLockSource } from './derive-copy-locks';

// Kickoff-karta för testet (match_id -> avspark). Bara ankar-matcherna behövs:
//   g-A-1 = grupp A:s deadline OCH champion-ankaret (turneringsstart),
//   g-B-1 = grupp B:s deadline,
//   M73   = en slutspels-slots egen avspark.
const KICKOFFS = new Map<string, string>([
  ['g-A-1', '2026-06-11T19:00:00.000Z'], // tidig (premiär)
  ['g-A-3', '2026-06-20T19:00:00.000Z'], // en senare match i grupp A
  ['g-B-1', '2026-06-25T19:00:00.000Z'], // senare (EFTER den nya 21/6-deadlinen)
  ['M73', '2026-07-04T19:00:00.000Z'], // slutspel
]);

// "Nu" mellan g-A-1 (passerad) och g-A-3/g-B-1/M73 (kommande). Används av match-tips-
// testet (g-A-3 = 20/6 ska vara KOMMANDE), så det ligger FÖRE 20/6.
const NOW = new Date('2026-06-15T12:00:00.000Z');

// "Nu" EFTER den nya förlängda söndagstiden (21/6 21:59Z), men före g-B-1 (25/6) och
// M73 (4/7). Grupp/champion-låsen (T67) använder denna, eftersom A:s förlängda deadline
// nu är 21/6 (inte 14/6) och alltså inte passerad vid 15/6.
const AFTER_EXTENDED = new Date('2026-06-22T12:00:00.000Z');

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

describe('deriveCopyLocks, grupp-tips (T67: GREATEST(g-X-1, fasta söndagstiden 21/6))', () => {
  it('grupp A låst (förlängd deadline 21/6 passerad vid 22/6), grupp B olåst (g-B-1 = 25/6)', () => {
    // AFTER_EXTENDED = 22/6: grupp A:s FÖRLÄNGDA deadline (21/6 21:59Z) är passerad -> låst.
    // Grupp B:s ankare (25/6) är efter fasta tiden, så GREATEST behåller 25/6 -> kommande -> olåst.
    const source: CopyLockSource = { matchKeys: [], groupKeys: ['A', 'B'], bracketKeys: [] };
    const locks = deriveCopyLocks(source, KICKOFFS, AFTER_EXTENDED);
    expect(locks.groupKeys.has('A')).toBe(true);
    expect(locks.groupKeys.has('B')).toBe(false);
  });

  it('T67 REOPEN: grupp A är OLÅST mellan sin avspark (11/6) och förlängningen (21/6)', () => {
    // En startad grupp ska vara ÖPPEN igen för copy fram till söndagen (annars skulle
    // copy falskt HOPPA ÖVER ett grupp-item som servern faktiskt tillåter). 15/6 < 21/6.
    const source: CopyLockSource = { matchKeys: [], groupKeys: ['A'], bracketKeys: [] };
    const reopened = new Date('2026-06-15T12:00:00.000Z');
    const locks = deriveCopyLocks(source, KICKOFFS, reopened);
    expect(locks.groupKeys.has('A')).toBe(false); // olåst -> inte i lås-mängden
  });
});

describe('deriveCopyLocks, bracket-tips (T67: champion förlängd, SLOTS oförändrade)', () => {
  it('champion-tipset låst när den FÖRLÄNGDA deadlinen (21/6) passerat (vid 22/6)', () => {
    const source: CopyLockSource = { matchKeys: [], groupKeys: [], bracketKeys: ['champion'] };
    const locks = deriveCopyLocks(source, KICKOFFS, AFTER_EXTENDED);
    // champion = GREATEST(g-A-1, fasta tiden) = 21/6 21:59Z, passerad vid 22/6 -> låst.
    expect(locks.bracketKeys.has('champion')).toBe(true);
  });

  it('T67 REOPEN: champion OLÅST mellan turneringsstart (11/6) och förlängningen (21/6)', () => {
    const source: CopyLockSource = { matchKeys: [], groupKeys: [], bracketKeys: ['champion'] };
    const reopened = new Date('2026-06-15T12:00:00.000Z');
    const locks = deriveCopyLocks(source, KICKOFFS, reopened);
    expect(locks.bracketKeys.has('champion')).toBe(false); // olåst -> copy tillåts
  });

  it('en slutspels-slot låses av SIN EGEN avspark, FÖRLÄNGS ALDRIG (M73 = 4/7 kommande)', () => {
    // T53 rör inte slots: M73 behåller sin egen avspark (4 juli), inte fasta söndagstiden.
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
