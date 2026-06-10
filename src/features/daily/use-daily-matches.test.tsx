import { act, render, renderHook, waitFor } from '@testing-library/react';
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

// Två speldagar med en VILODAG emellan (06-11, [06-12 vilodag], 06-13), för att
// pröva start-/navigerings-beteendet kring tomma dagar (C7).
function spanWithRestDay(): MatchDay[] {
  return groupMatchesByDay([
    sched('p1', '2026-06-11T17:00:00.000Z'),
    sched('p2', '2026-06-13T17:00:00.000Z'),
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

  it('landar på en VILODAG när "idag" är en vilodag mitt i spannet (C7, dokumenterat val)', () => {
    // Spann: 06-11 (spel), 06-12 (vilodag), 06-13 (spel). "Idag" = 06-12 ska
    // landa på vilodagen (index 1), inte tvinga fram nästa speldag. Vyn visar då
    // vilodags-panelen. Se decisions.md (Copilot R2, C7).
    const days = spanWithRestDay(); // 2026-06-11, -12 (vilodag), -13
    expect(days[1].matches).toEqual([]); // bekräfta att index 1 verkligen är vilodagen
    expect(initialDayIndex(days, new Date('2026-06-12T08:00:00.000Z'))).toBe(1);
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

describe('useDailyMatches, startdagen härleds SYNKRONT (ingen tom-dag-flicker)', () => {
  // REGRESSION (Copilot R1, C1): startdagen sattes tidigare via en useEffect, så
  // det fanns en render där status==='ready' och days.length>0 men
  // selectedDay===null -> vyn kunde flicker-visa tom-dag-panelen fast matcher
  // fanns. Kravet: PÅ DEN ALLRA FÖRSTA ready-render:en (innan någon effekt hunnit
  // köra) ska selectedDay redan peka på en dag. Vi mäter det genom att läsa
  // hooken-värdet i exakt det ögonblick status blir 'ready', utan en mellanliggande
  // act/flush som skulle dölja glipan.
  it('har en vald dag REDAN i samma render som status blir ready (aldrig null med dagar)', async () => {
    // Fånga varje render-snapshot, så vi kan inspektera den FÖRSTA ready-render:en.
    const snapshots: Array<{ status: string; daysLen: number; hasSelectedDay: boolean }> = [];
    function Probe() {
      const d = useDailyMatches(new Date('2026-06-01T00:00:00.000Z'));
      snapshots.push({
        status: d.status,
        daysLen: d.days.length,
        hasSelectedDay: d.selectedDay !== null,
      });
      return null;
    }
    render(<Probe />, { wrapper: wrapperFor(fixturesEnv()) });

    await waitFor(() => {
      expect(snapshots.some((s) => s.status === 'ready' && s.daysLen > 0)).toBe(true);
    });

    // INVARIANT: i ingen render får det finnas dagar (ready) utan en vald dag.
    const flickerRender = snapshots.find(
      (s) => s.status === 'ready' && s.daysLen > 0 && !s.hasSelectedDay
    );
    expect(flickerRender).toBeUndefined();
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

  it('en VILODAG i schemat är nåbar via navigeringen och visar tom-dag-tillståndet (C7)', async () => {
    // VM 2026 (fixtures) spelas 11 juni-19 juli och HAR vilodagar mellan ronderna.
    // Kompletthetskravet (issue #7 DoD): navigeringen ska kunna landa på en sådan
    // dag, då har selectedDay matches=[] (vyn visar vilodags-panelen).
    const before = new Date('2026-06-01T00:00:00.000Z');
    const { result } = renderHook(() => useDailyMatches(before), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.selectedIndex).toBeGreaterThanOrEqual(0));

    // Det finns minst en vilodag i spannet (annars vore C7-kravet inte prövbart).
    const restDayIndex = result.current.days.findIndex((d) => d.matches.length === 0);
    expect(restDayIndex).toBeGreaterThan(-1);

    // Navigera dit och bekräfta tom-dag-tillståndet.
    act(() => result.current.goToIndex(restDayIndex));
    await waitFor(() => expect(result.current.selectedIndex).toBe(restDayIndex));
    expect(result.current.selectedDay?.matches).toEqual([]);
    // På en vilodag finns ingen "dagens match".
    expect(result.current.matchOfTheDay).toBeNull();
  });

  it('första dagen är kant-disabled bakåt och sista dagen kant-disabled framåt (oförändrat med vilodagar)', async () => {
    const before = new Date('2026-06-01T00:00:00.000Z');
    const { result } = renderHook(() => useDailyMatches(before), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const total = result.current.days.length;
    act(() => result.current.goToIndex(0));
    await waitFor(() => expect(result.current.selectedIndex).toBe(0));
    expect(result.current.canGoPrev).toBe(false);
    expect(result.current.canGoNext).toBe(true);

    act(() => result.current.goToIndex(total - 1));
    await waitFor(() => expect(result.current.selectedIndex).toBe(total - 1));
    expect(result.current.canGoNext).toBe(false);
    expect(result.current.canGoPrev).toBe(true);
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
