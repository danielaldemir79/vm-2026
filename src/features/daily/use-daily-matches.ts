// React-hook som matar den dagliga matchvyn (T7, issue #7).
//
// Ansvar (tunt): läsa den DELADE results-storen (matcher = en sanning), HÄRLEDA
// speldagarna (groupMatchesByDay, svensk tid) reaktivt, äga DATUMNAVIGERINGEN
// (vald dag + prev/next) och driva den LIVE-tickande nedräkningen. Härledningen
// är rena funktioner (group-matches-by-day, countdown); hooken äger bara React-
// state (vald dag, tick) och I/O-fritt urval, samma uppdelning som useGroupData
// (härledd-state-vy-mönstret, docs/patterns.md).
//
// LIVE-tick: nedräkningen i hero:n ska räkna ned i realtid, men SJÄLVA
// beräkningen är ren (computeCountdown(matches, now)). Hooken håller bara ett
// "nu" i state som en setInterval bumpar varje sekund, och låter den rena
// funktionen räkna om. UI-tickandet (sido-effekten) är alltså skilt från logiken
// (testbar utan timers), per direktivet.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataSourceMode } from '../../data';
import type { Match } from '../../domain/types';
import { useResultsStore } from '../results/results-context';
import { groupMatchesByDay, localDateKey, type MatchDay } from './group-matches-by-day';
import { computeCountdown, selectMatchOfTheDay, type CountdownState } from './countdown';

/** Laddningstillstånd, samma vokabulär som resten av appen. */
export type LoadStatus = 'loading' | 'ready' | 'error';

/** Allt den dagliga vyn behöver från hooken. */
export interface DailyMatchesData {
  status: LoadStatus;
  mode: DataSourceMode;
  error: string | null;
  /** Lagen, för att slå upp namn/landskod per teamId i matchkorten. */
  teams: ReturnType<typeof useResultsStore>['teams'];
  /** Alla speldagar i kronologisk ordning (svensk tid), tomt utom vid ready. */
  days: MatchDay[];
  /** Index i `days` för den valda dagen, eller -1 om det inte finns någon dag. */
  selectedIndex: number;
  /** Den valda dagen, eller null om det inte finns någon speldag alls. */
  selectedDay: MatchDay | null;
  /** Dagens framträdande match (deterministisk regel), null på en tom dag. */
  matchOfTheDay: Match | null;
  /** Live-tickande nedräkning till nästa kommande avspark (över ALLA matcher). */
  countdown: CountdownState;
  /** Kan man bläddra till en tidigare/senare speldag? (för knappars disabled). */
  canGoPrev: boolean;
  canGoNext: boolean;
  /** Stega till föregående/nästa speldag (no-op vid kant). */
  goPrev: () => void;
  goNext: () => void;
  /** Hoppa direkt till en speldag via dess index (utanför intervall ignoreras). */
  goToIndex: (index: number) => void;
}

/**
 * Hitta startdagen: dagens svenska datum om det är en speldag, annars den
 * NÄRMAST kommande speldagen (turneringen kan ligga i framtiden, "idag" före
 * 11 juni 2026 -> peka mot premiären). Faller tillbaka på sista dagen om allt
 * redan är spelat. Returnerar -1 bara för en helt tom lista.
 *
 * @param days  Speldagarna i kronologisk ordning.
 * @param now   "Nu" (injicerbart för test), används bara för att härleda dagens
 *              svenska datum-nyckel.
 */
export function initialDayIndex(
  days: readonly MatchDay[],
  now: Date | number = Date.now()
): number {
  if (days.length === 0) {
    return -1;
  }
  const todayKey = localDateKey(
    new Date(typeof now === 'number' ? now : now.getTime()).toISOString()
  );
  // Första dagen vars nyckel >= dagens nyckel (sträng-jämförelse = datum-
  // jämförelse på ISO-form). Det ger "idag om det spelas, annars nästa speldag".
  const idx = days.findIndex((d) => d.dateKey >= todayKey);
  // -1 = alla speldagar ligger i det förflutna -> visa den sista (mest aktuella).
  return idx === -1 ? days.length - 1 : idx;
}

export function useDailyMatches(now: Date | number = Date.now()): DailyMatchesData {
  const { status, matches, teams, mode, error } = useResultsStore();

  // Härled speldagarna reaktivt ur den delade storen. Gata på ready (annars []):
  // under en omladdning ligger gamla matcher kvar i storen, en oavkortad
  // härledning skulle exponera STALE dagar medan status är loading/error
  // (samma kontrakt som useGroupData, decisions.md C8).
  const days = useMemo(
    () => (status === 'ready' ? groupMatchesByDay(matches) : []),
    [status, matches]
  );

  // Vald dag som NYCKEL (inte index): index kan glida om dag-listan ändrar längd
  // (en framtida realtidskälla). Nyckeln är stabil; vi slår upp index ur den.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Sätt/synka startdagen när dagarna blir redo (eller listan ändras så att den
  // valda nyckeln inte längre finns). Körs bara när det behövs, inte varje render.
  useEffect(() => {
    if (days.length === 0) {
      if (selectedKey !== null) {
        setSelectedKey(null);
      }
      return;
    }
    const stillExists = selectedKey !== null && days.some((d) => d.dateKey === selectedKey);
    if (!stillExists) {
      const idx = initialDayIndex(days, now);
      setSelectedKey(idx === -1 ? null : days[idx].dateKey);
    }
    // `now` läses bara vid (om)initiering av startdagen; vi vill INTE re-initiera
    // varje sekund när tick-now ändras, så den ligger medvetet utanför deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, selectedKey]);

  const selectedIndex = useMemo(
    () => (selectedKey === null ? -1 : days.findIndex((d) => d.dateKey === selectedKey)),
    [days, selectedKey]
  );
  const selectedDay = selectedIndex === -1 ? null : days[selectedIndex];

  // Dagens framträdande match (ren, deterministisk regel).
  const matchOfTheDay = useMemo(
    () => (selectedDay ? selectMatchOfTheDay(selectedDay.matches) : null),
    [selectedDay]
  );

  // LIVE-tick: håll ett "nu" i state och bumpa det varje sekund, så den rena
  // nedräknings-funktionen räknas om. Initieras ur det injicerade `now` (så
  // tester är deterministiska); i appen är det aktuell tid och intervallet tar
  // över. Intervallet städas vid unmount (ingen läckande timer).
  const initialNowMs = typeof now === 'number' ? now : now.getTime();
  const [nowMs, setNowMs] = useState(initialNowMs);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Nedräkningen räknas över ALLA matcher (nästa avspark är inte nödvändigtvis på
  // den valda dagen), så hero:n alltid pekar mot turneringens nästa avspark.
  const countdown = useMemo(
    () =>
      status === 'ready' ? computeCountdown(matches, nowMs) : { kind: 'no-upcoming' as const },
    [status, matches, nowMs]
  );

  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex !== -1 && selectedIndex < days.length - 1;

  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= days.length) {
        return; // utanför intervall: ignorera (knapparna är ändå disabled vid kant)
      }
      setSelectedKey(days[index].dateKey);
    },
    [days]
  );
  const goPrev = useCallback(() => goToIndex(selectedIndex - 1), [goToIndex, selectedIndex]);
  const goNext = useCallback(() => goToIndex(selectedIndex + 1), [goToIndex, selectedIndex]);

  return {
    status,
    mode,
    error,
    teams,
    days,
    selectedIndex,
    selectedDay,
    matchOfTheDay,
    countdown,
    canGoPrev,
    canGoNext,
    goPrev,
    goNext,
    goToIndex,
  };
}
