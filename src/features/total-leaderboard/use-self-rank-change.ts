// HOOK: härled den egna globala rank-FÖRÄNDRINGEN "sedan ditt senaste besök" (T92 del C).
//
// Läser det per-device-snapshot som self-rank-snapshot.ts håller, beräknar förändringen mot
// nuvarande rank, och UPPDATERAR snapshoten EN gång per ny (userId, rank)-kombination , inte på
// varje render (annars skulle "sedan senaste besök" kollapsa till "ingen rörelse" direkt efter
// första visningen). VARFÖR ett ref-spår på senast skrivna nyckel: vi vill att förändringen
// står kvar HELA besöket (man ska hinna se "▲ 5"), men inte skrivas om i en loop. Vi beräknar
// delta:n EN gång (mot den sparade rank:en vid besökets start) och behåller den för besöket.

import { useEffect, useRef, useState } from 'react';
import {
  computeRankChange,
  readSelfRankSnapshot,
  writeSelfRankSnapshot,
  type SelfRankChange,
} from './self-rank-snapshot';

/**
 * Härled förändringen för den egna globala raden. null när vi inte kan/ska visa något:
 *   - ingen identitet (currentUserId null), eller
 *   - ingen egen rad i totalen än (currentRank null).
 *
 * Förändringen beräknas mot snapshoten vid besökets start och behålls stabil för besöket;
 * snapshoten skrivs om till nuvarande rank (för NÄSTA besök) som en biverkning.
 */
export function useSelfRankChange(
  currentUserId: string | null,
  currentRank: number | null
): SelfRankChange | null {
  const [change, setChange] = useState<SelfRankChange | null>(null);
  // Nyckeln vi senast beräknat/skrivit för, så vi inte räknar om eller skriver i en loop.
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentUserId === null || currentRank === null) {
      setChange(null);
      lastKeyRef.current = null;
      return;
    }
    const key = `${currentUserId}:${currentRank}`;
    if (lastKeyRef.current === key) {
      return; // redan beräknat för denna (user, rank): behåll förändringen + skriv inte om
    }
    lastKeyRef.current = key;
    // Läs DÅ skriv: jämför nuvarande rank mot den sparade (besökets utgångsläge), beräkna
    // förändringen, och uppdatera snapshoten till nuvarande rank för NÄSTA besök.
    const previous = readSelfRankSnapshot(currentUserId);
    setChange(computeRankChange(previous, currentRank));
    writeSelfRankSnapshot(currentUserId, currentRank);
  }, [currentUserId, currentRank]);

  return change;
}
