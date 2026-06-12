// DELAD MODAL-PRIMITIV (T33, #56). EN komponent som äger det a11y-dialog-kontrakt
// fem dialoger tidigare handrullade identiskt (TeamProfilePanel T10, OnboardingDialog
// T13, SettingsControl T32, ScoreGuide T34, GetStartedDialog T54). Rule-of-three var
// passerad 5+ gånger; varje fil flaggade själv (ScoreGuide/GetStarted-kommentarerna)
// att tröskeln nåtts och att extraktionen skulle bli en egen refaktor-task. Detta är
// den tasken.
//
// VARFÖR EN primitiv (DRY, PRINCIPLES §3-4): alla dialoger MÅSTE bära IDENTISK
// a11y-mekanik (role="dialog" + aria-modal + aria-labelledby, Escape, fokus-flytt in
// + fokus-retur, fokus-fälla, bakgrundsklick, portal, motion-gating), annars driver de
// isär och en skärmläsare/tangentbordsanvändare får motstridigt beteende per yta.
// Genom EN markup-/effekt-källa kan kontraktet aldrig drifta. Samma form som den andra
// delade primitiven i repot, CollapsibleSection (T68): en `name`-baserad
// data-attribut-namnrymd + styling-slots, semantik ägd EN gång.
//
// VAD PRIMITIVEN ÄGER (det funktionella + a11y-lagret):
//   * Portal till document.body (BUGGFIX-mönstret T32/#54): en trigger i en header med
//     sticky/backdrop-filter blir containing block för position:fixed-barn och klämmer
//     in overlayn. Portalen lyfter den till rot-stacking-contexten. ALLA dialoger får
//     nu detta robust, även de två som förr "råkade" funka för att de inte låg under en
//     sådan ancestor (TeamProfilePanel, OnboardingDialog).
//   * role="dialog" + aria-modal + aria-labelledby (+ valfri aria-describedby).
//   * Escape stänger. FAS-väljaren `escapeCapture` bevarar varje dialogs EXAKTA
//     nuvarande beteende (beteende-neutral refaktor, T33):
//       - DEFAULT (bubble-fas): de fyra dialoger som förr lyssnade i bubbel-fasen
//         (TeamProfile/Onboarding/Settings/ScoreGuide).
//       - `escapeCapture=true` (capture-fas + stopPropagation): GetStarted-guiden, som
//         kan öppnas OVANPÅ onboardingen ("Visa hur"-CTA:n) och MÅSTE konsumera Escape
//         först så bara den översta stängs (T54/#93 F2). VARFÖR just denna asymmetri och
//         inte "alla på capture": i jsdom (och DOM-spec) fyrar två CAPTURE-lyssnare på
//         SAMMA target (document) i REGISTRERINGS-ordning, så den UNDERSTA (monterad
//         först) skulle fyra FÖRE den översta och stänga sig själv innan stopPropagation
//         hinner verka, dvs "alla på capture" stänger BÅDA. Den fungerande stapel-
//         semantiken är capture-OVANPÅ-bubble (översta capture fyrar i capture-fasen,
//         stoppar den understas bubbel-lyssnare). Empiriskt probe-bekräftat (T33), inte
//         gissat. En generell "alla dialoger stack-safe"-lösning kräver en delad modal-
//         stack (z-index-topp äger Escape), flaggad som Improvement, inte smyglagd här.
//   * Bakgrundsklick stänger (panel-klick bubblar inte vidare via stopPropagation).
//     Avstängbart per dialog (`closeOnBackdrop=false`, onboardingens första-gångs-tour
//     ska inte avfärdas av ett oavsiktligt klick utanför).
//   * Fokus flyttas IN vid öppning till en caller-vald startpunkt (`initialFocusRef`,
//     t.ex. stäng-knappen eller en primär CTA) och ÅTERSTÄLLS till det element som var
//     fokuserat innan (öppnaren) vid stängning.
//   * Fokus-fälla: Tab/Shift+Tab cyklar inom panelen.
//   * Motion-gating (WCAG 2.3.3): overlayn tonar in, panelen reser sig (spring) bara
//     när rörelse EXPLICIT är tillåten (useReducedMotion() === false); innan
//     preferensen är känd, eller vid reducerad rörelse, bara opacitet (undviker den
//     1-frames-flash T10 dokumenterade).
//
// VAD PRIMITIVEN INTE ÄGER (varje dialog behåller SIN visuella identitet):
//   * Allt INNEHÅLL (hero-band, sektioner, knappar) är `children`.
//   * Overlay-/panel-UTSEENDET: caller skickar `overlayClassName`/`panelClassName`
//     (+ valfria `style`) och en `name` som ger `data-${name}-overlay`/`-panel`-
//     krokarna design + tester redan stylar/queryar mot. Primitivens default-klasser
//     bär bara den GEMENSAMMA layout-ryggraden (fixed inset-0 z-50, panel-flex), aldrig
//     en dialogs distinkta färg/blur/form, den lever i callerns klasser.
//
// LIVSCYKEL: primitiven monteras BARA när dialogen är öppen (callern villkorsrenderar
// den). Då löper Escape-/fokus-effekterna exakt EN gång per öppning via mount/unmount,
// vilket bevarar TeamProfilePanels C7/C9-invarianter (lyssnaren läggs en gång, churnar
// inte vid store-uppdatering mitt under öppen modal) utan en stabil-id-bindning per
// callsite.

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { springs, transitions } from '../motion';

export interface ModalProps {
  /**
   * Data-attribut-namnrymd: `data-${name}-overlay` på overlayn och `data-${name}-panel`
   * på panelen, så varje dialog behåller sina stabila, egna test-/styling-krokar
   * ('team-profile', 'settings', 'onboarding', 'score-guide', 'get-started'). En
   * caller som vill ha ett VÄRDE i kroken (ScoreGuide använder `data-...-overlay={surface}`)
   * skickar `overlayValue`/`panelValue`; annars blir attributet tomt (`=""`), exakt som
   * de handrullade dialogerna skrev det.
   */
  name: string;
  /** Valfritt värde på `data-${name}-overlay` (default tom sträng, som de gamla `=""`). */
  overlayValue?: string;
  /** Valfritt värde på `data-${name}-panel` (default tom sträng). */
  panelValue?: string;
  /** Stäng dialogen (Escape, bakgrundsklick, och callerns egen stäng-knapp). */
  onClose: () => void;
  /** id på rubrik-elementet i `children` (aria-labelledby, dialogens tillgängliga namn). */
  labelledById: string;
  /** Valfritt id på beskrivnings-elementet i `children` (aria-describedby). */
  describedById?: string;
  /**
   * Vart fokus flyttas vid öppning (a11y: tappa inte tangentbordsanvändaren utanför
   * modalen). Caller äger ref:en (t.ex. stäng-knappen eller en primär CTA), så den kan
   * peka på rätt element i SITT innehåll. Saknas en aktuell nod hoppas fokus-flytten
   * tyst över (modalen är ändå nåbar via fokus-fällan).
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Bakgrundsklick (overlay) stänger. Default true. Sätt false för en dialog som inte
   * ska kunna avfärdas av ett oavsiktligt klick utanför (onboardingens första-gångs-tour).
   */
  closeOnBackdrop?: boolean;
  /**
   * Lyssna på Escape i CAPTURE-fasen + stopPropagation, för en dialog som kan ligga
   * OVANPÅ en annan modal och måste stänga BARA sig själv (GetStarted-guiden, T54/#93 F2).
   * Default false (bubble-fas, som de fyra andra dialogerna). Se fil-headern för varför
   * "alla på capture" INTE är rätt lösning för stapling.
   */
  escapeCapture?: boolean;
  /** Klasser på OVERLAYN (callerns distinkta dimning/blur/layout-finish). */
  overlayClassName?: string;
  /** Inline-stil på overlayn (t.ex. dimnings-färgen via color-mix). */
  overlayStyle?: CSSProperties;
  /** Klasser på PANELEN (callerns distinkta form/bredd/yta). */
  panelClassName?: string;
  /** Inline-stil på panelen (t.ex. lagets hue-variabel i lag-profilen). */
  panelStyle?: CSSProperties;
  /**
   * Panelens in-resa (px) innan den glider på plats (gatad mot reducerad rörelse).
   * Default 24 (det fyra av fem dialoger använde). Lag-profilen reser 28 px; den
   * skickar sitt eget värde så den exakta in-animationen bevaras pixel för pixel.
   */
  panelRisePx?: number;
  /** Dialogens innehåll (hero, sektioner, knappar). Äger sitt eget utseende. */
  children: ReactNode;
}

/**
 * Den gemensamma fokus-fälle-hjälparen (Tab hålls inom panelen). Identisk logik som
 * de fem dialogerna hade var för sig: querySelecta panelens fokuserbara element och
 * wrapa Tab sista->första och Shift+Tab första->sista. Querya LIVE (inte en cachad
 * lista), så ett element som tillkommer/försvinner i innehållet räknas korrekt.
 */
function trapFocus(panel: HTMLElement | null, e: ReactKeyboardEvent<HTMLDivElement>): void {
  if (e.key !== 'Tab' || panel === null) {
    return;
  }
  const focusable = panel.querySelectorAll<HTMLElement>(
    'button, a[href], input, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

// Den gemensamma overlay-ryggraden: positionering (fixed inset-0 z-50, över allt),
// scroll och den identiska bottom-sheet-på-mobil / centrerad-på-desktop-justeringen som
// alla fem dialoger delade (items-end p-0 -> sm:items-center sm:p-6). Den dialog-
// SPECIFIKA finishen (backdrop-blur, .vm-profile-overlay-blur) bor i overlayClassName.
const OVERLAY_BASE =
  'fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6';

export function Modal({
  name,
  overlayValue = '',
  panelValue = '',
  onClose,
  labelledById,
  describedById,
  initialFocusRef,
  closeOnBackdrop = true,
  escapeCapture = false,
  overlayClassName = '',
  overlayStyle,
  panelClassName = '',
  panelStyle,
  panelRisePx = 24,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Rörelse-grind (WCAG 2.3.3): rörelsen tänds bara när preferensen EXPLICIT är "tillåt"
  // (=== false). useReducedMotion kan ge null första rendern; null behandlas då som
  // "reducerad" (bara opacitet) tills preferensen är känd, så ingen 1-frames-flash (T10).
  const motionEnabled = useReducedMotion() === false;

  // Escape stänger. Faslyssningen styrs av escapeCapture (se fil-headern): default
  // bubble, capture bara för en dialog som kan staplas (GetStarted). I capture-läget
  // stopPropagation:as eventet så den underliggande modalens bubbel-lyssnare inte också
  // fyrar (T54/#93 F2). Effekten löper en gång per öppning (primitiven monteras bara när
  // dialogen är öppen), så lyssnaren läggs exakt en gång och churnar inte vid
  // omrenderingar (TeamProfilens C9-invariant). onClose är callerns ansvar att hålla
  // stabil (useCallback) om callern bryr sig om churn-räkningen; annars är en
  // re-subscribe ofarlig för beteendet.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escapeCapture) {
          e.stopPropagation();
        }
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, escapeCapture);
    return () => document.removeEventListener('keydown', onKeyDown, escapeCapture);
  }, [onClose, escapeCapture]);

  // Flytta fokus IN vid öppning (till callerns startpunkt) och ÅTERSTÄLL till öppnaren
  // vid stängning. Vi minns det element som var fokuserat när modalen monterades och
  // återlämnar fokus dit vid unmount, så tangentbordsanvändaren inte tappas ut i body.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    initialFocusRef?.current?.focus();
    return () => {
      opener?.focus?.();
    };
    // Tomma deps: en gång per öppning (mount). initialFocusRef läses via .current i
    // effekten, så en ny ref-IDENTITET per render (ovanligt; callers memo:ar inte ref:er)
    // ska inte trigga en re-mount-liknande re-run, därav medvetet utelämnad ur deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPanelKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    trapFocus(panelRef.current, e);
  }, []);

  return createPortal(
    <motion.div
      {...{ [`data-${name}-overlay`]: overlayValue }}
      onClick={closeOnBackdrop ? onClose : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.quick}
      className={`${OVERLAY_BASE} ${overlayClassName}`.trim()}
      style={overlayStyle}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        aria-describedby={describedById}
        {...{ [`data-${name}-panel`]: panelValue }}
        // Stoppa klick i panelen från att bubbla till overlayns onClose (panel-klick
        // stänger inte; bara bakgrunden).
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
        initial={motionEnabled ? { opacity: 0, y: panelRisePx, scale: 0.98 } : { opacity: 0 }}
        animate={motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 }}
        transition={motionEnabled ? springs.gentle : transitions.quick}
        className={panelClassName}
        style={panelStyle}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body
  );
}
