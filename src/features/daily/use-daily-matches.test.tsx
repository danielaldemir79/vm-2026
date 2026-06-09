import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ResultsProvider } from '../results/ResultsProvider';
import { initialDayIndex, useDailyMatches } from './use-daily-matches';
import { groupMatchesByDay, type MatchDay } from './group-matches-by-day';
import type { Match } from '../../domain/types';

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function wrapperFor(env: ImportMetaEnv) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ResultsProvider env={env}>{children}</ResultsProvider>;
  };
}

function sched(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff,
    venue: 'Arena ej verifierad (egen data-punkt)',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

// Tre på varandra följande svenska speldagar (för navigerings-testerna).
function threeDays(): MatchDay[] {
  return groupMatchesByDay([
    sched('d1', '2026-06-11T17:00:00.000Z'),
    sched('d2', '2026-06-12T17:00:00.000Z'),
    sched('d3', '2026-06-13T17:00:00.000Z'),
  ]);
}

describe('initialDayIndex, startdag = idag eller närmast kommande speldag', () => {
  const days = threeDays(); // 2026-06-11, -12, -13 (svensk)

  it('väljer dagens datum när det är en speldag', () => {
    expect(initialDayIndex(days, new Date('2026-06-12T08:00:00.000Z'))).toBe(1);
  });

  it('pekar mot PREMIÄREN när "idag" ligger före turneringen (normalfall nu)', () => {
    // "Idag" 2026-06-09 (före 11 juni) -> närmast kommande speldag = index 0.
    expect(initialDayIndex(days, new Date('2026-06-09T08:00:00.000Z'))).toBe(0);
  });

  it('faller tillbaka på sista dagen när allt redan är spelat', () => {
    expect(initialDayIndex(days, new Date('2026-07-01T08:00:00.000Z'))).toBe(2);
  });

  it('ger -1 för en helt tom lista', () => {
    expect(initialDayIndex([], new Date('2026-06-12T08:00:00.000Z'))).toBe(-1);
  });
});

describe('useDailyMatches, laddning + härledning ur den delade storen', () => {
  it('går loading -> ready och härleder speldagar ur fixtures', async () => {
    const { result } = renderHook(() => useDailyMatches(), { wrapper: wrapperFor(fixturesEnv()) });

    expect(result.current.status).toBe('loading');
    expect(result.current.days).toHaveLength(0);

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.days.length).toBeGreaterThan(0);
    expect(result.current.mode).toBe('fixtures');
    expect(result.current.selectedDay).not.toBeNull();
    // Dagens framträdande match är dagens tidigaste.
    expect(result.current.matchOfTheDay).not.toBeNull();
  });
});

describe('useDailyMatches, datumnavigering', () => {
  it('bläddrar framåt och bakåt mellan speldagar och respekterar kanterna', async () => {
    // Injicera "nu" = före turneringen så starten landar på första speldagen.
    const before = new Date('2026-06-01T00:00:00.000Z');
    const { result } = renderHook(() => useDailyMatches(before), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.selectedIndex).toBeGreaterThanOrEqual(0));

    const startIndex = result.current.selectedIndex;
    // Vid första dagen ska "föregående" vara avstängt.
    expect(result.current.canGoPrev).toBe(startIndex > 0);

    // Bläddra framåt en dag.
    const total = result.current.days.length;
    act(() => result.current.goNext());
    await waitFor(() => expect(result.current.selectedIndex).toBe(startIndex + 1));

    // Bläddra tillbaka.
    act(() => result.current.goPrev());
    await waitFor(() => expect(result.current.selectedIndex).toBe(startIndex));

    // goToIndex utanför intervall ignoreras (ingen krasch, ingen ändring).
    act(() => result.current.goToIndex(total + 5));
    expect(result.current.selectedIndex).toBe(startIndex);

    // Vid sista dagen ska "nästa" vara avstängt.
    act(() => result.current.goToIndex(total - 1));
    await waitFor(() => expect(result.current.selectedIndex).toBe(total - 1));
    expect(result.current.canGoNext).toBe(false);
  });
});

describe('useDailyMatches, live-nedräkning tickar via en timer (UI-tick skilt från logik)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('nedräkningen räknas om när tiden tickar fram', async () => {
    // Sätt en fast verklig systemtid via fake timers, före premiären.
    vi.setSystemTime(new Date('2026-06-11T18:59:50.000Z')); // 10 sek före 19:00-avspark
    const { result } = renderHook(() => useDailyMatches(), { wrapper: wrapperFor(fixturesEnv()) });

    // Låt seedningens promise settla under fake timers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('ready');

    const first = result.current.countdown;
    expect(first.kind).toBe('upcoming');

    // Tick 5 sekunder: nedräkningen ska ha minskat (sekunderna räknas ned).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    const later = result.current.countdown;
    expect(later.kind).toBe('upcoming');
    if (first.kind === 'upcoming' && later.kind === 'upcoming') {
      expect(later.remaining.totalMs).toBeLessThan(first.remaining.totalMs);
    }
  });
});
