// Long-press-hook (T74, #157): skiljer ett LÅNGTRYCK (håll kvar) från ett vanligt
// TAP (snabbt tryck), via pointer events.
//
// ANSVAR (en sak, testbar mekanik utan layout): starta en timer vid pointerdown,
// rapportera "long press aktivt" när tröskeln passeras, och släpp (pointerup/leave/
// cancel) som döljer det igen. Skiljer tap (släpp FÖRE tröskeln) från long-press
// (släpp EFTER tröskeln) så ett långtryck inte också triggar ett vanligt klick.
//
// VARFÖR pointer events (inte touch + mouse separat): pointer events täcker touch,
// mus och penna i EN modell, så samma kod funkar för långtryck på mobil och för en
// lång klick-håll på desktop. Hover/focus-vägen (icke-touch, a11y) ligger i UI:t
// (MatchReactions), inte här, den här hooken äger bara håll-gesten.
//
// TRÖSKELN (500 ms): Daniel bad om "hålla kvar fingret och efter några sekunder".
// 500 ms är standard-tröskeln för long-press (Android long-press är 400-500 ms,
// iOS ~500 ms), tillräckligt långt för att inte trigga på ett vanligt tap men
// kort nog att kännas direkt, "några sekunder" exakt vore segt på en match-rad.
// Dokumenterat i docs/decisions.md (T74). Injicerbar (thresholdMs) för testbarhet.

import { useCallback, useEffect, useRef, useState } from 'react';

/** Standard-tröskel (ms) för när ett tryck räknas som ett långtryck, inte ett tap. */
export const LONG_PRESS_THRESHOLD_MS = 500;

export interface UseLongPressOptions {
  /**
   * Körs NÄR tröskeln passeras (håll-gesten blev ett långtryck). VALFRI: hooken sätter
   * ändå `active=true`, så en konsument som bara läser `active` (visar popovern) inte
   * behöver en tom callback. Använd den för en sido-effekt (haptik, analytics).
   */
  onLongPress?: () => void;
  /** Körs när trycket SLÄPPS/avbryts (oavsett om det blev ett långtryck). Dölj popovern här. */
  onRelease?: () => void;
  /** Tröskel i ms (default LONG_PRESS_THRESHOLD_MS). Injicerbar för test. */
  thresholdMs?: number;
}

export interface LongPressHandlers {
  /** Sant medan ett långtryck pågår (tröskeln passerad, ännu ej släppt). */
  active: boolean;
  /**
   * Sant DIREKT efter att ett långtryck släppts, tills nästa pointerdown (REAKTIVT
   * state, för UI som vill rendera mot flaggan). För att FATTA BESLUTET i en click-
   * handler, använd `shouldSuppressClick()` i stället, den läser SYNKRONT (ref), så ett
   * pointerup följt av ett click i SAMMA flush får rätt svar (state hinner inte uppdateras
   * mellan de två händelserna i samma synkrona React-batch).
   */
  suppressNextClick: boolean;
  /**
   * Läs OCH KONSUMERA "ska nästa click sväljas?" synkront. Returnerar true exakt EN gång
   * efter ett långtryck (det click:et som följer släppet), sedan false. Anropas i click-
   * handlern: returnerar true -> hoppa över toggle:n (håll-gesten ska inte också togglas).
   */
  shouldSuppressClick: () => boolean;
  /** Spreada dessa på elementet (onPointerDown/Up/Leave/Cancel). */
  handlers: {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
    onPointerLeave: (event: React.PointerEvent) => void;
    onPointerCancel: (event: React.PointerEvent) => void;
  };
}

/**
 * Long-press-mekanik via pointer events. Returnerar `active` (popover visas medan
 * sant), `suppressNextClick` (UI:t sväljer click:et efter ett långtryck), och
 * pointer-handlers att spreada på det element man vill kunna hålla in.
 *
 * Edge-fall som täcks: pointerup FÖRE tröskeln (vanligt tap, ingen long-press, ingen
 * suppression), pointerleave/cancel under håll (avbryt timern + dölj), unmount under
 * pågående timer (rensa timern, ingen läckande callback). Timern rensas alltid innan
 * en ny startas, så snabba upprepade tryck inte staplar timers.
 */
export function useLongPress({
  onLongPress,
  onRelease,
  thresholdMs = LONG_PRESS_THRESHOLD_MS,
}: UseLongPressOptions): LongPressHandlers {
  // `active` speglas i en REF så slutgesten (end) kan läsa SYNKRONT om trycket HANN bli
  // ett långtryck. Utan ref:en läser end:s closure ett inaktuellt `active` (timern satte
  // active i samma synkrona batch som pointerup följer i), och svälj-beslutet blir fel.
  const activeRef = useRef(false);
  const [active, setActiveState] = useState(false);
  const setActive = useCallback((value: boolean) => {
    activeRef.current = value;
    setActiveState(value);
  }, []);
  // Suppression hålls i en REF (synkron sanning) + speglas i state (för UI som vill
  // rendera mot flaggan). Beslutet i click-handlern måste läsa SYNKRONT: ett pointerup
  // och det click som följer sker i samma synkrona React-batch, och setState hinner inte
  // uppdatera värdet click-handlern stänger över. Ref:en uppdateras direkt.
  const suppressRef = useRef(false);
  const [suppressNextClick, setSuppressNextClick] = useState(false);
  const setSuppress = useCallback((value: boolean) => {
    suppressRef.current = value;
    setSuppressNextClick(value);
  }, []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Färska callback-referenser utan att timern måste startas om vid varje render.
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Rensa en pågående timer om komponenten avmonteras mitt i ett håll (ingen
  // callback efter unmount, ingen läckande timer).
  useEffect(() => clearTimer, [clearTimer]);

  const start = useCallback(() => {
    clearTimer();
    // Ny gest: nollställ suppression (ett föregående långtrycks svälj-flagga gäller
    // bara det ENA click:et som följde direkt på släppet).
    setSuppress(false);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setActive(true);
      onLongPressRef.current?.();
    }, thresholdMs);
  }, [clearTimer, thresholdMs, setSuppress, setActive]);

  // Avsluta en gest: om den HANN bli ett långtryck (active) ska det efterföljande
  // click:et sväljas (annars togglar håll-gesten reaktionen oavsiktligt). Ett vanligt
  // tap (timern ej utlöst än) lämnar suppression av, så click:et går igenom som vanligt.
  const end = useCallback(() => {
    // Läs activeRef SYNKRONT (inte active-state): timern kan ha satt active i samma
    // synkrona batch som detta pointerup, och state-värdet i closuren är då inaktuellt.
    const wasLongPress = timerRef.current === null && activeRef.current;
    clearTimer();
    if (activeRef.current) {
      setActive(false);
      onReleaseRef.current?.();
    }
    if (wasLongPress) {
      setSuppress(true);
    }
  }, [clearTimer, setActive, setSuppress]);

  // Läs + konsumera svälj-flaggan SYNKRONT (ref): true exakt en gång efter ett långtryck.
  const shouldSuppressClick = useCallback(() => {
    if (suppressRef.current) {
      setSuppress(false);
      return true;
    }
    return false;
  }, [setSuppress]);

  const handlers = {
    onPointerDown: useCallback(() => start(), [start]),
    onPointerUp: useCallback(() => end(), [end]),
    onPointerLeave: useCallback(() => end(), [end]),
    onPointerCancel: useCallback(() => end(), [end]),
  };

  return { active, suppressNextClick, shouldSuppressClick, handlers };
}
