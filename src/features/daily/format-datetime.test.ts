import { describe, expect, it } from 'vitest';
import {
  formatDayHeading,
  formatDayHeadingNoYear,
  formatDayShort,
  formatKickoffDateShort,
  formatKickoffTime,
} from './format-datetime';

describe('formatKickoffTime, UTC-instant -> svensk klockslagstid', () => {
  it('formaterar till svensk tid (sommartid +2), inte UTC', () => {
    // 19:00 UTC = 21:00 svensk tid (CEST).
    expect(formatKickoffTime('2026-06-11T19:00:00.000Z')).toBe('21:00');
  });

  it('hanterar en avspark som i svensk tid landar på 00:00 (midnatt)', () => {
    // 22:00 UTC = 00:00 svensk tid nästa dag.
    expect(formatKickoffTime('2026-06-13T22:00:00.000Z')).toBe('00:00');
  });
});

describe('formatKickoffDateShort, UTC-instant -> kort svensk avsparksdag (slutspelsträdet)', () => {
  it('ger dag + kort månad i svensk tid, t.ex. "28 juni" (M73:s avspark)', () => {
    // 2026-06-28T19:00Z = 21:00 svensk tid samma dag -> "28 juni".
    expect(formatKickoffDateShort('2026-06-28T19:00:00.000Z')).toBe('28 juni');
  });

  it('ger "5 juli" för en avspark som landar 5 juli i svensk tid', () => {
    expect(formatKickoffDateShort('2026-07-05T20:00:00.000Z')).toBe('5 juli');
  });

  it('formaterar i SVENSK tidszon, inte rått UTC-datum (off-by-one-vakt)', () => {
    // 2026-07-02T23:00Z = 01:00 svensk tid NÄSTA dag -> "3 juli", inte "2 juli".
    // Beviset att vi formaterar via Europe/Stockholm och inte klipper ISO-datumet rakt av.
    expect(formatKickoffDateShort('2026-07-02T23:00:00.000Z')).toBe('3 juli');
  });
});

describe('formatDayHeading / formatDayShort, läsbar svensk dag-rubrik', () => {
  it('ger en full svensk dag-rubrik ur en dag-nyckel', () => {
    const heading = formatDayHeading('2026-06-11');
    // sv-SE: "torsdag 11 juni 2026" (veckodag kan börja gement i sv-SE-locale).
    expect(heading.toLowerCase()).toContain('11 juni 2026');
    expect(heading.toLowerCase()).toContain('torsdag');
  });

  it('ger en full svensk dag-rubrik UTAN årtal (hero-etiketten, #54)', () => {
    const heading = formatDayHeadingNoYear('2026-06-11');
    // "torsdag 11 juni" (versaliseras av CSS i vyn), aldrig årtalet. Asserta
    // delsträngar (ICU-versioner kan skilja i interpunktion/mellanslag), inte exakt match.
    expect(heading.toLowerCase()).toContain('torsdag');
    expect(heading.toLowerCase()).toContain('11 juni');
    expect(heading).not.toContain('2026');
  });

  it('ger en kompakt svensk dag-etikett ur en dag-nyckel', () => {
    const short = formatDayShort('2026-06-11');
    expect(short.toLowerCase()).toContain('11');
    expect(short.toLowerCase()).toContain('jun');
  });

  it('kastar (fail loud) på en felformad dag-nyckel', () => {
    expect(() => formatDayHeading('2026/06/11')).toThrow(/Ogiltig dag-nyckel/);
    expect(() => formatDayHeadingNoYear('11 juni')).toThrow(/Ogiltig dag-nyckel/);
    expect(() => formatDayShort('11 juni')).toThrow(/Ogiltig dag-nyckel/);
  });
});
