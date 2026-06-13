// useRegisterSection (T78, #165): en sektion anmäler sin närvaro till navet.
//
// VARFÖR här (inte i sektionens yttre skal): registreringen ska ske DÄR sektionen
// FAKTISKT renderar innehåll. De live-gatade sektionernas skal (PredictionSection
// m.fl.) returnerar null FÖRE de renderar sin vy, så hooken sitter i VYN (som bara
// monteras när sektionen är närvarande). Tracker-vyerna (daily/grupper/...) monteras
// alltid och registrerar sig alltid. Resultat: registret speglar exakt de sektioner
// som ligger i DOM:en just nu, inga döda chips.
//
// TOLERANT mot saknad provider (samma mönster som useRoomsSync): en sektion-vy renderas
// i många isolerade tester UTAN en SectionNavProvider. Utan provider blir hooken en
// no-op, så en vy aldrig kraschar för att navet inte finns. Navet i appen ligger alltid
// under providern.

import { useContext, useEffect } from 'react';
import { SectionNavContext } from './section-nav-context';
import type { SectionDescriptor } from './section-labels';

/**
 * Registrera en sektion i navet medan komponenten är monterad. Avregistrerar vid
 * unmount. No-op utan en SectionNavProvider (tolerant).
 *
 * KRITISKT: deps är de stabila PRIMITIVERNA (id/label/order), ALDRIG `section`-objektets
 * referens. En anropare får skicka ett nytt litteral-objekt per render (`useRegisterSection({
 * id, label, order })`); hade `section` legat i deps skulle effekten kört om varje render,
 * och eftersom `register` gör en setState i providern -> re-render -> nytt litteral -> effekt
 * igen, blir det en oändlig render-loop. Vi rekonstruerar därför descriptorn INNE i effekten
 * ur primitiverna, så effekt-kroppen inte refererar den instabila `section`-referensen och
 * exhaustive-deps är nöjd med bara primitiverna.
 */
export function useRegisterSection(section: SectionDescriptor): void {
  const store = useContext(SectionNavContext);
  const register = store?.register;
  const unregister = store?.unregister;
  const { id, label, order } = section;
  useEffect(() => {
    if (!register || !unregister) {
      return;
    }
    register({ id, label, order });
    return () => unregister(id);
  }, [register, unregister, id, label, order]);
}
