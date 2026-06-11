import { describe, expect, it } from 'vitest';
import {
  appBuiltAt,
  appCommitSha,
  formatBuiltAt,
  readInjected,
  UNKNOWN_VERSION,
} from './app-version';

// VIKTIGT: Vite-`define` ersätter __APP_SHA__/__APP_BUILT_AT__ även i Vitest (Vites
// transform körs), så appCommitSha()/appBuiltAt() returnerar de RIKTIGT injicerade
// bygg-värdena här, inte fallbacken. Vi testar därför:
//   - den OBSERVERBARA injektionen (giltig form), och
//   - den rena fallback-REGELN (readInjected) direkt, eftersom frånvaro-grenen
//     aldrig nås från app-koden i den här miljön (lessons: testa den gren du påstår).

describe('readInjected, fallback-regeln för en injicerad global', () => {
  it('en icke-tom sträng är giltig och returneras oförändrad', () => {
    expect(readInjected('40bdf8e')).toBe('40bdf8e');
  });

  it('undefined (define ej körd) ger null (-> app-koden faller till "dev")', () => {
    expect(readInjected(undefined)).toBeNull();
  });

  it('tom sträng räknas som frånvaro, inte ett giltigt värde', () => {
    expect(readInjected('')).toBeNull();
  });
});

describe('app-version, injicerad bygg-stämpel (define aktiv i Vitest)', () => {
  it('appCommitSha() ger en icke-tom version (injicerad SHA eller "dev"-fallback)', () => {
    const sha = appCommitSha();
    expect(sha).toBeTruthy();
    // Antingen den injicerade korta SHA:n (<= 7 tecken) eller fallbacken "dev".
    expect(sha === UNKNOWN_VERSION || sha.length <= 7).toBe(true);
  });

  it('appBuiltAt() ger en giltig ISO-sträng eller null, aldrig skräp', () => {
    const builtAt = appBuiltAt();
    if (builtAt !== null) {
      expect(Number.isNaN(new Date(builtAt).getTime())).toBe(false);
    }
  });
});

describe('formatBuiltAt, människovänlig UTC-byggtid', () => {
  it('formaterar en ISO-sträng till "YYYY-MM-DD HH:mm UTC"', () => {
    expect(formatBuiltAt('2026-06-11T08:30:00.000Z')).toBe('2026-06-11 08:30 UTC');
  });

  it('nollpaddar månad/dag/timme/minut', () => {
    expect(formatBuiltAt('2026-01-02T03:04:00.000Z')).toBe('2026-01-02 03:04 UTC');
  });

  it('är tidszons-OBEROENDE (UTC), inte beroende av maskinens lokala zon', () => {
    // Off-by-one-fällan (lessons): ett UTC-tidsstämpel får aldrig tolkas lokalt.
    // 23:30 UTC ska visas som 23:30 UTC oavsett var testet körs.
    expect(formatBuiltAt('2026-06-11T23:30:00.000Z')).toBe('2026-06-11 23:30 UTC');
  });

  it('returnerar null för en saknad byggtid (fail-soft: visa bara SHA)', () => {
    expect(formatBuiltAt(null)).toBeNull();
  });

  it('returnerar null för en otolkbar tidssträng i stället för "Invalid Date"', () => {
    expect(formatBuiltAt('inte-ett-datum')).toBeNull();
  });
});
