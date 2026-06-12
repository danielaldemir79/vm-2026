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
import { useTodayKey } from './use-today-key';

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
 * Hitta startdagen i `days` (som nu rymmer VARJE kalenderdag i turneringsspannet,
 * även vilodagar, se groupMatchesByDay):
 *  - "Idag" om dagens svenska datum ligger inom spannet, OAVSETT om det är en
 *    speldag eller en vilodag. En vilodag som "idag" landar alltså på vilodagen
 *    och vyn visar vilodags-panelen (Copilot R2, C7: medvetet och dokumenterat
 *    beteende, decisions.md). Det är mer intuitivt än att tvinga fram nästa
 *    speldag mitt under ett pågående mästerskap, användaren vill se "idag".
 *  - NÄRMAST kommande dag om "idag" ligger FÖRE spannet ("idag" före 11 juni
 *    2026 -> premiären).
 *  - Sista dagen om allt redan är passerat. Returnerar -1 bara för en tom lista.
 *
 * @param days  Dagarna i kronologisk ordning (speldagar OCH vilodagar).
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
  // jämförelse på ISO-form). Eftersom spannet nu är komplett (inga hål) matchar
  // detta EXAKT "idag" när idag ligger i spannet (speldag eller vilodag), annars
  // premiären (idag före spannet) via det första framtida datumet.
  const idx = days.findIndex((d) => d.dateKey >= todayKey);
  // -1 = hela spannet ligger i det förflutna -> visa den sista (mest aktuella).
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

  // DAG-MEDVETET "nu" (T57, #98): startdagen ska FÖLJA den verkliga dagen utan en
  // omladdning. useTodayKey äger ett "nu" som FLYTTAR sig vid midnatt (minut-tick,
  // gatad på dygnsväxling) och vid flik-väckning (visibilitychange, PWA-fälla),
  // ÅTERANVÄNT här (ingen ny polling, DRY) i stället för det mount-frusna `now`.
  // `now` injiceras fortfarande i test för en deterministisk första dag; i appen
  // är default Date.now() och ticken tar över. nowMs är referens-stabilt inom en
  // dag, så följande härledning räknas bara om vid ett FAKTISKT dygnsbyte.
  const { nowMs: liveNowMs } = useTodayKey(now);

  // Användarens MEDVETET valda dag (nyckel) eller null = "följ den verkliga dagen".
  // Null låter startdags-härledningen (initialDayIndex mot liveNowMs) styra, så
  // bläddraren auto-flyttar till AKTUELL dag vid midnatt. Navigering sätter en
  // nyckel och PINNAR dagen (då vinner användarens val, dagen hoppar inte under
  // hen). Nyckel (inte index) är stabil om dag-listan ändrar längd (realtidskälla).
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  // EFFEKTIVT index, härlett SYNKRONT i render (inte via en effekt): finns en
  // pinnad nyckel kvar i dagarna används den, annars den HÄRLEDDA aktuella dagen
  // (initialDayIndex mot det dag-medvetna liveNowMs). VARFÖR synkront: en useEffect
  // körs FÖRST efter första commit, så en effekt-initierad nyckel ger en render där
  // status==='ready' och days.length>0 men selectedDay===null -> vyn skulle
  // flicker-visa tom-dag-panelen fast matcher finns (Copilot R1, C1). Genom att
  // härleda i render finns den glipan aldrig: redan första ready-render har en dag.
  // En pinnad nyckel som FALLER UR listan (t.ex. dag-listan krymper) ignoreras och
  // härledningen tar över igen (findIndex ger -1 -> fallback).
  const selectedIndex = useMemo(() => {
    if (days.length === 0) {
      return -1;
    }
    const pinnedIdx = pinnedKey === null ? -1 : days.findIndex((d) => d.dateKey === pinnedKey);
    return pinnedIdx !== -1 ? pinnedIdx : initialDayIndex(days, liveNowMs);
  }, [days, pinnedKey, liveNowMs]);
  const selectedDay = selectedIndex === -1 ? null : days[selectedIndex];

  // Dagens framträdande match (ren, deterministisk regel: tidigaste OSPELADE, T57).
  // Beror på selectedDay, som får en ny referens när ett resultat vävs in (matches
  // -> days -> selectedDay), så fokus räknas om och lyfter nästa match automatiskt
  // när den aktuella blir 'finished' (ingen ny polling, samma weave/tick-drivning).
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
      // Navigerar användaren till den dag som ÄR den härledda aktuella dagen (t.ex.
      // bläddrar bort och TILLBAKA till idag), NOLLSTÄLL pinningen -> follow-läget
      // återupptas, så nästa dygnsväxling auto-flyttar bläddraren igen. Annars
      // permanent-pinnades idag av en bläddring och bläddraren skulle stå kvar på
      // gårdagen vid midnatt (Daniels rapporterade symptom, efter en bläddring i
      // samma öppna flik). Pinnad på en ANNAN dag = orörd: en medveten dag stannar
      // (hoppar aldrig under hen). Samma härledning (initialDayIndex mot det
      // dag-medvetna liveNowMs) som selectedIndex använder, så "är idag?" är EN regel.
      const todayIdx = initialDayIndex(days, liveNowMs);
      setPinnedKey(index === todayIdx ? null : days[index].dateKey);
    },
    [days, liveNowMs]
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
