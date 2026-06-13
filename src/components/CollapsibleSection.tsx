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

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type TransitionEvent,
} from 'react';
import { ExpandToggle } from './ExpandToggle';
// PREMIUM-finishen (design-lager T68): eased gradient-fade, en "det finns mer"-cue
// vid klipp-kanten och en diskret höjd-transition. Stylas ENBART via data-hakarna
// nedan, så all semantik + alla tester står oförändrade.
import './collapsible.css';

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

  // ÄRLIG fade: faden + "det finns mer"-cue:n ska bara synas när innehållet FAKTISKT
  // klipps (scrollHeight > taket). Annars (kort innehåll, t.ex. ett tomt/laddnings-/
  // utan-rum-tillstånd som ryms inom collapsedMaxHeight) vore en fade + nedåt-chevron
  // ett FALSKT "mer nedanför"-löfte. Vi mäter kroppen och döljer faden om den inte
  // svämmar över. Default = true (visa faden) tills vi mätt, så server/första paint
  // inte blinkar, OCH så jsdom (där höjder är 0, ingen layout) behåller faden synlig
  // (test-kontraktet: en fade finns i komprimerat läge). Mätningen uppdaterar bara
  // när elementet har en RIKTIG höjd (clientHeight > 0), dvs i en riktig webbläsare.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isClipped, setIsClipped] = useState(true);

  // UTFÄLLT FÅR ALDRIG KLIPPAS (T75, #155). Buggen: utfällt läge cap:ade höjden till
  // ett fast tak (200rem) under antagandet "200rem överstiger alltid innehållet". Det
  // är FALSKT för en lång sektion på smal mobil (GroupPredictionsView: 12 grupp-kuponger
  // i 1 kolumn + ett simulerat slutspelsträd >> 3200px). När innehållet översteg taket
  // spillde det förbi boxen (overflow:visible utfällt), men det EFTERFÖLJANDE flex-
  // syskonet (nedre "Visa färre"-toggeln) placerades vid 200rem-gränsen och ÖVERLAPPADE
  // det spillda innehållet (sista gruppens grupptvåa-väljare gick inte att nå på iPhone).
  //
  // FIX: utfällt slutar med maxHeight:'none' (obegränsat, inget syskon kan överlappa).
  // Vi behåller ändå den mjuka öppnings-animationen: vid utfällning animeras max-height
  // mot ett tak (200rem) så CSS-transitionen (collapsible.css, [data-collapsed='false'])
  // glider fram, och NÄR den transitionen är klar (onTransitionEnd) flippar vi till
  // 'none'. Reduced-motion nollar transition-duration (index.css), så transitionend kan
  // utebli, då sätter vi 'none' direkt via effekten nedan. `none` kan inte animeras, men
  // vid den punkten har 200rem redan nåtts visuellt, så bytet snappar inte synligt.
  // expandedUnbounded=true => maxHeight:'none'; false => taket (animerbart).
  const [expandedUnbounded, setExpandedUnbounded] = useState(startExpanded);

  // Vid utfällning: släpp taket till 'none' så snart animationen är klar (eller direkt
  // om rörelse är reducerad / transitionen inte kan köra). Vid ihopfällning: återställ
  // till taket så NÄSTA utfällning åter kan animera från taket i stället för från 'none'.
  useEffect(() => {
    if (!expanded) {
      setExpandedUnbounded(false);
      return;
    }
    // Reduced-motion: ingen körbar transition -> onTransitionEnd uteblir, släpp direkt.
    // Optional chaining: matchMedia kan saknas (icke-DOM) eller ge undefined i test.
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true;
    if (prefersReducedMotion) {
      setExpandedUnbounded(true);
    }
    // Annars väntar vi på onTransitionEnd (handleBodyTransitionEnd) för den mjuka resan.
  }, [expanded]);

  // Öppnings-transitionen klar -> släpp höjd-taket helt (utfällt blir obegränsat).
  // Gatat på rätt element + property: transitionend bubblar från inre element (t.ex.
  // cue-pillrets transitions), och bara kroppens egen max-height-transition ska räknas.
  function handleBodyTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (expanded && event.target === bodyRef.current && event.propertyName === 'max-height') {
      setExpandedUnbounded(true);
    }
  }

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Mät om: i en riktig webbläsare har kroppen en höjd; jsdom ger 0 -> vi rör inte
    // default (faden kvar). +1px tolerans mot sub-pixel-avrundning.
    function measure() {
      const node = bodyRef.current;
      if (!node || node.clientHeight === 0) return;
      setIsClipped(node.scrollHeight > node.clientHeight + 1);
    }
    measure();
    // Innehållet är RESPONSIVT (grid byter kolumn-antal, träd-bredd ändras): mät om
    // när kroppen ändrar storlek så faden följer med (t.ex. rotation, fönster-resize,
    // när data landar och höjden växer). ResizeObserver finns i alla mål-webbläsare.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // collapsedMaxHeight + expanded påverkar klippningen, så mät om när de ändras.
  }, [collapsedMaxHeight, expanded]);

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
      {/* ÖVRE expandera/komprimera-kontroll: nåbar utan att skrolla igenom en utfälld
          sektion, och fokus-MÅLET vid ihopfällning (toggle). Hela sidan delar EN
          kontroll-komponent (ExpandToggle), med binära sektions-etiketter (labels).

          GATAD PÅ SAMMA isClipped SOM FADEN (T68-F1, #136): i KOMPRIMERAT läge visas den
          övre toggeln bara när innehållet FAKTISKT klipps (scrollHeight > taket). Ryms
          allt inom collapsedMaxHeight (kort innehåll: ett tomt/laddnings-/utan-rum-
          tillstånd) finns inget att "Visa alla" till, så en expandera-knapp vore ett
          lika falskt löfte som faden, och vi döljer båda av samma mätning. I UTFÄLLT
          läge visas den ALLTID (då MÅSTE man kunna fälla ihop), oavsett mätningen.
          jsdom-kontrakt: isClipped startar true och stannar true utan layout
          (clientHeight=0), så befintliga tester ser toggeln precis som förr. */}
      {expanded || isClipped ? (
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
      ) : null}

      {/* KROPPEN: komprimerad = höjd-klipp + gradient-fade ("toppen" syns), utfälld =
          full höjd. `hidden` används ALDRIG (innehållet ska synas komprimerat, inte
          döljas). data-collapsed är design-/test-haken. aria-hidden sätts INTE, även
          komprimerat innehåll är fortfarande i a11y-trädet (det syns visuellt och nås
          via tangentbord/skärmläsare; expandera-knappen styr bara den VISUELLA
          klippningen, inte tillgängligheten). */}
      <div
        id={bodyId}
        ref={bodyRef}
        data-collapsible-body=""
        data-collapsed={expanded ? 'false' : 'true'}
        onTransitionEnd={handleBodyTransitionEnd}
        // KOMPRIMERAT: relative (för fadens absoluta position) + overflow-hidden (för
        // höjd-klippet). UTFÄLLT: ingen overflow-hidden, så fokus-ringar/inre scroll-
        // containrar (t.ex. slutspelsträdets sidled-scroll) aldrig klipps.
        className={expanded ? '' : 'relative overflow-hidden'}
        // KOMPRIMERAT: klipp till "toppen" (collapsedMaxHeight). UTFÄLLT i TVÅ steg så
        // höjd-taket aldrig klipper innehållet men öppningen ändå animeras (T75, #155):
        //   1) under öppnings-transitionen: ett animerbart tak (200rem) så CSS kan
        //      ANIMERA max-height mjukt (collapsible.css). `none` går inte att animera.
        //   2) när transitionen är klar (expandedUnbounded, satt av onTransitionEnd /
        //      reduced-motion-effekten): maxHeight:'none', dvs OBEGRÄNSAT. Tidigare
        //      stod taket kvar permanent under det FELAKTIGA antagandet att 200rem
        //      "alltid överstiger innehållet" -> en lång sektion på smal mobil (12
        //      grupp-kuponger i 1 kolumn + slutspelsträd > 3200px) spillde förbi taket
        //      och nästa flex-syskon (nedre toggeln) lade sig vid 200rem-gränsen och
        //      överlappade innehållet (#155). Med 'none' kan inget syskon överlappa.
        // Lokala literaler (ingen modul-konstant) så inga värden binds eagert.
        style={
          expanded
            ? { maxHeight: expandedUnbounded ? 'none' : '200rem' }
            : { maxHeight: collapsedMaxHeight }
        }
      >
        {children}
        {/* "Det finns mer"-kanten i komprimerat läge, TVÅ separata lager (T68b, #136):
            1) GRADIENT-FADEN, ett heltäckande band längst ner som smälter det klippta
               innehållet ner i sektionens bakyta. REN DEKORATION (aria-hidden) och
               pointer-events-none ÖVER HELA bandet, så den aldrig blockerar klick/
               markering på det komprimerade innehåll som råkar nå kanten.
            2) CHEVRON-CUE-KNAPPEN, en liten pillerknopp centrerad vid klipp-kanten som
               fäller ut sektionen vid klick (samma toggle som den övre ExpandToggle).
            Varför TVÅ element och inte en klickbar fade: bara SJÄLVA pillret ska fånga
            klick, inte hela fade-bandet. Genom att hålla faden pointer-events-none och
            lägga klicket på en egen liten knapp fångas bara pillrets yta, resten av
            kanten förblir genomsläpplig för innehållet. */}
        {!expanded && isClipped ? (
          <>
            {/* Gradient-faden: tema-trogen via --vm-fade-to (sektionens bakyta), den
                eased multi-stop-gradienten bor i collapsible.css. Bär ingen cue längre
                (den flyttades till knappen nedan), bara övergången till bakytan. */}
            <div
              aria-hidden="true"
              data-collapsible-fade=""
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
              style={{ '--vm-fade-to': fadeTo } as CSSProperties}
            />
            {/* CHEVRON-CUE:N: ett icke-fokuserbart <div> med onClick, så mus/touch kan
                klicka på den pil man dras till och faktiskt fälla ut (Daniels feedback
                2026-06-13: "man vill klicka på pilen men inget händer"). Pillret +
                chevron-glyfen ritas av collapsible.css via [data-collapsible-cue]
                (flyttade hit från fadens pseudo-element).

                A11Y-VAL (icke-fokuserbart div + aria-hidden), motiverat i
                docs/decisions.md (T68b): den ÖVRE ExpandToggle är redan den tillgängliga
                kontrollen (aria-expanded/-controls, fokuserbar, etiketterad). Cue:n är en
                REN mus/touch-affordans som SPEGLAR den, så vi stänger den ur a11y-trädet
                (aria-hidden) och låter den vara ett ofokuserbart element. VARFÖR ett div
                och inte en <button>: aria-hidden på ett FOKUSERBART element (en button kan
                ta fokus vid klick även med tabIndex=-1) är ogiltig ARIA och trippar
                axe-regeln aria-hidden-focus (Copilot, PR #143). Ett div är inte
                fokuserbart, så aria-hidden är giltigt och cue:n hålls helt ur a11y-trädet
                utan att bli en andra kontroll (redundans/förvirring). Tangentbord +
                skärmläsare når toppknappen. Bär --vm-fade-to så pillrets ton matchar
                bakytan som faden, och en egen stabil hak (data-collapsible-cue) för
                styling/test. */}
            <div
              aria-hidden="true"
              data-collapsible-cue=""
              onClick={toggle}
              className="absolute bottom-0 left-1/2 h-9 w-12 -translate-x-1/2 cursor-pointer"
              style={{ '--vm-fade-to': fadeTo } as CSSProperties}
            />
          </>
        ) : null}
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
