// MATCH-DETALJ-DRILL-IN-PROVIDER (T86, #178). Håller "vilket match-id är öppet?"-state OCH
// renderar den rika matchvyn (MatchDetailView) EN gång i trädet, så vyerna (Idag-listan,
// senare Tips-reveal-listan) bara wrappar sig själva en gång och får både openMatch-seamen
// och overlayn (samma form som TeamProfileProvider, patterns.md "klickbar-entitet ...").
//
// PLACERING (viktigt): måste ligga INNANFÖR ResultsProvider + LeaderboardProvider, eftersom
// matchvyn LÄSER matcher/lag ur results-storen, reveal ur leaderboard-storen, och live-data
// via use-live-data (egen hook, ingen provider). Den ligger alltså i App-skalet vid de andra
// delade providerna. Vilande tills openMatch anropas (ingen overlay renderas när inget är
// öppet), så den kostar inget förrän man faktiskt drillar in.

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { MatchDetailContext, type MatchDetailContextValue } from './match-detail-context';
import { MatchDetailView } from './MatchDetailView';

export function MatchDetailProvider({ children }: { children: ReactNode }) {
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  const openMatch = useCallback((matchId: string) => setOpenMatchId(matchId), []);
  const closeMatch = useCallback(() => setOpenMatchId(null), []);

  const value = useMemo<MatchDetailContextValue>(
    () => ({ openMatchId, openMatch, closeMatch }),
    [openMatchId, openMatch, closeMatch]
  );

  return (
    <MatchDetailContext.Provider value={value}>
      {children}
      {/* Overlayn renderas BARA när ett match-id är öppet (Modal monteras då, så Escape-/
          fokus-effekterna löper exakt en gång per öppning, samma livscykel som de andra
          dialogerna). Stäng nollställer det öppna id:t. */}
      {openMatchId !== null ? <MatchDetailView matchId={openMatchId} onClose={closeMatch} /> : null}
    </MatchDetailContext.Provider>
  );
}
