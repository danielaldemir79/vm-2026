// DELAD ihopfäll-/expandera-KONTROLL (lyft ur ResultEntryView, T39/#68).
//
// VARFÖR en delad komponent (DRY, rule-of-three): kontrollen används nu på TRE
// ställen, resultatinmatningen (#39 fönster + #42 dubblerad), och tips-listan
// (T39/#68, samma 3-dagars fönster). De MÅSTE bära IDENTISK semantik (samma
// aria-expanded, samma aria-controls, samma chevron-affordans), annars driver de
// isär och en skärmläsare får motstridig info per vy. Genom att de delar EN
// markup-källa kan de aldrig drifta (EN sanning för kontrollen).
//
// VARFÖR den DUBBLERAS (en uppe + en nere) av konsumenten, inte här: en utfälld
// lista kan vara lång, så användaren ska ALLTID nå en toggle utan att skrolla till
// slutet. Komponenten är därför en ren, parameteriserad knapp; vyn renderar två
// instanser (position 'top'/'bottom') och äger fokus-flytten vid ihopfällning.
//
// VARFÖR `name`-prefixet på data-attributen: varje vy behöver STABILA, egna
// test-/styling-krokar (resultatlistan: data-results-toggle*, tips-listan:
// data-predictions-toggle*), så befintliga testkontrakt bevaras oförändrade när
// kontrollen lyfts ut. `name` defaultar till 'results' så resultat-vyns redan
// testade attribut (data-results-toggle / -position) är byte-identiska som förr.

import type { Ref } from 'react';

export interface ExpandToggleProps {
  /** true = listan är utfälld (knappen säger "Visa färre"). */
  expanded: boolean;
  /** Antal element som DÖLJS i ihopfällt läge (för etiketten). */
  hiddenCount: number;
  /** Id på listan knappen styr (aria-controls). */
  controls: string;
  /** Växla utfälld/ihopfälld. */
  onToggle: () => void;
  /** Ref till knappens DOM-element (för fokus-flytt vid ihopfällning, a11y). */
  buttonRef?: Ref<HTMLButtonElement>;
  /** Skiljer den DUBBLERADE kontrollens två instanser åt (top/bottom) i data-attr. */
  position: 'top' | 'bottom';
  /**
   * Data-attribut-namnrymd (`data-${name}-toggle` / `-position`), så varje vy får
   * stabila, egna krokar. Default 'results' = oförändrade attribut för resultatvyn.
   */
  name?: string;
  /**
   * Egna BINÄRA etiketter (T68/#129): sektions-komprimeringen klipper på HÖJD, inte
   * på antal dolda element, så "N dolda"-etiketten passar inte. När `labels` ges
   * används `labels.expand` (komprimerat) / `labels.collapse` (utfällt) i stället för
   * den count-drivna etiketten, men ALL a11y-mekanik (aria-expanded/-controls,
   * namnrymd, chevron, fokus) är identisk. Utelämnad = count-etiketten (resultat-/
   * tips-listan, oförändrat).
   */
  labels?: { expand: string; collapse: string };
}

/**
 * Ihopfäll-/expandera-kontrollen (en accent-pill med chevron-affordans, #39).
 *
 * Den visuella finishen (accent-tint + chevron) är #39:s, ärvd oförändrad så
 * design-frontends premium-styling och de uppmätta AA-värdena gäller fortfarande.
 */
export function ExpandToggle({
  expanded,
  hiddenCount,
  controls,
  onToggle,
  buttonRef,
  position,
  name = 'results',
  labels,
}: ExpandToggleProps) {
  // BINÄR sektions-etikett (T68) eller den count-drivna list-etiketten (resultat/tips).
  const text = labels
    ? expanded
      ? labels.collapse
      : labels.expand
    : expanded
      ? 'Visa färre'
      : `Visa alla matcher (${hiddenCount} ${hiddenCount === 1 ? 'dold' : 'dolda'})`;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controls}
      {...{
        [`data-${name}-toggle`]: expanded ? 'collapse' : 'expand',
        [`data-${name}-toggle-position`]: position,
      }}
      className="group/toggle inline-flex items-center gap-2.5 self-center rounded-pill border border-[color-mix(in_srgb,var(--color-accent)_42%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))] px-6 py-3 font-display text-sm font-semibold text-fg shadow-[var(--vm-shadow-card)] transition-[background-color,border-color,box-shadow] duration-200 outline-none hover:border-[color-mix(in_srgb,var(--color-accent)_60%,var(--color-border))] hover:bg-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-surface))] hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
    >
      <span>{text}</span>
      {/* Chevron: pekar ner = "det finns mer", vänds upp i utfällt läge.
          aria-hidden (etiketten + aria-expanded bär betydelsen åt skärmläsare),
          ren affordans. Accent-färgad så den drar ögat utan extra text. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        // Tailwind v4:s rotate-180 sätter CSS-egenskapen `rotate` (inte den
        // gamla transform-axeln), så övergången måste rikta in sig på `rotate`
        // för att animera mjukt i stället för att snappa. Reduced-motion nollar
        // transition-duration globalt (index.css), så vridningen blir momentan
        // men korrekt riktad för den som bett om minskad rörelse (WCAG 2.3.3).
        className={`h-4 w-4 transition-[rotate] duration-200 ${expanded ? 'rotate-180' : ''}`}
        style={{ color: 'var(--color-accent)' }}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>
  );
}
