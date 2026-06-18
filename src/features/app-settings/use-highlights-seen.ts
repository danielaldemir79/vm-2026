// Hook som äger den persisterade flaggan "användaren har öppnat en höjdpunkter-
// länk" (per enhet). Driver att NYTT-badgen på höjdpunkts-pillen försvinner efter
// första klicket, på ALLA matchkort (flaggan är global per enhet, inte per match).
//
// Mönstret speglar useOnboarding (samma fil-grannskap): EN persistent boolean-
// flagga via den delade safe-storage-hjälparen (robust mot blockerad/privat
// storage), lazy-init vid mount + en setter som skriver EN gång. Skild från
// SettingsProvider (haptik/ljud), som bär TVÅ av-/på-bara inställningar med ett
// eget settings-UI; "höjdpunkter sedd" är en envägs-markering utan toggle, exakt
// samma form som onboarding-flaggan, så samma hook-mönster passar bäst (DRY).

import { useCallback, useState } from 'react';
import { readStoredFlag, writeStoredFlag } from '../../lib/safe-storage';
import { HIGHLIGHTS_SEEN_KEY } from './storage-keys';

/** Vad hooken ger: har en höjdpunkter-länk öppnats, + markera att den nyss öppnades. */
export type HighlightsSeenApi = readonly [seen: boolean, markSeen: () => void];

/**
 * Läs flaggan "höjdpunkter sedd/klickad" + en setter som markerar den sedd.
 *
 * Lazy-init: läser EN gång vid mount. En frånvarande flagga (eller blockerad
 * storage som ger false vid läsning) -> false (inte sedd), så badgen får visas
 * inom tidsfönstret; markSeen flippar den till true (och persistar) vid första
 * klicket. markSeen är idempotent och no-op-ar på state om flaggan redan är true,
 * så ett andra klick aldrig tvingar en onödig re-render. Skriv-fel (privat läge/
 * onåbar storage) sväljs inte tyst av safe-storage (loggas), men kraschar aldrig:
 * i värsta fall blir badgen kvar inom fönstret, vilket är ofarligt (KISS).
 */
export function useHighlightsSeen(): HighlightsSeenApi {
  const [seen, setSeen] = useState<boolean>(() => readStoredFlag(HIGHLIGHTS_SEEN_KEY));

  const markSeen = useCallback(() => {
    // Persistera vid uttryckligt klick UTANFÖR setState-updatern (samma kontrakt
    // som SettingsProvider/useOnboarding.finish: StrictMode kör updatern två
    // gånger, en skrivning där vore en dubbel-skrivning). writeStoredFlag är
    // idempotent (skriver "1"), så ett andra klick är ofarligt; setSeen(true) är
    // en no-op på state när värdet redan är true (React bailar ut), ingen onödig
    // re-render.
    writeStoredFlag(HIGHLIGHTS_SEEN_KEY, true);
    setSeen(true);
  }, []);

  return [seen, markSeen] as const;
}
