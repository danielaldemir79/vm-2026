import { describe, it, expect } from 'vitest';
import { hashCode, hueFromCode, huesFor } from './team-hue';

describe('team-hue: deterministisk färg-härledning ur landskod', () => {
  it('hashCode ger samma tal för samma kod (deterministisk)', () => {
    expect(hashCode('BRA')).toBe(hashCode('BRA'));
    expect(hashCode('SWE')).toBe(hashCode('SWE'));
  });

  it('hashCode ger ett icke-negativt 32-bitars heltal', () => {
    for (const code of ['BRA', 'SWE', 'USA', 'MEX', 'A', '']) {
      const h = hashCode(code);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('skilda koder ger (typiskt) skilda hashar', () => {
    // Inte en garanti (hash kan kollidera), men de faktiska VM-koderna ska spridas.
    const codes = ['BRA', 'SWE', 'USA', 'MEX', 'CAN', 'ARG', 'FRA', 'ESP'];
    const hashes = new Set(codes.map(hashCode));
    expect(hashes.size).toBe(codes.length);
  });

  it('hueFromCode ligger i [0, 360) och är deterministisk', () => {
    for (const code of ['BRA', 'SWE', 'USA', 'MEX', 'CAN', 'ARG', 'FRA', 'ESP']) {
      const hue = hueFromCode(code);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(hueFromCode(code)).toBe(hue);
    }
  });

  it('huesFor: andra hue ligger 140 grader bort (mod 360) och båda i [0, 360)', () => {
    for (const code of ['BRA', 'SWE', 'USA', 'MEX']) {
      const { from, to } = huesFor(code);
      expect(from).toBe(hueFromCode(code));
      expect(to).toBe((from + 140) % 360);
      expect(to).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThan(360);
    }
  });
});
