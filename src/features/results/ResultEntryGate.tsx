// Grind för resultatinmatnings-VYN (T48, #81): vem får se ResultEntryView.
//
// BAKGRUND (Daniels pre-share-blockerare): resultat-inmatningen (ResultEntryView,
// T6) syntes för ALLA och vem som helst i rummet kunde ändra de DELADE resultaten.
// I live-läge ska bara arrangören (admin) mata in resultat, och de blir GLOBALT
// facit (official_match_results, via AdminSection). Vanliga vänner ska INTE mötas
// av en delad/officiell resultat-inmatning.
//
// REGELN (en sanning, testad fristående i shouldShowResultEntry):
//   - FIXTURES/lokalt läge: visa ALLTID (lokal utveckling, simulering, befintliga
//     tester driver tabellerna via lokal inmatning precis som förr).
//   - LIVE-läge: visa BARA när simulering är PÅ ("tänk om"-leken, skriver till sim-
//     overlayn, ALDRIG till DB/delat facit, se ResultsProvider). Utanför sim-läge döljs
//     den helt, för ALLA inkl. arrangören (T48 F2): arrangören matar in de OFFICIELLA
//     resultaten via AdminResultEntry (AdminSection), så en lokal inmatning vid sidan om
//     skulle ge två förvirrande inmatnings-ytor. En sanning för officiellt: admin-formen.
//
// VARFÖR en egen grind-komponent (inte logik i ResultEntryView): ResultEntryView är
// en REN, återanvändbar vy (renderas i fixtures-paritetstester utan admin-/facit-
// lager). Att baka in admin-/läges-villkor där hade kopplat den till facit-storen
// och brutit dess fristående testbarhet. Grinden bor i ETT ställe (den rena regeln
// shouldShowResultEntry + denna tunna wrapper), ResultEntryView förblir oförändrad.

import type { ReactNode } from 'react';
import { useResultsStore } from './results-context';
import { shouldShowResultEntry } from './result-entry-gate-rule';
import { ResultEntryView, type ResultEntryViewProps } from './ResultEntryView';

export interface ResultEntryGateProps extends ResultEntryViewProps {
  /**
   * Yt-form runt vyn (kort-stilen App ger, samma mönster som AdminSection/
   * LeaderboardSection). Default = ingen wrapper. Renderas BARA när vyn visas, så
   * en dold grind inte lämnar en tom ruta efter sig.
   */
  surface?: (children: ReactNode) => ReactNode;
}

/**
 * Wrappar ResultEntryView med live-grinden. Renderar inget (inkl. `surface`) när
 * vyn ska döljas (i live utanför simuleringsläge, för ALLA inkl. admin). Vidare-
 * befordrar render-propparna till vyn oförändrat.
 */
export function ResultEntryGate({ surface, ...viewProps }: ResultEntryGateProps) {
  const { mode, simulating } = useResultsStore();
  if (!shouldShowResultEntry(mode === 'live', simulating)) {
    return null;
  }
  const view = <ResultEntryView {...viewProps} />;
  return surface ? <>{surface(view)}</> : view;
}
