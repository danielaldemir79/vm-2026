import { afterEach, describe, expect, it } from 'vitest';
import {
  computeRankChange,
  readSelfRankSnapshot,
  writeSelfRankSnapshot,
  SELF_RANK_SNAPSHOT_KEY,
} from './self-rank-snapshot';

afterEach(() => {
  window.localStorage.clear();
});

describe('computeRankChange (ren delta, lägre rank-siffra = bättre)', () => {
  it('FÖRSTA besöket (ingen sparad rank) => "new", ingen rörelse', () => {
    expect(computeRankChange(null, 5)).toEqual({ direction: 'new', delta: 0 });
  });

  it('klättrat UPP (nuvarande rank lägre än sparad) => "up" med antal platser', () => {
    // Var 8:a, nu 3:a => upp 5 platser.
    expect(computeRankChange(8, 3)).toEqual({ direction: 'up', delta: 5 });
  });

  it('tappat NER (nuvarande rank högre än sparad) => "down" med antal platser', () => {
    // Var 3:a, nu 8:a => ner 5 platser.
    expect(computeRankChange(3, 8)).toEqual({ direction: 'down', delta: 5 });
  });

  it('samma rank => "same", delta 0', () => {
    expect(computeRankChange(4, 4)).toEqual({ direction: 'same', delta: 0 });
  });
});

describe('snapshot-persistens (per userId, fail-safe)', () => {
  it('round-trip: skriv => läs samma rank för samma user', () => {
    writeSelfRankSnapshot('me', 7);
    expect(readSelfRankSnapshot('me')).toBe(7);
  });

  it('läser INTE en annan användares snapshot (ingen falsk rörelse mellan konton)', () => {
    writeSelfRankSnapshot('userA', 7);
    // En annan inloggning på samma device får INTE A:s rank.
    expect(readSelfRankSnapshot('userB')).toBeNull();
  });

  it('läser null när inget snapshot finns (första besöket)', () => {
    expect(readSelfRankSnapshot('me')).toBeNull();
  });

  it('läser null vid KORRUPT JSON (fail-safe, gissar aldrig en rörelse på skräp)', () => {
    window.localStorage.setItem(SELF_RANK_SNAPSHOT_KEY, '{ inte giltig json');
    expect(readSelfRankSnapshot('me')).toBeNull();
  });

  it('läser null när sparad rank inte är ett ändligt tal (korrupt fält)', () => {
    window.localStorage.setItem(
      SELF_RANK_SNAPSHOT_KEY,
      JSON.stringify({ userId: 'me', rank: 'fem' })
    );
    expect(readSelfRankSnapshot('me')).toBeNull();
  });

  it('läs-då-skriv-flöde: andra besöket jämför mot första besökets rank', () => {
    // Besök 1: ingen sparad rank => new. Spara rank 8.
    expect(computeRankChange(readSelfRankSnapshot('me'), 8)).toEqual({
      direction: 'new',
      delta: 0,
    });
    writeSelfRankSnapshot('me', 8);
    // Besök 2: nu 3:a, jämför mot sparade 8 => upp 5.
    expect(computeRankChange(readSelfRankSnapshot('me'), 3)).toEqual({ direction: 'up', delta: 5 });
  });
});
