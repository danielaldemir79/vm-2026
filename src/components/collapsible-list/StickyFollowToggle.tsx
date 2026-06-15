// DELAD "STICKY FÖLJ-MED"-KOMPRIMERA-KONTROLL (#173 T82 del 4) för LÅNGA listor som INTE kan
// virtualiseras , t.ex. dag-grupperade resultat (osparad inmatning bevaras via hidden) och den
// motion-animerade per-rums-topplistan (layout-glidet kräver mountade rader). I stället för
// byggstenens scroll-fönster (CollapsibleScrollList) wrappar den den befintliga ExpandToggle:n
// i en bar som blir STICKY i UTFÄLLT läge (klistrar under sajt-headern, top-16) och FÖLJER MED
// ner i listan, så KOMPRIMERA alltid är ett tryck bort oavsett scroll-position , ägarens "rad
// som följer med i listorna"-feedback. I KOMPRIMERAT läge är den en vanlig inline-kontroll
// (kort lista, inget att följa med i).
//
// VARFÖR en egen liten wrapper (DRY, rule-of-three): mönstret används nu på resultat-listan,
// per-rums-topplistan och tips-listan. Genom EN källa bär de identisk sticky-/a11y-semantik
// (samma ExpandToggle-kontrakt, samma .vm-sticky-follow-bar-fond), så de aldrig driftar isär.

import type { Ref } from 'react';
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
}

/**
 * En ExpandToggle i en bar som klistrar (sticky, top-16) i UTFÄLLT läge och följer med ner i
 * en lång lista, så komprimera nås från alla scroll-lägen. Inline i komprimerat läge.
 */
export function StickyFollowToggle({
  expanded,
  hiddenCount = 0,
  labels,
  controls,
  onToggle,
  buttonRef,
  name,
}: StickyFollowToggleProps) {
  return (
    <div
      {...{ [`data-${name}-toggle-bar`]: '' }}
      data-sticky={expanded ? 'true' : undefined}
      className={expanded ? 'vm-sticky-follow-bar sticky top-16 z-20 -mx-1 flex px-1 py-2' : 'flex'}
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
  );
}
