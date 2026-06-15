// Klock-tester. Bevisar Daniels vattenpaus-oro: klockan får ALDRIG springa fel.
// Drift-scenarierna ur tasken testas EXPLICIT (HT 20 min sedan sync -> frusen;
// 1H elapsed=44 + 5 min -> "45+", inte 49). `now` injiceras, allt deterministiskt.

import { describe, expect, it } from 'vitest';
import { computeClock } from './live-clock';

/** Tidsbas för testerna (godtycklig epoch-ms). */
const T0 = Date.parse('2026-06-14T20:00:00.000Z');
const min = (m: number) => m * 60_000;

describe('computeClock: paus FRYSER (Daniels vattenpaus-fall)', () => {
  it('HT: 20 min sedan sync får INTE avancera, klockan står still', () => {
    // status paused (HT), elapsed 45, synkad för 20 min sedan.
    const clock = computeClock('paused', 45, T0, T0 + min(20));
    expect(clock.displayMinute).toBe(45); // INTE 65
    expect(clock.ticking).toBe(false);
    expect(clock.label).toBe('Paus');
  });

  it('SUSP/INT/BT/P fryser också (alla paus-koder normaliseras till paused)', () => {
    const clock = computeClock('paused', 70, T0, T0 + min(99));
    expect(clock.displayMinute).toBe(70);
    expect(clock.ticking).toBe(false);
  });
});

describe('computeClock: live TICKAR mjukt men KAPAS vid halvleksgräns', () => {
  it('1H: elapsed=44, 5 min sedan sync -> "45+", inte 49 (hittar inte på tilläggstid)', () => {
    const clock = computeClock('live', 44, T0, T0 + min(5));
    expect(clock.displayMinute).toBe(45); // kapad, inte 49
    expect(clock.label).toBe("45+'");
    expect(clock.ticking).toBe(false); // slutar ticka vid taket
  });

  it('1H: elapsed=29, 5 min sedan sync -> tickar till 34 (under taket)', () => {
    const clock = computeClock('live', 29, T0, T0 + min(5));
    expect(clock.displayMinute).toBe(34);
    expect(clock.label).toBe("34'");
    expect(clock.ticking).toBe(true);
  });

  it('2H: elapsed=88, 5 min sedan sync -> "90+", inte 93', () => {
    const clock = computeClock('live', 88, T0, T0 + min(5));
    expect(clock.displayMinute).toBe(90);
    expect(clock.label).toBe("90+'");
    expect(clock.ticking).toBe(false);
  });

  it('exakt vid synk (0 min sedan) visar elapsed oförändrat', () => {
    const clock = computeClock('live', 29, T0, T0);
    expect(clock.displayMinute).toBe(29);
    expect(clock.ticking).toBe(true);
  });

  it('re-synk: en NY (lägre) elapsed efter HT styr om displayen, springer inte vidare', () => {
    // Efter att HT passerat och 2H startat med elapsed=46 (API-sync), 2 min senare.
    const clock = computeClock('live', 46, T0 + min(20), T0 + min(22));
    expect(clock.displayMinute).toBe(48);
    expect(clock.ticking).toBe(true);
  });
});

describe('computeClock: klock-skew och saknad data', () => {
  it('now FÖRE lastSyncAt avancerar inte (klockan går aldrig bakåt)', () => {
    const clock = computeClock('live', 30, T0, T0 - min(5));
    expect(clock.displayMinute).toBe(30); // max(0, negativ) = 0 minuter tick
    expect(clock.ticking).toBe(true);
  });

  it('live utan känd elapsed (null) tickar inte (inget att ticka från)', () => {
    const clock = computeClock('live', null, T0, T0 + min(3));
    expect(clock.displayMinute).toBeNull();
    expect(clock.ticking).toBe(false);
    expect(clock.label).toBe('Pågår');
  });
});

describe('computeClock: slut- och övriga lägen', () => {
  it('finished visar "Slut", ingen tick, oavsett tid sedan sync', () => {
    const clock = computeClock('finished', 90, T0, T0 + min(120));
    expect(clock.label).toBe('Slut');
    expect(clock.ticking).toBe(false);
  });

  it('scheduled visar "Ej startad", ingen minut, ingen tick', () => {
    const clock = computeClock('scheduled', null, T0, T0 + min(5));
    expect(clock.label).toBe('Ej startad');
    expect(clock.displayMinute).toBeNull();
    expect(clock.ticking).toBe(false);
  });

  it('unknown status tickar ALDRIG (gissar aldrig att matchen är live)', () => {
    const clock = computeClock('unknown', 30, T0, T0 + min(10));
    expect(clock.ticking).toBe(false);
    expect(clock.label).toBe('Okänt läge');
  });

  it('postponed visar "Uppskjuten", ingen tick', () => {
    const clock = computeClock('postponed', null, T0, T0 + min(10));
    expect(clock.label).toBe('Uppskjuten');
    expect(clock.ticking).toBe(false);
  });
});
