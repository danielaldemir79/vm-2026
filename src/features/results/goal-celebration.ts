// Målfirande-KROKEN: den FUNKTIONELLA + a11y-säkra seamen för en fira-animation
// vid resultatinmatning (SPEC §12: "Målfirande-animationer vid resultatinmatning").
//
// ARBETSDELNING (viktig): denna fil bär det FUNKTIONELLA lagret + reduced-motion-
// säkerheten. Den avgör NÄR ett firande ska triggas (en match som blir 'finished'
// med minst ett mål), exponerar ett trigger-API och ett enkelt tillstånd, och
// AUTO-AVKLINGAR firandet efter en stund. Den bygger på T2:s reduced-motion-
// princip: vid "minska rörelse" görs INGET visuellt firande (ingen overlay tänds),
// så kontraktet är deterministiskt och testbart. Den VISUELLA premium-animationen
// (konfetti, mål-pop, ljud-känsla) lägger DESIGNEN ovanpå denna
// krok, den läser `celebration`-tillståndet och renderar sitt lager, utan att röra
// triggers/timing/a11y här.
//
// VARFÖR en krok och inte inbakat i formuläret: firandet ska kunna triggas från
// FLERA ställen senare (live-uppdatering T18, slutspelsresultat) och renderas av
// ett separat premium-lager. En liten, ren krok med ett tydligt API frikopplar
// "när" (här) från "hur det ser ut" (designen), composition over coupling.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/** Hur länge ett firande är "aktivt" innan det auto-avklingar (ms). */
const CELEBRATION_DURATION_MS = 2200;

/** Det aktiva firandets data, som designens visuella lager läser. */
export interface GoalCelebration {
  /** Stabilt id per firande (matchens id + en räknare), så React kan re-mounta lagret. */
  key: string;
  /** Matchen som firas (för att slå upp lag/flagga i det visuella lagret). */
  matchId: string;
  /** Totala mål i matchen, så firandet kan skala intensiteten (t.ex. fler konfetti). */
  totalGoals: number;
}

/** Det kroken exponerar. */
export interface GoalCelebrationApi {
  /** Aktivt firande, eller null när inget pågår (eller reducerad rörelse är på). */
  celebration: GoalCelebration | null;
  /**
   * Trigga ett firande för en match med ett givet antal mål. Anropas av
   * inmatnings-flödet när en match blir 'finished'. Vid reducerad rörelse är
   * detta en no-op (a11y), så anroparen behöver inte själv kolla preferensen.
   */
  celebrateGoal: (matchId: string, totalGoals: number) => void;
  /** Avbryt/stäng ett pågående firande direkt (t.ex. om användaren går vidare). */
  dismiss: () => void;
}

/**
 * Krok som styr när ett målfirande är aktivt.
 *
 * @returns Ett trigger-API + det aktiva firande-tillståndet (null om inget).
 */
export function useGoalCelebration(): GoalCelebrationApi {
  const shouldReduceMotion = useReducedMotion();
  const [celebration, setCelebration] = useState<GoalCelebration | null>(null);
  // En monotont ökande räknare ger ett unikt key även när SAMMA match firas igen
  // (rätta ett resultat och spara på nytt), så det visuella lagret re-mountar och
  // spelar animationen om i stället för att "klistra" på samma nyckel.
  const counterRef = useRef(0);
  // Spara timeouten så vi kan rensa den vid ett nytt firande eller unmount, annars
  // kan en gammal timeout släcka ett nyare firande (race) eller sätta state efter
  // unmount.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearPending();
    setCelebration(null);
  }, [clearPending]);

  const celebrateGoal = useCallback(
    (matchId: string, totalGoals: number) => {
      // A11y-grinden: vid "minska rörelse" tänds inget visuellt firande alls.
      // (Den funktionella resultatinmatningen är klar oavsett, firandet är ren
      // glädje-yta, så att hoppa det är rätt reducerad-rörelse-beteende, WCAG 2.3.3.)
      if (shouldReduceMotion) {
        return;
      }
      // (Notera: ett firande som redan PÅGÅR släcks av effekten nedan om
      // preferensen slår om mitt under det, inte bara nya firanden hoppas.)
      // Ett mållöst resultat (0-0) firas inte: det är inget MÅL att fira. Den
      // funktionella inmatningen påverkas inte, bara firande-ytan hoppas.
      if (totalGoals <= 0) {
        return;
      }
      clearPending();
      counterRef.current += 1;
      setCelebration({ key: `${matchId}#${counterRef.current}`, matchId, totalGoals });
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setCelebration(null);
      }, CELEBRATION_DURATION_MS);
    },
    [shouldReduceMotion, clearPending]
  );

  // A11y-grinden gäller även MITT under ett pågående firande (C11): slår
  // användaren på "minska rörelse" medan en overlay lyser, släck den DIREKT
  // (rensa state + pending timeout) i stället för att låta den stå kvar tills
  // auto-avklingningen. celebrateGoal vaktar bara NYA firanden, denna effekt
  // vaktar det redan tända, så preferensen respekteras vid varje tidpunkt
  // (WCAG 2.3.3). Att alltid rensa pending timeout här är säkert: vid
  // shouldReduceMotion === false finns inget firande att tappa (timeouten sätts
  // bara när rörelse är tillåten), och vi sätter aldrig en ny timeout härifrån.
  useEffect(() => {
    if (shouldReduceMotion) {
      dismiss();
    }
  }, [shouldReduceMotion, dismiss]);

  // Städa eventuell pågående timeout vid unmount (ingen state-set efter unmount).
  useEffect(() => clearPending, [clearPending]);

  return { celebration, celebrateGoal, dismiss };
}
