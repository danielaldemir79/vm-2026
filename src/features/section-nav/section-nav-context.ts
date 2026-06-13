// Sektions-navets kontrakt + context + konsument-hookar (T78, #165).
//
// Bär bara TYP-KONTRAKTET + context + hookar (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i
// SectionNavProvider.tsx (samma uppdelning som rooms-context/RoomsProvider).
//
// ANSVAR: ett LITET register där varje sektion anmäler sin närvaro när den FAKTISKT
// renderar innehåll (useRegisterSection vid mount, avregistrerar vid unmount). Navet
// (SectionNav) renderar chips ur registret sorterat på order. Det gör DÖDA chips
// omöjliga by-construction: en sektion som returnerar null (fixtures-/icke-live-läge,
// admin bara för admin) anropar aldrig sin registrering, så inget chip pekar på en
// sektion som inte finns i DOM:en.

import { createContext, useContext } from 'react';
import type { SectionDescriptor } from './section-labels';

/** Vad sektions-nav-storen exponerar. */
export interface SectionNavStore {
  /** De FAKTISKT registrerade sektionerna, sorterade på order (navets chip-källa). */
  sections: SectionDescriptor[];
  /** Rubrik-id för den sektion man är i just nu (scroll-spy), eller null. */
  activeId: string | null;
  /** Registrera en sektion (anropas av useRegisterSection vid mount). */
  register: (section: SectionDescriptor) => void;
  /** Avregistrera en sektion via id (anropas vid unmount). */
  unregister: (id: string) => void;
  /** Sätt aktiv sektion (anropas av scroll-spy:n). */
  setActiveId: (id: string | null) => void;
  /** Hoppa till en sektion (mjuk scroll, reduced-motion -> direkt). */
  scrollTo: (id: string) => void;
}

/**
 * Context med medvetet `null`-default. Konsument-hookarna nedan är TOLERANTA mot en
 * saknad provider (faller till inert/no-op), så en sektion-VY kan renderas i isolerade
 * tester UTAN en SectionNavProvider, precis som useRoomsSync är tolerant. Navet (som
 * KRÄVER registret) bor alltid under providern i appen.
 */
export const SectionNavContext = createContext<SectionNavStore | null>(null);

/**
 * Läs hela sektions-nav-storen (för SectionNav). KASTAR utan provider (fail loud,
 * PRINCIPLES §8): navet utan register är ett wiring-fel, inte ett tomt tillstånd.
 */
export function useSectionNavStore(): SectionNavStore {
  const store = useContext(SectionNavContext);
  if (store === null) {
    throw new Error('useSectionNavStore måste användas inuti en <SectionNavProvider>.');
  }
  return store;
}
