// Sektions-navets kontrakt + contexts + konsument-hookar (T78, #165).
//
// Bär bara TYP-KONTRAKTET + contexts + hookar (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i
// SectionNavProvider.tsx (samma uppdelning som rooms-context/RoomsProvider).
//
// ANSVAR: ett LITET register där varje sektion anmäler sin närvaro när den FAKTISKT
// renderar innehåll (useRegisterSection vid mount, avregistrerar vid unmount). Navet
// (SectionNav) renderar chips ur registret sorterat på order. Det gör DÖDA chips
// omöjliga by-construction: en sektion som returnerar null (fixtures-/icke-live-läge,
// admin bara för admin) anropar aldrig sin registrering, så inget chip pekar på en
// sektion som inte finns i DOM:en.
//
// VARFÖR TVÅ contexts (C4, prestanda): scroll-spy:n byter aktiv sektion ofta vid scroll.
// Låg vi allt i EN context bytte dess värde identitet vid VARJE activeId-uppdatering, och
// alla 8 sektions-vyer (som bara behöver register/unregister via useRegisterSection)
// re-renderades vid varje aktiv-sektion-byte, onödig scroll-jank på en mobil-först-app med
// tunga vyer (gruppspelstabeller, slutspelsträd). Lösningen är det kanoniska React-mönstret
// att DELA contexten på frekvens:
//   - ACTIONS (register/unregister): STABIL identitet efter mount, ändras aldrig. Det är
//     enda ytan sektions-vyerna konsumerar, så ett activeId-byte re-renderar dem inte längre.
//   - STATE (sections/activeId/scrollTo): byter vid sections/activeId-ändring. Bara SectionNav
//     konsumerar den, så bara navet re-renderas när det aktiva chip:et ska uppdateras.

import { createContext, useContext } from 'react';
import type { SectionDescriptor } from './section-labels';

/**
 * ACTIONS-ytan: registrera/avregistrera en sektion. Memoas i providern till en STABIL
 * referens (callbacks är redan useCallback-stabila), så useRegisterSection-konsumenterna
 * aldrig re-renderas av ett activeId-byte.
 */
export interface SectionNavActions {
  /** Registrera en sektion (anropas av useRegisterSection vid mount). */
  register: (section: SectionDescriptor) => void;
  /** Avregistrera en sektion via id (anropas vid unmount). */
  unregister: (id: string) => void;
}

/**
 * STATE-ytan: det navet (SectionNav) läser. Byter referens när sections/activeId ändras,
 * vilket är meningen, bara navet konsumerar den.
 */
export interface SectionNavState {
  /** De FAKTISKT registrerade sektionerna, sorterade på order (navets chip-källa). */
  sections: SectionDescriptor[];
  /** Rubrik-id för den sektion man är i just nu (scroll-spy), eller null. */
  activeId: string | null;
  /** Hoppa till en sektion (mjuk scroll, reduced-motion -> direkt). */
  scrollTo: (id: string) => void;
}

/**
 * Actions-context med medvetet `null`-default. useRegisterSection (nedan) är TOLERANT mot
 * en saknad provider (faller till no-op), så en sektion-VY kan renderas i isolerade tester
 * UTAN en SectionNavProvider, precis som useRoomsSync är tolerant.
 */
export const SectionNavActionsContext = createContext<SectionNavActions | null>(null);

/**
 * State-context med medvetet `null`-default. useSectionNavState (nedan) KASTAR utan provider
 * (fail loud): navet utan register är ett wiring-fel, inte ett tomt tillstånd.
 */
export const SectionNavStateContext = createContext<SectionNavState | null>(null);

/**
 * Läs ENBART actions-ytan (för useRegisterSection). TOLERANT: returnerar `null` utan en
 * provider, så en sektion-vy som renderas utan navet (isolerade tester) inte kraschar.
 * Att den läser actions-contexten (inte state) är hela poängen med delningen (C4): vyerna
 * re-renderas inte längre när activeId ändras.
 */
export function useSectionNavActions(): SectionNavActions | null {
  return useContext(SectionNavActionsContext);
}

/**
 * Läs state-ytan (för SectionNav). KASTAR utan provider (fail loud, PRINCIPLES §8): navet
 * utan register är ett wiring-fel, inte ett tomt tillstånd.
 */
export function useSectionNavState(): SectionNavState {
  const state = useContext(SectionNavStateContext);
  if (state === null) {
    throw new Error('useSectionNavState måste användas inuti en <SectionNavProvider>.');
  }
  return state;
}
