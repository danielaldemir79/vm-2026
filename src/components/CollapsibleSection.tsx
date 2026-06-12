// DELAD KOMPRIMERINGS-PRIMITIV (T68, #129). EN komponent/recept som ger HELA sidan
// ETT överblickbart komprimerings-mönster, i stället för 8 olika varianter.
//
// PROBLEM (Daniels spec 2026-06-12, #129): sidan har vuxit till åtta tunga sektioner
// (gruppspel, vad krävs, slutspelsträd, fyra tips-sektioner, admin, topplista). Allt
// är fullt utfällt samtidigt -> en oöverskådlig vägg att skrolla. Lösningen är att
// varje sektion får sin RUBRIK + BESKRIVNING alltid synliga och bara "TOPPEN" av sitt
// innehåll i komprimerat default-läge, med en tydlig expandera/komprimera-kontroll.
//
// VARFÖR EN delad primitiv (DRY, PRINCIPLES §3-4): alla sektioner MÅSTE bära IDENTISK
// semantik (samma aria-expanded/-controls, samma chevron-affordans, samma fokus-flytt
// vid ihopfällning), annars driver de isär och en skärmläsare får motstridig info per
// vy. Genom EN markup-källa kan de aldrig drifta. Återanvänder den befintliga
// ExpandToggle (T39/#68) med binära sektions-etiketter, samma kontroll som resultat-
// listan + tips-listan redan har.
//
// TVÅ EXPORTER, samma kärna:
//   * CollapsibleBody , bara klipp-kroppen + de två toggle-kontrollerna, UTAN egen
//     <section>/header. Sektionerna i appen äger redan sitt eget
//     `<section aria-labelledby>` + `<header>` (rubrik + beskrivning), så de lägger
//     bara en CollapsibleBody runt sitt INNEHÅLL (efter headern). Det håller rubriken
//     ALLTID synlig och komprimerar bara innehållet, med minimal omskrivning per vy.
//   * CollapsibleSection , en tunn komposition (section + header + CollapsibleBody)
//     för en grön-fälts-sektion som inte redan har en egen header-struktur.
//
// KOMPRIMERINGS-METOD = HÖJD-KLIPP med gradient-fade. VARFÖR inte render-subset här:
// "toppen"/"första raden" är RESPONSIV (ett grid visar 1/2/3/4 kort per rad beroende
// på skärmbredd; ett träd har en topp-del oavsett kort-antal). En render-subset kan
// inte veta brytpunkten vid render-tid, så ett höjd-klipp till ungefär en rad +
// gradient-fade är den ÄRLIGA "första raden synlig"-effekten oavsett skärmbredd
// (mobil först). Sektioner med en ren COUNT-baserad lista (tips-matcher) använder i
// stället sitt egna fönster-mönster (windowMatches + ExpandToggle), inte denna. Valet
// per sektion är dokumenterat i docs/decisions.md (T68).
//
// STATE ÖVERLEVER INTE RELOAD (KISS, dokumenterat val #129): expanderat/komprimerat är
// lokal UI-state (useState), inte persisterat. En sidladdning återställer sidan till
// det överblickbara default-läget, vilket är hela poängen. Behöver en sektion starta
// utfälld (avslöjandet, #129 punkt 11) styrs det per call-site via `startExpanded`.

import { useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { ExpandToggle } from './ExpandToggle';

export interface CollapsibleBodyProps {
  /**
   * Data-attribut-namnrymd: `data-${name}-toggle` på kontrollerna, så varje sektion
   * får stabila, egna test-/styling-krokar (t.ex. 'groups', 'bracket', 'admin').
   */
  name: string;
  /** Etiketterna för expandera/komprimera-kontrollen (per sektion, t.ex. "Visa alla grupper"). */
  toggleLabels: { expand: string; collapse: string };
  /** Det komprimerbara innehållet (klipps i höjd i komprimerat läge). */
  children: ReactNode;
  /**
   * Höjden (CSS-värde, t.ex. '8rem') innehållet klipps till i KOMPRIMERAT läge, dvs
   * hur stor "toppen" som syns. Default en dryg rad-höjd så första radens kort/topp-
   * delen av trädet syns. Per sektion justerbar (ett träd vill visa lite mer än en
   * tabell-rad). Mätt i rem så den följer användarens textstorlek (a11y/zoom).
   */
  collapsedMaxHeight?: string;
  /** Starta utfälld i stället för komprimerad (#129 punkt 11, avslöjandet). Default false. */
  startExpanded?: boolean;
  /**
   * Färgen gradient-faden tonar UT mot i komprimerat läge, dvs sektionens bakyta.
   * Default 'var(--color-surface)' (de flesta sektionerna ligger på en surface-Panel).
   * En sektion på en annan yta (t.ex. app-bakgrunden) skickar sin egen.
   */
  fadeTo?: string;
}

/**
 * KLIPP-KROPPEN + de två toggle-kontrollerna (ÖVRE alltid, NEDRE i utfällt läge), utan
 * egen <section>/header. Läggs runt en sektions INNEHÅLL (efter dess header), så
 * rubrik + beskrivning förblir alltid synliga och bara innehållet komprimeras.
 */
export function CollapsibleBody({
  name,
  toggleLabels,
  children,
  collapsedMaxHeight = '8.5rem',
  startExpanded = false,
  fadeTo = 'var(--color-surface)',
}: CollapsibleBodyProps) {
  const [expanded, setExpanded] = useState(startExpanded);
  const bodyId = useId();
  // FOKUS-FLYTT vid ihopfällning (samma a11y-grepp som tips-/resultatlistan, #42): den
  // NEDRE toggeln kan ligga långt ner i en utfälld sektion. Fäller användaren ihop
  // därifrån ska fokus (och vyporten) flyttas till den ÖVRE toggeln, så hen landar vid
  // sektionens topp i stället för kvar långt ner vid en kontroll som just försvann.
  const topToggleRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      if (!next) {
        // Ihopfällning: flytta fokus till den övre kontrollen (sektionens topp).
        // requestAnimationFrame så fokus sätts EFTER att React renderat om.
        requestAnimationFrame(() => topToggleRef.current?.focus());
      }
      return next;
    });
  }

  return (
    <div data-collapsible="" className="flex flex-col gap-4">
      {/* ÖVRE expandera/komprimera-kontroll: ALLTID nåbar utan att skrolla igenom en
          utfälld sektion, och fokus-MÅLET vid ihopfällning (toggle). Hela sidan delar
          EN kontroll-komponent (ExpandToggle), med binära sektions-etiketter (labels). */}
      <div className="flex">
        <ExpandToggle
          name={name}
          expanded={expanded}
          hiddenCount={0}
          labels={toggleLabels}
          controls={bodyId}
          onToggle={toggle}
          position="top"
          buttonRef={topToggleRef}
        />
      </div>

      {/* KROPPEN: komprimerad = höjd-klipp + gradient-fade ("toppen" syns), utfälld =
          full höjd. `hidden` används ALDRIG (innehållet ska synas komprimerat, inte
          döljas). data-collapsed är design-/test-haken. aria-hidden sätts INTE, även
          komprimerat innehåll är fortfarande i a11y-trädet (det syns visuellt och nås
          via tangentbord/skärmläsare; expandera-knappen styr bara den VISUELLA
          klippningen, inte tillgängligheten). */}
      <div
        id={bodyId}
        data-collapsible-body=""
        data-collapsed={expanded ? 'false' : 'true'}
        className={expanded ? '' : 'relative overflow-hidden'}
        style={expanded ? undefined : { maxHeight: collapsedMaxHeight }}
      >
        {children}
        {/* Gradient-fade över underkanten i komprimerat läge: signalerar "det finns
            mer nedanför" utan extra text. Ren dekoration (aria-hidden), pekar inte ut
            händelser (pointer-events-none) så den inte blockerar klick på innehållet
            som råkar nå kanten. Tema-trogen via fadeTo (sektionens bakyta). */}
        {expanded ? null : (
          <div
            aria-hidden="true"
            data-collapsible-fade=""
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
            style={{ background: `linear-gradient(to bottom, transparent, ${fadeTo})` }}
          />
        )}
      </div>

      {/* NEDRE expandera/komprimera-kontroll: bara i UTFÄLLT läge (i komprimerat läge
          räcker den övre, sektionen är ju kort då). Efter hela innehållet, så användaren
          kan fälla ihop utan att skrolla tillbaka upp. Identisk semantik som den övre
          (samma ExpandToggle), och vid ihopfällning härifrån flyttas fokus upp till den
          övre (toggle). */}
      {expanded ? (
        <div className="flex">
          <ExpandToggle
            name={name}
            expanded={expanded}
            hiddenCount={0}
            labels={toggleLabels}
            controls={bodyId}
            onToggle={toggle}
            position="bottom"
          />
        </div>
      ) : null}
    </div>
  );
}

export interface CollapsibleSectionProps extends Omit<CollapsibleBodyProps, 'fadeTo'> {
  /** Rubriken (ALLTID synlig). Bär sektionens tillgängliga namn via `labelledBy`. */
  heading: ReactNode;
  /** id på rubrik-elementet, för aria-labelledby på sektionen (a11y-landmärke). */
  labelledBy: string;
  /** Beskrivningen (ALLTID synlig, under rubriken). */
  description?: ReactNode;
  /** Ref till sektionens yttre element (för fokus/scroll efter komprimering). */
  sectionRef?: Ref<HTMLElement>;
  /** Bakytan gradient-faden tonar mot (vidarebefordras till CollapsibleBody). */
  fadeTo?: string;
}

/**
 * Grön-fälts-komposition: ett komplett `<section>` med rubrik + beskrivning ALLTID
 * synliga och en CollapsibleBody runt innehållet. För en sektion utan egen header-
 * struktur. (De befintliga sektionerna i appen använder CollapsibleBody direkt inuti
 * sitt eget section/header.)
 */
export function CollapsibleSection({
  heading,
  labelledBy,
  description,
  sectionRef,
  fadeTo,
  ...bodyProps
}: CollapsibleSectionProps) {
  return (
    <section
      ref={sectionRef}
      aria-labelledby={labelledBy}
      data-collapsible-section={bodyProps.name}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3">
        {heading}
        {description}
      </div>
      <CollapsibleBody {...bodyProps} fadeTo={fadeTo} />
    </section>
  );
}
