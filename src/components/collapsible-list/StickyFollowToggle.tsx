// DELAD "STICKY FÖLJ-MED"-KOMPRIMERA-KONTROLL (#173 T82 del 4) för LÅNGA listor som INTE kan
// virtualiseras , t.ex. dag-grupperade resultat (osparad inmatning bevaras via hidden) och den
// motion-animerade per-rums-topplistan (layout-glidet kräver mountade rader). I stället för
// byggstenens scroll-fönster (CollapsibleScrollList) wrappar den den befintliga ExpandToggle:n
// i en bar som blir STICKY i UTFÄLLT läge och FÖLJER MED ner i listan, så KOMPRIMERA alltid är
// ett tryck bort oavsett scroll-position , ägarens "rad som följer med i listorna"-feedback. I
// KOMPRIMERAT läge är den en vanlig inline-kontroll (kort lista, inget att följa med i).
//
// VARFÖR en egen liten wrapper (DRY, rule-of-three): mönstret används nu på resultat-listan,
// per-rums-topplistan och tips-listan. Genom EN källa bär de identisk sticky-/a11y-semantik
// (samma ExpandToggle-kontrakt, samma .vm-sticky-follow-bar-fond), så de aldrig driftar isär.
//
// F1-FIX (T83, #175): tidigare renderade konsumenten den sticky baren och den långa listan som
// SKILDA SYSKON. En `position: sticky`-yta kan bara "klistra" och FÖLJA MED inom sin egen
// CONTAINING BLOCK (föräldraelementets innehållsbox, CSS Positioned Layout L3 §6.2). När baren
// låg ensam i en wrapper med bara sin egen höjd hade den NOLL sträcka att följa med längs , den
// skrollade ur synhåll direkt i stället för att klistra ner genom listan (exakt buggen Daniel
// rapporterade: "fäster i ett inre fönster och glider ur vy"). Fixen: baren OCH listan delar nu
// EN containing block (denna wrappers innehållsbox), genom att listan skickas in som `children`
// och renderas EFTER baren inuti samma `<div>`. Då sträcker sig containing block:en över hela
// listans höjd, så `sticky top-16` klistrar baren under sajt-headern och följer med ända ner i
// listan. Detta är scroll-modellen i flik-strukturen: varje flik scrollar rent (sid-scroll, ingen
// nästlad scroll-fälla), och baren följer den sid-scrollen.

import type { ReactNode, Ref } from 'react';
import { ExpandToggle } from '../ExpandToggle';
import './collapsible-list.css';

export interface StickyFollowToggleProps {
  /** true = listan är utfälld => baren blir sticky (följer med). false = vanlig inline-kontroll. */
  expanded: boolean;
  /** Antal element som DÖLJS i ihopfällt läge (count-driven etikett), om inte `labels` ges. */
  hiddenCount?: number;
  /** Egna binära etiketter (komprimerat/utfällt), annars count-etiketten. */
  labels?: { expand: string; collapse: string };
  /** Id på listan kontrollen styr (aria-controls). */
  controls: string;
  /** Växla utfälld/ihopfälld. */
  onToggle: () => void;
  /** Ref till knappen (för fokus-flytt vid ihopfällning, a11y). */
  buttonRef?: Ref<HTMLButtonElement>;
  /** Data-attribut-namnrymd på ExpandToggle + baren (`data-${name}-toggle`, `-toggle-bar`). */
  name: string;
  /**
   * Den LÅNGA listan (eller annat innehåll) som baren ska följa med längs. Renderas
   * EFTER baren inuti SAMMA wrapper, så bar + lista delar EN containing block och den
   * sticky baren har hela listans höjd att klistra/följa längs med (F1-fixen ovan).
   *
   * Bakåtkompatibelt: utelämnas `children` renderas bara baren (en konsument som
   * fortfarande har listan som ett separat syskon får då den GAMLA, buggiga
   * containing-block:en , men alla call-sites i repot skickar nu listan som children).
   */
  children?: ReactNode;
}

/**
 * En ExpandToggle i en bar som klistrar (sticky, top-16) i UTFÄLLT läge och, eftersom den långa
 * listan ligger i SAMMA wrapper (`children`), följer med ner i listan , komprimera nås från alla
 * scroll-lägen. Inline i komprimerat läge.
 */
export function StickyFollowToggle({
  expanded,
  hiddenCount = 0,
  labels,
  controls,
  onToggle,
  buttonRef,
  name,
  children,
}: StickyFollowToggleProps) {
  return (
    // Yttre wrapper = den GEMENSAMMA containing block:en för baren + listan. Sticky-
    // ytan kan bara följa med inom sin förälder, så listan MÅSTE ligga här inne (inte
    // som ett syskon), annars har baren ingen sträcka att klistra längs (F1-fixen).
    <div {...{ [`data-${name}-follow-region`]: '' }}>
      <div
        {...{ [`data-${name}-toggle-bar`]: '' }}
        data-sticky={expanded ? 'true' : undefined}
        className={
          expanded ? 'vm-sticky-follow-bar sticky top-16 z-20 -mx-1 flex px-1 py-2' : 'flex'
        }
      >
        <ExpandToggle
          expanded={expanded}
          hiddenCount={hiddenCount}
          labels={labels}
          controls={controls}
          onToggle={onToggle}
          buttonRef={buttonRef}
          position="top"
          name={name}
        />
      </div>
      {children}
    </div>
  );
}
