// React-hook: ett "nu" som tickar fram så DEADLINE-lås (avspark passerad) räknas
// om utan omladdning (T15, #15, Copilot C1).
//
// PROBLEM (Copilot C1): tipsvyns låst-härledning (selectPredictableMatches: locked =
// now >= kickoff) memoiserades bara på `matches`, så `predictable` (och därmed
// openCount) frystes på första renderns "nu". En flik som står öppen förbi en
// avspark skulle visa matchen som ÖPPEN (eller fel openCount) tills användaren
// laddade om manuellt. Server-RLS är ändå det riktiga låset, men VISNINGEN ska
// inte ljuga.
//
// VARFÖR inte useTodayKey: den hooken är referens-STABIL inom en dag (den gatar på
// dagsbyte). En avspark passerar MITT PÅ DAGEN, inte vid midnatt, så en dagsnyckel
// fångar inte att en match låses kl 15:00. Vi behöver alltså en FINARE tick än
// useTodayKey ger, men inte countdown:ens sekund-tick (overkill för en lista som
// bara behöver flippa vid avspark, på minuten).
//
// VARFÖR minut-tick + visibilitychange (samma anda som useTodayKey, inte sekund):
//  - Avspark anges på hela minuter, så låset behöver bara flippa inom <= 60 s efter
//    avspark. En minut-tick räcker och är nästan gratis (ett setInterval, en
//    setState). En sekund-tick (countdown) skulle re-rendra listan 60x oftare utan
//    nytta, eftersom inget i listan ändras MELLAN avsparks-minuter.
//  - PWA-fällan: en bakgrunds-flik får sina timers strypta/pausade, så minut-ticken
//    kan ha "sovit" medan appen var dold. När fliken blir synlig igen
//    (visibilitychange) räknar vi om OMEDELBART, så en återaktiverad flik genast
//    ser rätt lås-läge, inte efter att ha väntat in nästa tick. Vi räknar BARA om
//    vid SHOW (visibilityState === 'visible'), inte vid hide (C11): en dold flik
//    renderas inte, så en omräkning där vore en onödig re-render.

import { useEffect, useState } from 'react';

/** Hur ofta vi pollar för en passerad avspark. En minut räcker (avspark = hel minut). */
const TICK_MS = 60_000;

/**
 * Returnera ett "nu" som ett tipsvyn kan deadline-jämföra mot, och som tickar fram
 * varje minut (och direkt vid återaktiverad flik) så låst-statusen räknas om utan
 * omladdning. Returvärdet ändras varje minut (avsiktligt: det DRIVER omräkningen),
 * till skillnad från useTodayKey som är stabil inom en dag.
 *
 * @param now "Nu" vid första renderingen (injicerbart för test/determinism).
 *            Default = nuet. I appen tar minut-ticken sedan över.
 */
export function useDeadlineTick(now: Date | number = Date.now()): Date {
  const initialMs = typeof now === 'number' ? now : now.getTime();
  const [nowMs, setNowMs] = useState(initialMs);

  useEffect(() => {
    // Hämta aktuell tid vid varje minut-tick. Till skillnad från useTodayKey gatar
    // vi INTE på dagsbyte: varje minut är ett nytt "nu", så en avspark som passerar
    // mitt på dagen fångas inom en minut.
    function tick() {
      setNowMs(Date.now());
    }
    // Synlighets-handlern räknar BARA om när fliken blir SYNLIG igen (C11): en
    // visibilitychange fyrar både vid hide OCH show, men ett dolt läge behöver inget
    // omräknat "nu" (ingen renderas ändå). Att ticka vid hide vore en onödig
    // state-uppdatering/re-render. Gata på visibilityState === 'visible' så bara
    // återaktiveringen (där PWA-timern kan ha sovit) triggar omräkningen.
    function tickOnVisible() {
      if (document.visibilityState === 'visible') {
        tick();
      }
    }
    const id = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tickOnVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tickOnVisible);
    };
  }, []);

  return new Date(nowMs);
}
