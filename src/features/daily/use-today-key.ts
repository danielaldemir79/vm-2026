// React-hook: "vilken svensk kalenderdag är det NU?", dag-medvetet (T27, #39).
//
// PROBLEM (Copilot R1, C1, PWA-fälla): en vy som behöver "idag" (t.ex. resultat-
// listans 3-dagars fönster) får fel om den läser Date.now() EN gång och fryser
// det i ett useMemo. Appen är en PWA som lämnas öppen hela VM:t, så fliken kan
// stå öppen över midnatt, då måste "idag" flytta sig utan en omladdning. Att
// memoizera fönstret bara på matchlistan fryser dagen på första beräkningens dag.
//
// LÖSNING (samma anda som useDailyMatches LIVE-tick: I/O-fri logik + en tunn
// React-tick): hooken äger ETT "nu" i state och uppdaterar det BARA när den
// svenska kalenderdagen faktiskt ändras. Returvärdet (`todayKey` + `nowMs`) är
// alltså referens-stabilt inom en dag, så ett downstream-useMemo (fönstret) bara
// räknas om vid en faktisk dygnsväxling, inte varje tick.
//
// VARFÖR minut-tick + visibilitychange (inte sekund-tick som countdown):
//  - Granulariteten vi bryr oss om är DYGNET, inte sekunden; en minut-tick räcker
//    gott för att fånga midnatt (dagen flyttar inom <= 60 s efter midnatt) och är
//    nästan gratis (ett setInterval, en jämförelse).
//  - PWA-fällan specifikt: en bakgrunds-flik får sina timers strypta/pausade av
//    webbläsaren, så minut-ticken kan ha "sovit" medan appen var dold. När fliken
//    blir synlig igen (visibilitychange -> visible) räknar vi om OMEDELBART, så
//    en användare som öppnar appen dagen efter ser rätt dag direkt, inte efter att
//    ha väntat in nästa tick.
//
// REN dag-härledning: localDateKey (features/daily, Intl, off-by-one-säker) är EN
// sanning för "svensk kalenderdag", återanvänds här (DRY, PRINCIPLES §4) i stället
// för en egen UTC-datumklippning (känd fälla `utc-datum-anvant-som-lokalt-datum`).

import { useEffect, useState } from 'react';
import { localDateKey } from './group-matches-by-day';

/** Härled den svenska kalenderdag-nyckeln (YYYY-MM-DD) för ett epoch-ms. */
function dayKeyOf(ms: number, timeZone?: string): string {
  return localDateKey(new Date(ms).toISOString(), timeZone);
}

/** Vad hooken ger vyn: dagens nyckel + ett "nu" som är stabilt inom dagen. */
export interface TodayKey {
  /** Den svenska kalenderdag-nyckeln (YYYY-MM-DD) just nu. */
  todayKey: string;
  /**
   * Ett epoch-ms vars svenska dag är `todayKey`. Referens-stabilt inom en dag (ändras
   * bara vid dygnsväxling), så det kan matas till en ren dag-funktion (windowMatches)
   * via ett useMemo utan att tvinga omräkning varje tick.
   */
  nowMs: number;
}

/** Hur ofta vi pollar för en dygnsväxling. En minut räcker (granularitet = dygn). */
const TICK_MS = 60_000;

/**
 * Returnera den svenska kalenderdag-nyckeln just nu, och uppdatera (re-rendera)
 * när dagen faktiskt växlar (över midnatt) eller när fliken blir synlig igen efter
 * att ha varit dold (PWA-fälla). Returvärdet är stabilt inom en dag.
 *
 * @param now      "Nu" vid första renderingen (injicerbart för test). Default = nu.
 * @param timeZone Zonen dagen mäts i (default svensk tid via localDateKey). Injicerbar.
 */
export function useTodayKey(now: Date | number = Date.now(), timeZone?: string): TodayKey {
  const initialMs = typeof now === 'number' ? now : now.getTime();
  // Vi håller hela "nu":et i state men låter setState-uppdateraren GATA på
  // dag-byte: returneras samma ms-värde re-renderar React inte (bevarar referens-
  // stabiliteten), bara ett nytt dygn ger ett nytt värde.
  const [nowMs, setNowMs] = useState(initialMs);

  useEffect(() => {
    // Stega fram nu:et bara om den svenska dagen ändrats sedan senast (annars
    // returnera prev oförändrat -> ingen onödig re-render). Samma jämförelse
    // används av både minut-ticken och synlighets-lyssnaren.
    function syncToCurrentDay() {
      const current = Date.now();
      setNowMs((prev) =>
        dayKeyOf(current, timeZone) === dayKeyOf(prev, timeZone) ? prev : current
      );
    }

    const id = setInterval(syncToCurrentDay, TICK_MS);
    // visibilitychange fångar PWA-fällan: en bakgrunds-flik strypter timers, så vi
    // synkar direkt när appen blir synlig igen (kan ha gått flera dygn).
    document.addEventListener('visibilitychange', syncToCurrentDay);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', syncToCurrentDay);
    };
  }, [timeZone]);

  return { todayKey: dayKeyOf(nowMs, timeZone), nowMs };
}
