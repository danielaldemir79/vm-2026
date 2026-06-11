import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeadlineTick } from './use-deadline-tick';

// useDeadlineTick ger ett "nu" som tickar fram varje minut (och vid återaktiverad
// flik) så tipsvyns deadline-lås räknas om utan omladdning (T15, #15, Copilot C1).
// Vi fakar Date + timers så minut-ticken och synlighets-händelserna är
// deterministiska (ingen verklig väntan).

/** Sätt document.visibilityState i jsdom (read-only, måste defineProperty:as). */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

describe('useDeadlineTick, minut-tickande "nu"', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible'); // standardläge: fliken syns
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible'); // återställ för nästa test
  });

  it('returnerar det injicerade "nu" vid första renderingen', () => {
    const start = new Date('2026-06-27T20:30:00.000Z');
    const { result } = renderHook(() => useDeadlineTick(start));
    expect(result.current.getTime()).toBe(start.getTime());
  });

  it('accepterar ett tal (epoch-ms) som injicerat "nu"', () => {
    const startMs = new Date('2026-06-27T20:30:00.000Z').getTime();
    const { result } = renderHook(() => useDeadlineTick(startMs));
    expect(result.current.getTime()).toBe(startMs);
  });

  it('FLYTTAR "nu" framåt när minut-ticken kör (avspark som passerar mitt på dagen)', () => {
    // Strax före en avspark kl 21:00Z. Minut-ticken ska föra fram nuet förbi den.
    vi.setSystemTime(new Date('2026-06-27T20:59:00.000Z'));
    const { result } = renderHook(() => useDeadlineTick());
    expect(result.current.getTime()).toBe(new Date('2026-06-27T20:59:00.000Z').getTime());

    // advanceTimersByTime(60_000) flyttar fram BÅDE fake-klockan (Date.now) och
    // intervallet en minut, så ticken fyrar och läser 21:00:00.
    act(() => {
      vi.advanceTimersByTime(60_000); // en minut-tick (20:59 -> 21:00)
    });
    expect(result.current.getTime()).toBe(new Date('2026-06-27T21:00:00.000Z').getTime());
  });

  it('räknar om DIREKT när fliken blir SYNLIG igen (bakgrunds-flik, strypta timers)', () => {
    // PWA-fälla: en dold flik får timers strypta. Vi simulerar att appen var dold
    // över en avspark och blir synlig igen: visibilitychange (visible) ska räkna om
    // OMEDELBART, utan att vänta in nästa tick.
    vi.setSystemTime(new Date('2026-06-27T20:59:00.000Z'));
    const { result } = renderHook(() => useDeadlineTick());
    expect(result.current.getTime()).toBe(new Date('2026-06-27T20:59:00.000Z').getTime());

    act(() => {
      // Timern "sov" medan fliken var dold; klockan hann passera avsparken.
      vi.setSystemTime(new Date('2026-06-27T21:05:00.000Z'));
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.getTime()).toBe(new Date('2026-06-27T21:05:00.000Z').getTime());
  });

  it('C11: räknar INTE om när fliken DÖLJS (visibilitychange med hidden ger ingen re-render)', () => {
    // En visibilitychange fyrar både vid hide OCH show. Vid HIDE behövs inget
    // omräknat "nu" (ingen renderas ändå), och en setState där vore en onödig
    // re-render. Verifiera att en hide-händelse INTE flyttar nuet, trots att
    // klockan hunnit ticka framåt.
    vi.setSystemTime(new Date('2026-06-27T20:59:00.000Z'));
    const { result } = renderHook(() => useDeadlineTick());
    const before = result.current.getTime();

    act(() => {
      vi.setSystemTime(new Date('2026-06-27T21:05:00.000Z')); // klockan gått framåt
      setVisibility('hidden'); // fliken DÖLJS
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Nuet ska vara OFÖRÄNDRAT (ingen omräkning vid hide), inte 21:05.
    expect(result.current.getTime()).toBe(before);
    expect(result.current.getTime()).toBe(new Date('2026-06-27T20:59:00.000Z').getTime());
  });

  it('slutar ticka efter unmount (lyssnare + intervall städas)', () => {
    vi.setSystemTime(new Date('2026-06-27T20:59:00.000Z'));
    const { result, unmount } = renderHook(() => useDeadlineTick());
    const last = result.current.getTime();
    unmount();

    // Efter unmount ska varken tick eller visibilitychange röra något (ingen
    // setState på en avmonterad komponent). Vi bara kör vidare och ser att inget kastar.
    act(() => {
      vi.setSystemTime(new Date('2026-06-27T21:30:00.000Z'));
      vi.advanceTimersByTime(60_000);
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // result.current är frusen på sista värdet före unmount.
    expect(result.current.getTime()).toBe(last);
  });
});
