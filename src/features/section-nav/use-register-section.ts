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
 * `section` förväntas vara en stabil konstant-referens (en post ur SECTIONS), så
 * effekten inte kör om i onödan. Vi läser fälten i deps för säkerhets skull om en
 * anropare ändå skickar in ett nytt objekt per render.
 */
export function useRegisterSection(section: SectionDescriptor): void {
  const store = useContext(SectionNavContext);
  const register = store?.register;
  const unregister = store?.unregister;
  useEffect(() => {
    if (!register || !unregister) {
      return;
    }
    register(section);
    return () => unregister(section.id);
    // Fälten (inte objekt-referensen) i deps: stabilt även om anroparen skickar ett
    // nytt litteral-objekt per render. register/unregister är stabila (useCallback).
  }, [register, unregister, section.id, section.label, section.order, section]);
}
