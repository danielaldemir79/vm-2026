import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTodayKey } from './use-today-key';

// useTodayKey ska ge dagens svenska kalenderdag-nyckel och FLYTTA sig när dagen
// faktiskt växlar (PWA-fälla: fliken står öppen över midnatt). Vi fakar Date +
// timers så midnatts-passagen är deterministisk (ingen verklig väntan).

describe('useTodayKey, dag-medvetet "nu"', () => {
  beforeEach(() => {
    // Fejka både klockan och timers så minut-ticken kan drivas manuellt.
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returnerar dagens svenska kalenderdag-nyckel vid första renderingen', () => {
    // 2026-06-15 10:00 svensk tid (08:00Z, sommartid +2).
    const start = new Date('2026-06-15T08:00:00.000Z');
    const { result } = renderHook(() => useTodayKey(start));
    expect(result.current.todayKey).toBe('2026-06-15');
  });

  it('FLYTTAR nyckeln över midnatt när fliken stått öppen (minut-tick fångar dygnsväxlingen)', () => {
    // Strax före svensk midnatt: 2026-06-15 23:59 svensk = 21:59Z.
    vi.setSystemTime(new Date('2026-06-15T21:59:00.000Z'));
    const { result } = renderHook(() => useTodayKey());
    expect(result.current.todayKey).toBe('2026-06-15');

    // Flytta klockan över midnatt (svensk 00:01 nästa dag = 22:01Z) och låt
    // minut-ticken köra. Nyckeln ska nu vara nästa dag, utan omladdning.
    act(() => {
      vi.setSystemTime(new Date('2026-06-15T22:01:00.000Z'));
      vi.advanceTimersByTime(60_000); // en minut-tick
    });
    expect(result.current.todayKey).toBe('2026-06-16');
  });

  it('ändrar INTE nyckeln (samma referens-stabila nowMs) när samma dag tickar vidare', () => {
    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
    const { result } = renderHook(() => useTodayKey());
    const firstNowMs = result.current.nowMs;

    // Tick framåt men fortfarande SAMMA svenska dag (08:01Z) -> nowMs oförändrat,
    // så ett downstream-useMemo (fönstret) inte räknas om i onödan varje minut.
    act(() => {
      vi.setSystemTime(new Date('2026-06-15T08:01:00.000Z'));
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.todayKey).toBe('2026-06-15');
    expect(result.current.nowMs).toBe(firstNowMs);
  });

  it('synkar dagen direkt när fliken blir SYNLIG igen efter att ha varit dold (bakgrunds-flik, strypta timers)', () => {
    // PWA-fälla: en dold flik får sina timers strypta/pausade. Vi simulerar att
    // appen var dold över ett dygnsskifte och blir synlig igen: visibilitychange
    // ska räkna om OMEDELBART, utan att vänta in nästa tick.
    vi.setSystemTime(new Date('2026-06-15T21:59:00.000Z'));
    const { result } = renderHook(() => useTodayKey());
    expect(result.current.todayKey).toBe('2026-06-15');

    act(() => {
      // Hoppa fram ett dygn (timern "sov" medan fliken var dold) och fyra av
      // visibilitychange utan att ha kört några tick-intervall.
      vi.setSystemTime(new Date('2026-06-16T10:00:00.000Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.todayKey).toBe('2026-06-16');
  });
});
