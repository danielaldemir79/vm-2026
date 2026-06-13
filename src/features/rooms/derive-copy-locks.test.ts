import { describe, expect, it } from 'vitest';
import { deriveCopyLocks, type CopyLockSource } from './derive-copy-locks';

// Kickoff-karta för testet (match_id -> avspark). Bara ankar-matcherna behövs:
//   g-A-1 = grupp A:s ankare OCH champion-ankaret (turneringsstart),
//   g-B-1 = grupp B:s ankare (sent, men T72:s platta deadline gäller ändå),
//   M73   = en slutspels-slots egen avspark.
const KICKOFFS = new Map<string, string>([
  ['g-A-1', '2026-06-11T19:00:00.000Z'], // tidig (premiär)
  ['g-A-3', '2026-06-20T19:00:00.000Z'], // en senare match i grupp A
  ['g-B-1', '2026-06-25T19:00:00.000Z'], // sent ankare (T72: platt deadline gäller ändå)
  ['M73', '2026-07-04T19:00:00.000Z'], // slutspel
]);

// "Nu" mellan g-A-1 (passerad) och g-A-3/M73 (kommande), OCH före den platta pool-
// deadlinen (17/6 20:00Z). Används av match-tips-testet (g-A-3 = 20/6 ska vara KOMMANDE)
// och av reopen-testen (grupp/champion öppna fram till 17/6), så det ligger FÖRE 17/6 20:00.
const NOW = new Date('2026-06-15T12:00:00.000Z');

// "Nu" EFTER den platta pool-deadlinen (17/6 20:00Z, T72), men före g-B-1 (25/6) och
// M73 (4/7). Grupp/champion-låsen (T72) använder denna: A OCH B är låsta (platt deadline
// passerad), medan en SLOT (M73, egen avspark 4/7) fortfarande är öppen.
const AFTER_EXTENDED = new Date('2026-06-18T12:00:00.000Z');

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

describe('deriveCopyLocks, grupp-tips (T72: PLATT pool-deadline, omgång 1 spelad 17/6)', () => {
  it('grupp A OCH B låsta när den platta deadlinen (17/6 20:00Z) passerat (vid 18/6)', () => {
    // AFTER_EXTENDED = 18/6: den platta pool-deadlinen är passerad -> BÅDE A och B låsta.
    // Skillnaden mot T67: B:s sena ankare (25/6) styr INTE längre, alla grupper delar EN
    // platt låspunkt. (T67 hade B öppen till 25/6.)
    const source: CopyLockSource = { matchKeys: [], groupKeys: ['A', 'B'], bracketKeys: [] };
    const locks = deriveCopyLocks(source, KICKOFFS, AFTER_EXTENDED);
    expect(locks.groupKeys.has('A')).toBe(true);
    expect(locks.groupKeys.has('B')).toBe(true);
  });

  it('T72 REOPEN: grupp A är OLÅST mellan sin avspark (11/6) och den platta tiden (17/6)', () => {
    // En startad grupp ska vara ÖPPEN igen för copy fram till omgång-1-tiden (annars skulle
    // copy falskt HOPPA ÖVER ett grupp-item som servern faktiskt tillåter). 15/6 < 17/6 20:00.
    const source: CopyLockSource = { matchKeys: [], groupKeys: ['A'], bracketKeys: [] };
    const locks = deriveCopyLocks(source, KICKOFFS, NOW);
    expect(locks.groupKeys.has('A')).toBe(false); // olåst -> inte i lås-mängden
  });
});

describe('deriveCopyLocks, bracket-tips (T72: champion platt, SLOTS oförändrade)', () => {
  it('champion-tipset låst när den PLATTA deadlinen (17/6 20:00Z) passerat (vid 18/6)', () => {
    const source: CopyLockSource = { matchKeys: [], groupKeys: [], bracketKeys: ['champion'] };
    const locks = deriveCopyLocks(source, KICKOFFS, AFTER_EXTENDED);
    // champion = den platta pool-deadlinen (17/6 20:00Z), passerad vid 18/6 -> låst.
    expect(locks.bracketKeys.has('champion')).toBe(true);
  });

  it('T72 REOPEN: champion OLÅST mellan turneringsstart (11/6) och den platta tiden (17/6)', () => {
    const source: CopyLockSource = { matchKeys: [], groupKeys: [], bracketKeys: ['champion'] };
    const locks = deriveCopyLocks(source, KICKOFFS, NOW);
    expect(locks.bracketKeys.has('champion')).toBe(false); // olåst -> copy tillåts
  });

  it('en slutspels-slot låses av SIN EGEN avspark, FÖRLÄNGS ALDRIG (M73 = 4/7 kommande)', () => {
    // T72 rör inte slots: M73 behåller sin egen avspark (4 juli), inte den platta tiden.
    // Vid AFTER_EXTENDED (18/6, efter den platta tiden) ska M73 ändå vara OLÅST.
    const source: CopyLockSource = { matchKeys: [], groupKeys: [], bracketKeys: ['M73'] };
    const locks = deriveCopyLocks(source, KICKOFFS, AFTER_EXTENDED);
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
