// React-hook för livekortets mjukt tickande klocka (Bit 3b).
//
// ANSVAR (tunt): hålla ett "nu" som tickar varje sekund och köra Bit 1:s rena,
// status-styrda klock-brygga (liveClockFor) mot det. ALL svår logik (frys i paus,
// kapa vid halvleksgräns, aldrig springa på okänd status, re-synk mot last_synced_at)
// bor i computeClock/liveClockFor , vi bygger INGEN egen tid-logik här (direktiv +
// DRY). Hooken är bara React-limmet: en setInterval som bumpar `now`, så den rena
// funktionen räknas om. Exakt samma uppdelning som nedräkningen i useDailyMatches.
//
// VARFÖR sekund-tick fast klockan visar MINUTER: minut-bytet ska kännas LEVANDE och
// inte hänga en hel minut efter sanningen, och en sekund-tick låter en mjuk CSS-puls
// (ticking-flaggan) andas i takt. Ticken är billig (en ren funktion), ingen IO.
//
// REDUCED MOTION / BATTERI: en match som inte tickar (paus/avslutad/ej startad) ger
// ticking=false från klockan ändå; vi kör intervallet bara när matchen FAKTISKT kan
// röra sig (status som kan ticka), så ett kort för en avslutad match inte väcker en
// timer i onödan. Det är en ren prestanda-grind, inte en a11y-grind.

import { useEffect, useState } from 'react';
import { liveClockFor, type LiveData, type MatchClock } from '../../data/livescore';

/**
 * Status-värden där klockan kan röra sig (en sekund-tick är meningsfull). En paus,
 * avslutad eller ej startad match får ingen tick , dess klocka är konstant, så vi
 * väcker ingen timer. 'unknown' tickar inte (fail-safe, samma anda som computeClock).
 */
function canTick(data: LiveData): boolean {
  return data.status === 'live';
}

/**
 * Beräkna livekortets klocka och tick:a den mjukt under live.
 *
 * @param data  den projicerade live-raden (status + elapsed + last_synced_at).
 * @param now   nuet (epoch-ms), INJICERAS för test (default Date.now()). I appen tar
 *              sekund-intervallet över; i test ger ett fast `now` en deterministisk klocka.
 */
export function useLiveClock(data: LiveData, now: number = Date.now()): MatchClock {
  const [nowMs, setNowMs] = useState(now);

  useEffect(() => {
    // Bara live-matcher behöver en löpande tick. Andra lägen har en konstant klocka,
    // så vi startar ingen timer (sparar batteri/CPU på en lista frusna kort).
    if (!canTick(data)) {
      return;
    }
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
    // status styr om timern alls ska köra; elapsed/last_synced_at byts vid realtids-
    // push och plockas upp av liveClockFor nedan utan att timern behöver startas om.
  }, [data]);

  // liveClockFor gör hela det svåra deterministiskt (ren funktion, now injicerat).
  return liveClockFor(data, nowMs);
}
