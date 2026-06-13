// SectionNavProvider (T78, #165): registret + aktiv-sektion + scroll-hopp för navet.
//
// ANSVAR: hålla "vilka sektioner finns just nu" (sektionerna registrerar sig själva via
// useRegisterSection när de FAKTISKT renderar) + "vilken är aktiv" (scroll-spy) + hur man
// hoppar till en sektion (mjuk scroll, reduced-motion -> direkt). Tunt lim mot React;
// navet (SectionNav) och sektions-vyerna är konsumenter.
//
// VARFÖR registret som källa: en sektion som returnerar null (fixtures-/icke-live-läge)
// registrerar sig aldrig, så navet kan inte rendera ett chip mot den. Döda chips blir
// omöjliga by-construction, i stället för att navet måste gissa närvaro.

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  SectionNavActionsContext,
  SectionNavStateContext,
  type SectionNavActions,
  type SectionNavState,
} from './section-nav-context';
import type { SectionDescriptor } from './section-labels';
import { useSectionSpy } from './use-section-spy';

interface SectionNavProviderProps {
  children: ReactNode;
}

/** Sortera en registreringsmängd till chip-ordning (stabilt på order). */
function toSorted(registry: ReadonlyMap<string, SectionDescriptor>): SectionDescriptor[] {
  return [...registry.values()].sort((a, b) => a.order - b.order);
}

export function SectionNavProvider({ children }: SectionNavProviderProps) {
  // Registret hålls som EN sorterad lista i state, härledd via en intern Map vid varje
  // register/unregister. VARFÖR funktionell setState över Mapen: register/unregister
  // anropas från sektionernas mount-effekter, ofta flera i samma commit; den funktionella
  // updatern bygger nästa lista deterministiskt oavsett batchning. register/unregister är
  // useCallback-stabila (byter aldrig referens), så useRegisterSection-effekten i vyerna
  // inte kör om i onödan.
  const [sections, setSections] = useState<SectionDescriptor[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const register = useCallback((section: SectionDescriptor) => {
    setSections((prev) => {
      const next = new Map(prev.map((s) => [s.id, s]));
      next.set(section.id, section);
      return toSorted(next);
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setSections((prev) => {
      if (!prev.some((s) => s.id === id)) {
        return prev; // ingen ändring -> ingen onödig re-render
      }
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const prefersReduced = useReducedMotion();

  const scrollTo = useCallback(
    (id: string) => {
      const heading = document.getElementById(id);
      const target = heading?.closest('section') ?? heading;
      if (!target) {
        return;
      }
      // reduced-motion: hoppa direkt (ingen animerad scroll), WCAG 2.3.3. Annars mjukt.
      // scroll-margin-top (satt i CSS via --vm-section-nav-offset) håller rubriken fri
      // från de två sticky-banden, så scrollIntoView landar rätt utan en magisk pixel.
      target.scrollIntoView({
        behavior: prefersReduced ? 'auto' : 'smooth',
        block: 'start',
      });
      // Markera direkt vid klick så chip:et känns responsivt även innan spy:n hinner.
      setActiveId(id);
    },
    [prefersReduced]
  );

  // Scroll-spy: markera aktiv sektion när man scrollar. Stabil setActiveId-referens.
  // Wiras DIREKT mot setActiveId (inte via context), så scroll-spy-kopplingen rörs inte
  // av context-delningen (C4).
  useSectionSpy(sections, setActiveId);

  // ACTIONS: register/unregister är båda useCallback-stabila (tomma deps -> byter aldrig
  // referens efter mount). Vi listar dem ärligt i memo-deps (nöjer exhaustive-deps utan
  // suppression), och eftersom de är stabila får actions-värdet ändå en STABIL identitet för
  // appens hela liv. DÄRMED re-renderas useRegisterSection-konsumenterna (de 8 sektions-vyerna)
  // ALDRIG av ett activeId-byte, vilket är hela C4-fixen.
  const actions: SectionNavActions = useMemo(
    () => ({ register, unregister }),
    [register, unregister]
  );

  // STATE: byter referens när sections/activeId/scrollTo ändras. Bara SectionNav konsumerar
  // den, så bara navet re-renderas när det aktiva chip:et ska uppdateras.
  const state: SectionNavState = useMemo(
    () => ({ sections, activeId, scrollTo }),
    [sections, activeId, scrollTo]
  );

  return (
    <SectionNavActionsContext.Provider value={actions}>
      <SectionNavStateContext.Provider value={state}>{children}</SectionNavStateContext.Provider>
    </SectionNavActionsContext.Provider>
  );
}
