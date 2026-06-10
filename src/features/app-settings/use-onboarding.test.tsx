import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOnboarding } from './use-onboarding';
import { ONBOARDING_DONE_KEY } from './storage-keys';
import { ONBOARDING_STEP_COUNT } from './onboarding';

describe('useOnboarding, visa vid första start, aldrig igen efter klar/hoppad', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('är ÖPPEN vid första start (ingen flagga satt)', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.open).toBe(true);
    expect(result.current.stepIndex).toBe(0);
  });

  it('är STÄNGD från start om flaggan redan är satt (sedd tidigare)', () => {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.open).toBe(false);
  });

  it('next() går steg för steg och stänger + persistar på sista steget', () => {
    const { result } = renderHook(() => useOnboarding());
    // Klicka "Nästa" tills vi når sista steget.
    for (let i = 0; i < ONBOARDING_STEP_COUNT - 1; i += 1) {
      expect(result.current.onLastStep).toBe(false);
      act(() => result.current.next());
    }
    expect(result.current.stepIndex).toBe(ONBOARDING_STEP_COUNT - 1);
    expect(result.current.onLastStep).toBe(true);
    expect(result.current.open).toBe(true);

    // "Klart" på sista steget: stänger + sätter flaggan.
    act(() => result.current.next());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
  });

  it('finish() (Hoppa över) stänger direkt + persistar, oavsett steg', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.finish());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
  });

  it('förblir stängd vid en ny mount efter att ha avslutats (visas aldrig igen)', () => {
    const first = renderHook(() => useOnboarding());
    act(() => first.result.current.finish());
    // Ny komponent-instans (ny mount): touren ska inte dyka upp igen.
    const second = renderHook(() => useOnboarding());
    expect(second.result.current.open).toBe(false);
  });
});
