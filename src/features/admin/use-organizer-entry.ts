// Dold ingång till arrangörs-inloggningen (T48, #81).
//
// VARFÖR (Daniels uttryckliga krav inför delning): vanliga vänner ska INTE ens se
// en inloggnings-affordans, "inloggningen ska de inte se". Vi flyttar därför hela
// AdminLogin bakom ett hemligt URL-fragment (`#arrangor`) som bara Daniel känner till,
// i stället för en synlig <details>-utfällning. En vanlig vän möts bara av den lugna
// read-only-noten.
//
// SÄKERHET: detta är REN UX-diskretion, ingen säkerhetsgräns. Den faktiska skyddet
// ligger i RLS/app_admins (T42, RLS-bevisat): den som hittar/gissar fragmentet kan
// ändå INTE bli admin utan att vara med i app_admins. Vi gömmer alltså bara ytan, vi
// förlitar oss inte på att fragmentet är hemligt för säkerhet.
//
// hashchange-lyssnaren gör att Daniel kan skriva in `#arrangor` i adressfältet UTAN
// att ladda om sidan (SPA: hash-ändring navigerar inte). Samma window-event-mönster
// som use-online-status.

import { useEffect, useState } from 'react';

/**
 * Det hemliga URL-fragmentet som fäller fram arrangörs-inloggningen. Skiftläges-
 * okänsligt (se readOrganizerEntry) så `#Arrangor`/`#ARRANGOR` också funkar. ASCII
 * (ingen å/ä/ö) eftersom ett URL-fragment ska vara lätt att skriva in för hand.
 */
export const ORGANIZER_HASH = 'arrangor';

/**
 * Läs säkert om det hemliga arrangörs-fragmentet finns i URL:en just nu. En
 * frånvarande/oläsbar window (SSR, udda testmiljö) ska inte krascha, då antar vi
 * "ingen ingång" (det normala, dolda läget för en vanlig vän).
 */
function readOrganizerEntry(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  // location.hash inkluderar '#'-prefixet ('#arrangor'); jämför mot fragmentet utan
  // det, skiftläges-okänsligt så ingången är förlåtande för hand-inmatning.
  return window.location.hash.replace(/^#/, '').toLowerCase() === ORGANIZER_HASH;
}

/**
 * @returns true när URL:ens hemliga arrangörs-fragment (`#arrangor`) är aktivt, så
 * AdminSection kan rendera AdminLogin bara då. Följer hashchange så Daniel kan skriva
 * in fragmentet utan att ladda om.
 */
export function useOrganizerEntry(): boolean {
  const [present, setPresent] = useState<boolean>(() => readOrganizerEntry());

  useEffect(() => {
    // Samma icke-browser-gard som readOrganizerEntry (Copilot R3): utan window finns
    // inget att lyssna på, och dokumentationen lovar att hooken inte kraschar då.
    if (typeof window === 'undefined') {
      return;
    }
    // Synka en gång vid mount (hashen kan ha hunnit ändras mellan lazy-init och
    // effekten), sen följ hashchange.
    setPresent(readOrganizerEntry());
    const onHashChange = () => setPresent(readOrganizerEntry());
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return present;
}
