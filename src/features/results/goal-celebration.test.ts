import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalCelebration } from './goal-celebration';

// Styr reducerad rörelse per test (samma mock-mönster som motion-primitives.test).
const mockUseReducedMotion = vi.fn<() => boolean>();
vi.mock('motion/react', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

beforeEach(() => {
  mockUseReducedMotion.mockReturnValue(false); // default: rörelse tillåten
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useGoalCelebration, trigger', () => {
  it('tänder ett firande för en match med mål', () => {
    const { result } = renderHook(() => useGoalCelebration());
    expect(result.current.celebration).toBeNull();

    act(() => result.current.celebrateGoal('m1', 3));

    expect(result.current.celebration).not.toBeNull();
    expect(result.current.celebration?.matchId).toBe('m1');
    expect(result.current.celebration?.totalGoals).toBe(3);
  });

  it('ger ett UNIKT key per firande, även för samma match (re-mountar animationen)', () => {
    const { result } = renderHook(() => useGoalCelebration());
    act(() => result.current.celebrateGoal('m1', 1));
    const firstKey = result.current.celebration?.key;
    act(() => result.current.celebrateGoal('m1', 2));
    const secondKey = result.current.celebration?.key;
    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(secondKey).not.toBe(firstKey);
  });

  it('auto-avklingar firandet efter sin varaktighet', () => {
    const { result } = renderHook(() => useGoalCelebration());
    act(() => result.current.celebrateGoal('m1', 2));
    expect(result.current.celebration).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(result.current.celebration).toBeNull();
  });

  it('dismiss stänger ett pågående firande direkt', () => {
    const { result } = renderHook(() => useGoalCelebration());
    act(() => result.current.celebrateGoal('m1', 2));
    act(() => result.current.dismiss());
    expect(result.current.celebration).toBeNull();
  });
});

describe('useGoalCelebration, edge-fall + a11y', () => {
  it('firar INTE ett mållöst resultat (0-0)', () => {
    const { result } = renderHook(() => useGoalCelebration());
    act(() => result.current.celebrateGoal('m1', 0));
    expect(result.current.celebration).toBeNull();
  });

  it('firar INTE vid reducerad rörelse (WCAG 2.3.3), inmatningen påverkas inte', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useGoalCelebration());
    act(() => result.current.celebrateGoal('m1', 4));
    expect(result.current.celebration).toBeNull();
  });
});
