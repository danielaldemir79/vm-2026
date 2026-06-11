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
 *   - LIVE-läge: visa BARA när simulering är PÅ. Då är inmatningen den LOKALA "tänk
 *     om"-leken (skriver till sim-overlayn, ALDRIG till DB/delat facit), tydligt märkt
 *     av SimulationFrame/-Banner. Utanför sim-läge döljs den helt, för ALLA, ÄVEN
 *     arrangören (Daniels feedback, T48 F2): arrangören matar in de OFFICIELLA
 *     resultaten via den dedikerade admin-inmatningen (AdminResultEntry i AdminSection),
 *     så att visa den lokala inmatningen vid sidan om skulle ge TVÅ inmatnings-ytor och
 *     bli förvirrande ("vilken är den riktiga?"). En sanning för att mata in officiellt:
 *     admin-formen. Den lokala vyn är renodlat "tänk om".
 *
 * @param live        Är appen i live-läge (store.mode === 'live')?
 * @param simulating  Är what-if-läget PÅ?
 */
export function shouldShowResultEntry(live: boolean, simulating: boolean): boolean {
  // fixtures/lokalt: oförändrat (lokal inmatning driver tabellerna i utveckling/test).
  // live: bara i sim-läget ("tänk om"), aldrig som delad/officiell inmatning.
  return !live || simulating;
}
