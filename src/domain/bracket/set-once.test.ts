import { describe, expect, it } from 'vitest';
import { setOnce } from './set-once';

// Bevisar fail-loud-vakten för kritisk strukturdata: en dubblett-nyckel KASTAR
// i stället för att tyst skriva över. Vakten kan per konstruktion inte nås via
// den riktiga (korrekta) FIFA-strukturen, så den verifieras genom direktanrop
// med en avsiktlig dubblett (jfr C5-beslutet om compareHeadToHead).

describe('setOnce: fail-loud vid dubblett-mappning', () => {
  it('sätter en ny nyckel utan fel', () => {
    const map = new Map<string, string>();
    expect(() => setOnce(map, 'M101', 'M104-home', 'match-winner-källa')).not.toThrow();
    expect(map.get('M101')).toBe('M104-home');
  });

  it('KASTAR om samma nyckel mappas en andra gång (tyst överskrivning förhindras)', () => {
    const map = new Map<string, string>();
    setOnce(map, 'M101', 'M104-home', 'match-winner-källa');
    expect(() => setOnce(map, 'M101', 'M104-away', 'match-winner-källa')).toThrow(
      /Dubblett-mappning för match-winner-källa "M101"/
    );
  });

  it('skriver INTE över det första värdet när dubbletten kastar', () => {
    const map = new Map<string, string>();
    setOnce(map, 'M101', 'M104-home', 'match-winner-källa');
    try {
      setOnce(map, 'M101', 'M104-away', 'match-winner-källa');
    } catch {
      // förväntat
    }
    // Första värdet står kvar, inget tyst skrevs över.
    expect(map.get('M101')).toBe('M104-home');
  });

  it('fungerar med icke-sträng-värden (generisk över V), t.ex. ett objekt-värde', () => {
    const map = new Map<string, { a: number }>();
    const row = { a: 1 };
    setOnce(map, 'EFGHIJKL', row, 'Annexe C-kombination');
    expect(() => setOnce(map, 'EFGHIJKL', { a: 2 }, 'Annexe C-kombination')).toThrow(
      /Annexe C-kombination "EFGHIJKL"/
    );
    expect(map.get('EFGHIJKL')).toBe(row);
  });
});
