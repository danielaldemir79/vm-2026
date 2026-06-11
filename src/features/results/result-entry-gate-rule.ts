// REN grind-regel för resultatinmatnings-vyn (T48, #81).
//
// Skild från ResultEntryGate.tsx (komponenten) så react-refresh-regeln hålls ren
// (en .tsx exporterar bara komponenter), och regeln kan testas helt fristående.
// Se ResultEntryGate.tsx för bakgrunden (Daniels pre-share-blockerare).

/**
 * Ska resultatinmatnings-vyn (ResultEntryView) visas?
 *
 * REGELN:
 *   - FIXTURES/lokalt läge: visa ALLTID (lokal utveckling, simulering, befintliga
 *     tester driver tabellerna via lokal inmatning precis som förr).
 *   - LIVE-läge + ADMIN: visa (arrangören får använda inmatningen).
 *   - LIVE-läge + ICKE-ADMIN (eller admin-status okänd än): visa BARA när simulering
 *     är PÅ. Då är inmatningen den LOKALA "tänk om"-leken (skriver till sim-overlayn,
 *     ALDRIG till DB/delat facit), tydligt märkt av SimulationFrame/-Banner. Utanför
 *     sim-läge döljs den helt, så en vanlig vän aldrig ser en delad/officiell inmatning.
 *
 * @param live        Är appen i live-läge (store.mode === 'live')?
 * @param isAdmin     Är användaren arrangör (facit-storens isAdmin)? null = okänt än.
 * @param simulating  Är what-if-läget PÅ?
 */
export function shouldShowResultEntry(
  live: boolean,
  isAdmin: boolean | null,
  simulating: boolean
): boolean {
  if (!live) {
    return true; // fixtures/lokalt: oförändrat, lokal inmatning driver
  }
  if (isAdmin === true) {
    return true; // live + admin: arrangören får mata in
  }
  // live + icke-admin (eller admin-status ännu okänd): bara i sim-läget ("tänk om").
  // Att gata bort när isAdmin är null (laddar) undviker en kort blink av en delad
  // inmatning innan admin-status är känd, fail-safe mot att visa för mycket.
  return simulating;
}
