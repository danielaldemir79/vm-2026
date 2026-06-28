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
import { resolveKnockoutTeams } from './resolve-knockout-teams';

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

/**
 * Den auto-valda ("följ verklig dag") dagen MED rollover efter dagens sista match
 * (T93, #186). Lägger Daniels regel ovanpå kalender-valet (initialDayIndex):
 *
 *   När HELA den kalendervalda dagens speldag är FÄRDIGSPELAD ska vyn blicka mot
 *   NÄSTA matchdag och peka på nästa KOMMANDE match , aldrig stå kvar och visa en
 *   redan spelad match som "dagens match".
 *
 * VARFÖR detta behövs utöver kalender-midnatt: en match med svensk avspark 00:00
 * (t.ex. ksa-uru, kickoff 2026-06-15T22:00Z) tillhör den svenska kalenderdagen
 * EFTER (Europe/Stockholm, se group-matches-by-day). Sent på kvällen 15 juni är
 * alla 15-junimatcher slut, men nästa avspark ligger redan på svenska dagen 16
 * juni. Det rena kalender-valet (initialDayIndex) rullar bara vid kalender-midnatt,
 * så hero:n stod kvar på 15 juni och `selectMatchOfTheDay` föll tillbaka på dagens
 * tidigaste (spelade) match , exakt Daniels live-bugg (skärmdump 2026-06-15 ~23:07:
 * hero på spelade Elfenbenskusten-Ecuador medan nedräkningen pekade på ksa-uru).
 *
 * EN SANNING (PRINCIPLES §4): "nästa kommande match" hämtas ur EXAKT samma logik
 * som hero:ns nedräkning (`computeCountdown`), så dagvalet och nedräkningen aldrig
 * kan divergera (det var själva asymmetrin i buggen , nedräkningen rullade, dagen
 * inte). Vi rullar bara till en dag SENARE än kalender-idag (nästa avspark kan på
 * en lång match-kväll fortfarande ligga på innevarande dag; då rör vi inget).
 *
 * BEVARAT beteende (rör inte det som inte är trasigt):
 *  - Dagens speldag har ännu en OSPELAD match (kommande ELLER live, status !==
 *    'finished'): stå kvar på idag (du vill se det som händer/strax händer idag).
 *  - Idag är en VILODAG (inga matcher idag): C7:s dokumenterade val behålls (stå
 *    kvar, visa vilodags-panelen). Regeln gäller "när dagens sista match är slut";
 *    en vilodag har ingen match att passera.
 *  - Idag ligger FÖRE turneringen: premiären (oförändrat).
 *  - Efter turneringens sista match (ingen kommande): sista dagen (oförändrat).
 *
 * TVÅ KLOCKOR, MEDVETET SKILDA (T93 F1): kalender-basen (initialDayIndex) tar
 * `calendarNow`, ett DAG-GRANULÄRT "nu" som bara rör sig vid dygnsväxling och är
 * FRUSET inom ett dygn (useTodayKey, PWA-fällan: flik öppen hela dagen). Men
 * nästa-kommande-match-härledningen (computeCountdown) filtrerar `kickoff > now`
 * och kräver därför ett FÄRSKT realtids-"nu". Matas computeCountdown samma frusna
 * dag-klocka plockar den en match som redan kickat igång tidigare samma dag (dess
 * kickoff > dygnets-start-now), nextKey blir dagens datum och rollovern firar
 * ALDRIG , exakt Daniels live-bugg (hero kvar på spelad match). Därför tar
 * funktionen BÅDA: dag-klockan för basen, realtids-klockan för nästa-avspark-valet.
 *
 * @param days        Dagarna i kronologisk ordning (speldagar OCH vilodagar).
 * @param matches     Alla matcher (för nästa-kommande-valet, samma källa som hero:n).
 * @param calendarNow DAG-granulärt "nu" för kalender-basen (default = nu).
 * @param realtimeNow FÄRSKT realtids-"nu" för nästa-avspark-valet (default =
 *                    calendarNow, så befintliga anrop med en klocka beter sig
 *                    oförändrat när klockan ÄR färsk, t.ex. i enhetstest).
 */
export function followDayIndex(
  days: readonly MatchDay[],
  matches: readonly Match[],
  calendarNow: Date | number = Date.now(),
  realtimeNow: Date | number = calendarNow
): number {
  const base = initialDayIndex(days, calendarNow);
  if (base === -1) {
    return -1;
  }
  const today = days[base];
  // Rulla BARA när idag faktiskt var en speldag OCH varje match är färdigspelad
  // ("dagens sista match är slut"). En ospelad match idag (kommande/live) eller en
  // vilodag (tom) -> stå kvar (bevarat beteende ovan).
  const todayAllFinished =
    today.matches.length > 0 && today.matches.every((m) => m.status === 'finished');
  if (!todayAllFinished) {
    return base;
  }
  // Nästa KOMMANDE match ur samma sanning som nedräkningen, mot REALTIDS-klockan
  // (inte den frusna dag-klockan, F1). Ingen kommande (efter finalen) -> stå kvar
  // (sluttillståndet, oförändrat).
  const countdown = computeCountdown(matches, realtimeNow);
  if (countdown.kind !== 'upcoming') {
    return base;
  }
  // Dagen som rymmer nästa avspark (svensk kalenderdag). Bara framåt: en sen kväll
  // kan ha nästa avspark kvar på innevarande dag, då rullar vi inte bakåt/sidledes.
  const nextKey = localDateKey(countdown.match.kickoff);
  const nextIdx = days.findIndex((d) => d.dateKey === nextKey);
  return nextIdx > base ? nextIdx : base;
}

export function useDailyMatches(now: Date | number = Date.now()): DailyMatchesData {
  const { status, matches: rawMatches, teams, groups, mode, error } = useResultsStore();

  // LÖS KNOCKOUT-LAGEN (2026-06-28, Daniels "Ej klart"-fråga): slutspelsmatchernas lag
  // är null i den seedade matchlistan tills seedningen fyllt dem. Vi lägger samma
  // härledning som slutspelsträdet (deriveBracket) OVANPÅ listan, så Idag visar de
  // RIKTIGA lagen (med flaggor) på en slutspelsmatch vars båda lag är slutgiltigt kända,
  // i stället för "Ej klart". Bara 'resolved' (aldrig preliminära) , kräver inmatade
  // gruppresultat. Identitet när inget kan lösas (gruppspel pågår). All härledning nedan
  // (dagar, nedräkning, nästa match) använder dessa effektiva matcher oförändrat.
  const matches = useMemo(() => resolveKnockoutTeams(groups, rawMatches), [groups, rawMatches]);

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
  // Null låter startdags-härledningen (followDayIndex mot liveNowMs, med rollover
  // T93) styra, så bläddraren auto-flyttar till AKTUELL/nästa matchdag. Navigering sätter en
  // nyckel och PINNAR dagen (då vinner användarens val, dagen hoppar inte under
  // hen). Nyckel (inte index) är stabil om dag-listan ändrar längd (realtidskälla).
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  // LIVE-tick: håll ett "nu" i state och bumpa det varje sekund, så den rena
  // nedräknings-funktionen räknas om. Initieras ur det injicerade `now` (så
  // tester är deterministiska); i appen är det aktuell tid och intervallet tar
  // över. Intervallet städas vid unmount (ingen läckande timer).
  //
  // DEKLARERAS HÄR (före selectedIndex) MEDVETET (T93 F1): följDay-härledningen
  // behöver detta FÄRSKA realtids-nu till sitt computeCountdown-anrop, skilt från
  // det dag-frusna liveNowMs. liveNowMs styr kalender-basen (rätt dag), nowMs styr
  // nästa-avspark-valet (rätt nästa match). Annars plockar countdown med ett fruset
  // dag-nu en redan spelad match och rollovern firar aldrig (Daniels live-bugg).
  const initialNowMs = typeof now === 'number' ? now : now.getTime();
  const [nowMs, setNowMs] = useState(initialNowMs);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // EFFEKTIVT index, härlett SYNKRONT i render (inte via en effekt): finns en
  // pinnad nyckel kvar i dagarna används den, annars den HÄRLEDDA aktuella dagen
  // (followDayIndex mot dag-klockan liveNowMs + realtids-klockan nowMs, se nedan).
  // VARFÖR synkront: en useEffect
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
    // Follow-läget (ingen pinnad nyckel) använder followDayIndex: kalender-idag MED
    // rollover efter dagens sista match (T93), så hero:n aldrig fastnar på en spelad
    // match medan nästa avspark ligger på nästa svenska dag. matches är källan för
    // "nästa kommande" (samma sanning som nedräkningen). TVÅ klockor (F1): liveNowMs
    // (dag-fruset) för kalender-basen, nowMs (per-sekund) för nästa-avspark-valet.
    return pinnedIdx !== -1 ? pinnedIdx : followDayIndex(days, matches, liveNowMs, nowMs);
  }, [days, matches, pinnedKey, liveNowMs, nowMs]);
  const selectedDay = selectedIndex === -1 ? null : days[selectedIndex];

  // Dagens framträdande match (ren, deterministisk regel: tidigaste OSPELADE, T57).
  // Beror på selectedDay, som får en ny referens när ett resultat vävs in (matches
  // -> days -> selectedDay), så fokus räknas om och lyfter nästa match automatiskt
  // när den aktuella blir 'finished' (ingen ny polling, samma weave/tick-drivning).
  const matchOfTheDay = useMemo(
    () => (selectedDay ? selectMatchOfTheDay(selectedDay.matches) : null),
    [selectedDay]
  );

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
      // (hoppar aldrig under hen). Samma härledning (followDayIndex mot det
      // dag-medvetna liveNowMs + realtids-nowMs, MED rollover T93) som selectedIndex
      // använder, så "är idag?" är EN regel , bläddrar man till den rollover-flyttade
      // dagen återupptas follow-läget korrekt (de kan inte divergera).
      const todayIdx = followDayIndex(days, matches, liveNowMs, nowMs);
      setPinnedKey(index === todayIdx ? null : days[index].dateKey);
    },
    [days, matches, liveNowMs, nowMs]
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
