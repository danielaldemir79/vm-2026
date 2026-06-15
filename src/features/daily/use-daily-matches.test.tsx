import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ResultsProvider } from '../results/ResultsProvider';
import { useResultsStore } from '../results/results-context';
import { followDayIndex, initialDayIndex, useDailyMatches } from './use-daily-matches';
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

/** Som sched men FÄRDIGSPELAD (bär ett resultat), för fokus-flytt-testerna (T57). */
function finishedMatch(id: string, kickoff: string): Match {
  return { ...sched(id, kickoff), status: 'finished', result: { homeGoals: 1, awayGoals: 0 } };
}

/** Som sched men PÅGÅENDE (live, inget resultat än), för rollover-testerna (T93). */
function liveMatch(id: string, kickoff: string): Match {
  return { ...sched(id, kickoff), status: 'live', result: null };
}

/**
 * En kombinerad hook: den dagliga vyns data PLUS storens lågnivå-setMatches, så
 * ett test kan styra matchlistan deterministiskt (samma seam T18/tester använder)
 * och observera hur den dagliga härledningen reagerar. `now` injiceras vidare så
 * startdagen är deterministisk.
 */
function useDailyWithStore(now?: Date | number) {
  const daily = useDailyMatches(now);
  const { setMatches } = useResultsStore();
  return { daily, setMatches };
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

describe('followDayIndex, rollover när dagens sista match är slut (T93, #186)', () => {
  // T93 (Daniels live-bugg ~2026-06-15 23:07): "dagens match"/hero stod kvar på en
  // FÄRDIGSPELAD match medan nedräkningen redan pekade på nästa kommande avspark, som
  // tillhör NÄSTA svenska kalenderdag (en match med svensk avspark 00:00 ligger på
  // dagen EFTER i Europe/Stockholm). Den auto-valda dagen var rent kalender-baserad
  // (initialDayIndex) och rullade bara vid kalender-midnatt. followDayIndex lägger
  // Daniels regel ovanpå: är HELA dagens speldag färdigspelad, blicka mot dagen för
  // nästa KOMMANDE match (samma sanning som nedräkningen, computeCountdown).

  // Daniels exakta scenario, datum ur fixtures (matches.ts): civ-ecu spelas svensk
  // 15 juni 01:00 (kickoff 06-14T23:00Z), ksa-uru svensk 16 juni 00:00 (kickoff
  // 06-15T22:00Z). Kvällen 15 juni är alla 15-junimatcher klara, men nästa avspark
  // (ksa-uru) ligger på svenska dagen 16 juni.
  function midnightSeamSpan(): {
    days: MatchDay[];
    matches: Match[];
  } {
    const matches: Match[] = [
      // 15 juni (svensk): färdigspelade när "nu" är kväll.
      finishedMatch('civ-ecu', '2026-06-14T23:00:00.000Z'), // svensk 15 juni 01:00
      finishedMatch('esp-cpv', '2026-06-15T16:00:00.000Z'), // svensk 15 juni 18:00
      finishedMatch('bel-egy', '2026-06-15T19:00:00.000Z'), // svensk 15 juni 21:00
      // 16 juni (svensk): nästa kommande avspark, avspark exakt svensk midnatt.
      sched('ksa-uru', '2026-06-15T22:00:00.000Z'), // svensk 16 juni 00:00
    ];
    return { days: groupMatchesByDay(matches), matches };
  }

  it('Daniels scenario: kvällen efter dagens sista match rullar till nästa matchdag (ej kvar på gårdagskänslan)', () => {
    const { days, matches } = midnightSeamSpan();
    // Bekräfta att fällan finns i datan: ksa-uru tillhör en SENARE svensk dag.
    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-15', '2026-06-16']);
    // "Nu" = 2026-06-15 23:07 svensk (21:07Z), exakt Daniels skärmdumps-läge.
    const now = new Date('2026-06-15T21:07:00.000Z');
    // Rent kalender-val (gammalt beteende) hade stannat på index 0 (15 juni) ...
    expect(initialDayIndex(days, now)).toBe(0);
    // ... men followDayIndex blickar mot nästa matchdag (16 juni), där nästa avspark är.
    expect(followDayIndex(days, matches, now)).toBe(1);
  });

  it('stannar på idag medan dagens match fortfarande är OSPELAD (kommande eller live)', () => {
    // En av dagens matcher är fortfarande ospelad (live): stå kvar på idag. days och
    // matches härleds ur SAMMA källa så dagens bucket speglar den live-matchen.
    const matches: Match[] = [
      finishedMatch('civ-ecu', '2026-06-14T23:00:00.000Z'),
      finishedMatch('esp-cpv', '2026-06-15T16:00:00.000Z'),
      liveMatch('bel-egy', '2026-06-15T19:00:00.000Z'), // pågår nu
      sched('ksa-uru', '2026-06-15T22:00:00.000Z'),
    ];
    const days = groupMatchesByDay(matches);
    const now = new Date('2026-06-15T19:30:00.000Z'); // bel-egy pågår (svensk 21:30)
    expect(followDayIndex(days, matches, now)).toBe(0); // 15 juni, en match lever än
  });

  it('mellan dagar utan kvarvarande match idag rullar till nästa kommande matchs dag', () => {
    // Tre speldagar, idag (mitten) helt färdigspelad, nästa avspark är dag 3.
    const matches: Match[] = [
      finishedMatch('d1', '2026-06-11T17:00:00.000Z'),
      finishedMatch('d2', '2026-06-12T17:00:00.000Z'), // idag, färdig
      sched('d3', '2026-06-13T17:00:00.000Z'), // nästa kommande
    ];
    const days = groupMatchesByDay(matches);
    const now = new Date('2026-06-12T20:00:00.000Z'); // efter d2:s avspark, svensk 12 juni 22:00
    expect(initialDayIndex(days, now)).toBe(1); // kalender-idag = 12 juni
    expect(followDayIndex(days, matches, now)).toBe(2); // rullar till 13 juni
  });

  it('SISTA speldagen: efter turneringens sista match finns ingen kommande, stanna på sista dagen', () => {
    const matches: Match[] = [
      finishedMatch('d1', '2026-06-11T17:00:00.000Z'),
      finishedMatch('final', '2026-06-12T17:00:00.000Z'), // sista matchen, spelad
    ];
    const days = groupMatchesByDay(matches);
    const now = new Date('2026-06-12T20:00:00.000Z'); // efter finalen
    // Ingen kommande match -> faller tillbaka på sista dagen (oförändrat sluttillstånd).
    expect(followDayIndex(days, matches, now)).toBe(days.length - 1);
  });

  it('en VILODAG som idag rullar INTE (inga matcher idag = ingen "sista match" att passera, C7 bevarad)', () => {
    // Spann: 06-11 (spel), 06-12 (vilodag), 06-13 (spel). "Idag" = vilodagen 06-12.
    // Daniels regel gäller "när dagens sista match är slut"; en vilodag har ingen
    // match idag, så C7:s dokumenterade vilodags-beteende behålls (stå kvar, visa
    // vilodags-panelen) i stället för att tyst rulla förbi den.
    const days = spanWithRestDay();
    const matches: Match[] = [
      sched('p1', '2026-06-11T17:00:00.000Z'),
      sched('p2', '2026-06-13T17:00:00.000Z'),
    ];
    const now = new Date('2026-06-12T08:00:00.000Z'); // vilodagen
    expect(followDayIndex(days, matches, now)).toBe(1); // kvar på vilodagen (= initialDayIndex)
  });

  it('FÖRE turneringen pekar fortfarande mot premiären (oförändrat)', () => {
    const matches: Match[] = [
      sched('d1', '2026-06-11T17:00:00.000Z'),
      sched('d2', '2026-06-12T17:00:00.000Z'),
    ];
    const days = groupMatchesByDay(matches);
    const now = new Date('2026-06-09T08:00:00.000Z'); // före 11 juni
    expect(followDayIndex(days, matches, now)).toBe(0); // premiären
  });

  it('tom dag-lista ger -1 (ingen krasch)', () => {
    expect(followDayIndex([], [], new Date('2026-06-12T08:00:00.000Z'))).toBe(-1);
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

describe('useDailyMatches, fokus (matchOfTheDay) lyfter nästa match när den aktuella blir spelad (T57, krav 1)', () => {
  it('matchOfTheDay flyttar från en avgjord match till nästa ospelade UTAN reload', async () => {
    // Två matcher SAMMA svenska dag (11 juni): en tidig, en sen. "Idag" = 11 juni.
    const today = new Date('2026-06-11T17:30:00.000Z'); // mellan en tänkt tidig och sen avspark
    const tidig = sched('tidig', '2026-06-11T16:00:00.000Z');
    const sen = sched('sen', '2026-06-11T19:00:00.000Z');

    const { result } = renderHook(() => useDailyWithStore(today), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.daily.status).toBe('ready'));

    // Sätt vår tvådagars-dag som matchlista. Bägge ospelade -> fokus = den tidiga.
    act(() => result.current.setMatches([tidig, sen]));
    await waitFor(() => expect(result.current.daily.matchOfTheDay?.id).toBe('tidig'));

    // Slutsignal: den tidiga matchen blir 'finished' (det den vävda facit-datan
    // gör live). Fokus ska FLYTTA till nästa ospelade match, utan omladdning.
    act(() => result.current.setMatches([finishedMatch('tidig', '2026-06-11T16:00:00.000Z'), sen]));
    await waitFor(() => expect(result.current.daily.matchOfTheDay?.id).toBe('sen'));
  });

  it('när dagens SISTA match blivit spelad behåller hero den (med resultat), försvinner inte', async () => {
    const today = new Date('2026-06-11T17:30:00.000Z');
    const tidig = finishedMatch('tidig', '2026-06-11T16:00:00.000Z');
    const sen = sched('sen', '2026-06-11T19:00:00.000Z');

    const { result } = renderHook(() => useDailyWithStore(today), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.daily.status).toBe('ready'));

    act(() => result.current.setMatches([tidig, sen]));
    await waitFor(() => expect(result.current.daily.matchOfTheDay?.id).toBe('sen'));

    // Hela dagen spelad: fokus faller tillbaka på dagens tidigaste match (med
    // resultat), hero blir inte tomt.
    act(() => result.current.setMatches([tidig, finishedMatch('sen', '2026-06-11T19:00:00.000Z')]));
    await waitFor(() => {
      expect(result.current.daily.matchOfTheDay).not.toBeNull();
      expect(result.current.daily.matchOfTheDay?.id).toBe('tidig');
    });
  });
});

describe('useDailyMatches, dag-bläddraren auto-flyttar till AKTUELL dag vid midnatt (T57, krav 2)', () => {
  // Fejka BARA Date (inte alla timers), så waitFor:s interna polling (riktiga
  // setTimeout) fortsätter fungera medan vi kontrollerar "vad är idag" (känd fälla
  // `fejka-bara-Date-med-toFake-Date-nar-komponenten-seedar-async`, playbook). Dygns-
  // växlingen triggas via visibilitychange (PWA-väcknings-vägen i useTodayKey, läser
  // Date.now() direkt) i stället för minut-tick-intervallet, så testet är
  // deterministiskt utan att driva tusentals fejkade sekund-tick.
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('den valda dagen flyttar från igår till idag när dygnet växlar, utan reload', async () => {
    // Start strax före svensk midnatt 11->12 juni (23:59 svensk = 21:59Z). "Idag"
    // = 11 juni, så startdagen ska vara 11 juni.
    vi.setSystemTime(new Date('2026-06-11T21:59:00.000Z'));
    const { result } = renderHook(() => useDailyWithStore(), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.daily.status).toBe('ready'));

    // Sätt en matchlista som SPÄNNER 11-12 juni så bägge dagarna finns i listan.
    act(() =>
      result.current.setMatches([
        sched('d1', '2026-06-11T17:00:00.000Z'),
        sched('d2', '2026-06-12T17:00:00.000Z'),
      ])
    );
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-11'));

    // Passera midnatt (svensk 00:01 den 12:e = 22:01Z) och fyra visibilitychange
    // (appen blir synlig igen): useTodayKey räknar om dagen OMEDELBART. Bläddraren
    // ska nu stå på 12 juni, utan att användaren navigerat och utan en omladdning.
    act(() => {
      vi.setSystemTime(new Date('2026-06-11T22:01:00.000Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-12'));
  });

  it('bläddrar användaren bort och TILLBAKA till idag återupptas följ-läget (dygnsväxling flyttar igen)', async () => {
    // REGRESSION (reviewerns F1): goToIndex pinnade tidigare ALLTID den valda
    // dagens nyckel, även när målet var den härledda aktuella dagen. Bläddrade
    // användaren bort och tillbaka till idag blev idag PERMANENT pinnad, så nästa
    // dygnsväxling i en öppen flik flyttade INTE bläddraren (Daniels symptom, fast
    // efter en bläddring i samma session). Kravet: navigering till idag ska
    // NOLLSTÄLLA pinningen så följ-läget återupptas.
    vi.setSystemTime(new Date('2026-06-11T21:59:00.000Z')); // 23:59 svensk 11 juni
    const { result } = renderHook(() => useDailyWithStore(), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.daily.status).toBe('ready'));

    act(() =>
      result.current.setMatches([
        sched('d1', '2026-06-11T17:00:00.000Z'),
        sched('d2', '2026-06-12T17:00:00.000Z'),
      ])
    );
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-11'));

    // Bläddra FRAMÅT till 12 juni (pinnar), sedan TILLBAKA till idag (11 juni).
    act(() => result.current.daily.goToIndex(1));
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-12'));
    act(() => result.current.daily.goToIndex(0)); // 0 = idag, den härledda aktuella dagen
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-11'));

    // Dygnet 11->12 växlar: eftersom följ-läget återupptogs (pinningen nollställd)
    // ska bläddraren auto-flytta till 12 juni, precis som om användaren aldrig hade
    // bläddrat. Hade idag blivit pinnad skulle den stå kvar på 11 juni.
    act(() => {
      vi.setSystemTime(new Date('2026-06-11T22:01:00.000Z')); // 00:01 svensk 12 juni
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-12'));
  });

  it('om användaren MEDVETET bläddrat till en dag stannar den kvar när dygnet växlar (hoppar inte under hen)', async () => {
    vi.setSystemTime(new Date('2026-06-11T21:59:00.000Z'));
    const { result } = renderHook(() => useDailyWithStore(), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.daily.status).toBe('ready'));

    act(() =>
      result.current.setMatches([
        sched('d1', '2026-06-11T17:00:00.000Z'),
        sched('d2', '2026-06-12T17:00:00.000Z'),
        sched('d3', '2026-06-13T17:00:00.000Z'),
      ])
    );
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-11'));

    // Användaren bläddrar FRAMÅT till 13 juni (pinnar dagen).
    act(() => result.current.daily.goToIndex(2));
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-13'));

    // Dygnet 11->12 växlar: den PINNADE dagen (13 juni) ska INTE flytta, så
    // användaren tappar inte sin plats i resultaten hen bläddrar i.
    act(() => {
      vi.setSystemTime(new Date('2026-06-11T22:01:00.000Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Ge eventuell omräkning en chans att slå igenom, bekräfta sedan oförändrat.
    await waitFor(() => expect(result.current.daily.status).toBe('ready'));
    expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-13');
  });
});

describe('useDailyMatches, hero rullar till nästa matchdag när dagens sista match är slut (T93, #186)', () => {
  it('vald dag + matchOfTheDay blickar mot nästa KOMMANDE match, aldrig en spelad gårdagsmatch', async () => {
    // Daniels scenario END-TO-END genom hooken: kvällen 15 juni (svensk 23:07), alla
    // 15-junimatcher färdigspelade, nästa avspark (ksa-uru) ligger på svenska 16 juni
    // (avspark exakt svensk midnatt, kickoff 06-15T22:00Z). Vyn ska rulla till 16 juni
    // OCH peka på ksa-uru, inte stå kvar på den spelade civ-ecu (Daniels rapport).
    const now = new Date('2026-06-15T21:07:00.000Z');
    const { result } = renderHook(() => useDailyWithStore(now), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.daily.status).toBe('ready'));

    act(() =>
      result.current.setMatches([
        finishedMatch('civ-ecu', '2026-06-14T23:00:00.000Z'), // svensk 15 juni 01:00, spelad
        finishedMatch('esp-cpv', '2026-06-15T16:00:00.000Z'), // svensk 15 juni 18:00, spelad
        finishedMatch('bel-egy', '2026-06-15T19:00:00.000Z'), // svensk 15 juni 21:00, spelad
        sched('ksa-uru', '2026-06-15T22:00:00.000Z'), // svensk 16 juni 00:00, kommande
      ])
    );

    // Den valda dagen rullar till nästa matchdag (16 juni) och hero pekar på ksa-uru,
    // konsekvent med nedräkningen (samma nästa-kommande-sanning, computeCountdown).
    await waitFor(() => expect(result.current.daily.selectedDay?.dateKey).toBe('2026-06-16'));
    expect(result.current.daily.matchOfTheDay?.id).toBe('ksa-uru');
    expect(result.current.daily.countdown.kind).toBe('upcoming');
    if (result.current.daily.countdown.kind === 'upcoming') {
      // EN sanning: hero-dagens match === nedräkningens nästa avspark.
      expect(result.current.daily.countdown.match.id).toBe('ksa-uru');
    }
  });
});
