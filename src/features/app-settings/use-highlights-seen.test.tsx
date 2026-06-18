import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHighlightsSeen } from './use-highlights-seen';
import { HIGHLIGHTS_SEEN_KEY } from './storage-keys';

describe('useHighlightsSeen, persisterad envägs-flagga (per enhet)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('är INTE sedd vid första start (ingen flagga satt -> badgen får visas)', () => {
    const { result } = renderHook(() => useHighlightsSeen());
    expect(result.current[0]).toBe(false);
  });

  it('är SEDD från start om flaggan redan är satt (klickat tidigare på denna enhet)', () => {
    window.localStorage.setItem(HIGHLIGHTS_SEEN_KEY, '1');
    const { result } = renderHook(() => useHighlightsSeen());
    expect(result.current[0]).toBe(true);
  });

  it('markSeen() flippar till sedd OCH persistar (nyckeln blir "1")', () => {
    const { result } = renderHook(() => useHighlightsSeen());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());

    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(HIGHLIGHTS_SEEN_KEY)).toBe('1');
  });

  it('förblir sedd vid en NY mount efter markSeen (persistens över enhets-instanser)', () => {
    const first = renderHook(() => useHighlightsSeen());
    act(() => first.result.current[1]());
    // Ny hook-instans (motsvarar en ny app-laddning på samma enhet): fortfarande sedd.
    const second = renderHook(() => useHighlightsSeen());
    expect(second.result.current[0]).toBe(true);
  });

  it('markSeen() är idempotent (andra anropet ändrar inget, nyckeln kvarstår "1")', () => {
    const { result } = renderHook(() => useHighlightsSeen());
    act(() => result.current[1]());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(HIGHLIGHTS_SEEN_KEY)).toBe('1');
  });
});
