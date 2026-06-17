// Tester för den seedade PRNG:n (T82, #173). Bevisar determinism (samma seed ->
// samma följd), oberoende mellan seeds, gräns-semantiken i randomInt (max EXKLUSIVE,
// ett diskriminerande test) och fail-loud-vägarna. Plus en grov fördelnings-koll så
// motorn som lutar sig mot den inte är systematiskt skev.

import { describe, expect, it } from 'vitest';
import { createRng, randomInt, pick } from './prng';

describe('createRng (mulberry32, deterministisk)', () => {
  it('samma seed ger EXAKT samma följd (determinism)', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('olika seeds ger olika följder (oberoende)', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('alla tal ligger i [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('fördelningen är grovt jämn över [0,1) (inte systematiskt skev)', () => {
    // Dela [0,1) i 10 hinkar; med 10000 dragningar ska varje hink få ~1000.
    // En grov tolerans (±35 %) räcker för att fånga en grov skevhet utan att bli
    // flaky, det vi behöver är att skill-spridningen inte klumpar ihop sig.
    const rng = createRng(2026);
    const buckets = new Array(10).fill(0);
    const draws = 10000;
    for (let i = 0; i < draws; i++) {
      buckets[Math.floor(rng() * 10)] += 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan((draws / 10) * 0.65);
      expect(count).toBeLessThan((draws / 10) * 1.35);
    }
  });
});

describe('randomInt (min inklusive, max EXKLUSIVE)', () => {
  it('ligger alltid i [min, max)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(rng, 5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(8); // 8 ska ALDRIG förekomma (exklusiv övre gräns)
    }
  });

  it('når faktiskt både min och max-1 (gränserna är inte döda)', () => {
    // Diskriminerande mot en off-by-one: om övre gränsen vore inklusiv skulle 3 dyka
    // upp; om nedre vore exklusiv skulle 0 aldrig dyka upp. Vi kräver 0,1,2 men ALDRIG 3.
    const rng = createRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      seen.add(randomInt(rng, 0, 3));
    }
    expect(seen).toEqual(new Set([0, 1, 2]));
  });

  it('kastar om max <= min (fail loud, inget tyst tomt intervall)', () => {
    const rng = createRng(1);
    expect(() => randomInt(rng, 5, 5)).toThrow(/måste vara större/);
    expect(() => randomInt(rng, 5, 4)).toThrow(/måste vara större/);
  });
});

describe('pick (deterministiskt val ur lista)', () => {
  it('väljer ett element ur listan, deterministiskt per seed', () => {
    const items = ['a', 'b', 'c', 'd'] as const;
    const a = createRng(3);
    const b = createRng(3);
    const pickedA = Array.from({ length: 10 }, () => pick(a, items));
    const pickedB = Array.from({ length: 10 }, () => pick(b, items));
    expect(pickedA).toEqual(pickedB);
    for (const p of pickedA) {
      expect(items).toContain(p);
    }
  });

  it('kastar på tom lista (fail loud, inget tyst undefined)', () => {
    const rng = createRng(1);
    expect(() => pick(rng, [])).toThrow(/tom lista/);
  });
});
