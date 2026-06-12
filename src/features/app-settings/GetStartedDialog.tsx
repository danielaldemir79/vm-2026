// "Kom igång"-dialogen (PRESENTATION + a11y, T54/#93).
//
// FOKUS (senior-devs funktionella + a11y-lager, polerat av design-frontend): en
// VÄLKOMNANDE, glasklar yta som svarar på Daniels feedback. En vän, ofta icke-teknisk,
// ska direkt FÖRSTÅ att hen kan (a) använda appen direkt i webbläsaren ELLER (b) lägga
// den på hemskärmen som en app, med rätt steg för sin enhet. De två vägarna läses på en
// sekund som två tydliga val-kort högst upp; sedan följer rätt installations-steg bakom
// plattforms-flikar. Standalone-läget (appen körs redan installerad) visar i stället ett
// firande "allt klart"-kort (ingen poäng att be någon installera det som redan finns).
// All copy + alla steg HÄRLEDS ur den rena datan (get-started-steps.ts), så texten har
// EN sanning och kan justeras utan att röra denna komponent.
//
// "ARENA I KVÄLLSLJUS" (SPEC §7): dialogen bär samma premium-språk som poäng-guiden
// (ScoreGuide T34), lag-profilen (T10) och onboarding-strippen (T13): ett hero-band med
// grön + guld arena-glow, solid-token-emblem med mörk ink (aldrig token-text på tint),
// och lugna, skanbara kort. Den distinkta visuella tonen sitter i scopade `.vm-get-started-*`
// klasser i tokens.css (AA-mätt där, glow:en bär aldrig läsbar text).
//
// A11Y-DIALOG: knappen (i GetStartedControl) är en <button> med aria-haspopup="dialog".
// Dialogen följer projektets ETABLERADE modal-kontrakt, samma som ScoreGuide (T34),
// SettingsControl (T32), OnboardingDialog (T13), TeamProfilePanel (T10): role="dialog"
// + aria-modal, märkt av rubriken (aria-labelledby) + intro (aria-describedby), Escape
// stänger, klick på bakgrunden stänger, fokus flyttas IN vid öppning och ÅTERSTÄLLS
// till knappen vid stängning, en enkel fokus-fälla håller Tab inom dialogen, och
// overlayn PORTALERAS till document.body (samma stacking-context-skäl som T32/T34:
// en trigger i en header med sticky/backdrop-filter blir annars containing block för
// position:fixed-barn och klämmer in overlayn). Rörelse gatas mot reducerad rörelse.
//
// OBS, modal-primitiv (rule-of-three, redan flaggad i T34/#62, decisions.md): detta
// är ännu en handrullad a11y-dialog med samma kontrakt. Den extraheras MEDVETET INTE
// till en delad <Modal> i denna task (det är en egen refaktor-task, T34 flaggade
// tröskeln till dirigenten), så T54 inte rör fyra testade dialog-filer på spek.

import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { springs, transitions } from '../../motion';
import {
  GET_STARTED_PATHS,
  WEB_MODE_FACTS,
  getPathFor,
  resolveGetStartedState,
  type GetStartedPlatform,
} from './get-started-steps';

/** Props: dialogen styrs utifrån (öppen/stäng), så triggern äger fokus-återställningen. */
export interface GetStartedDialogProps {
  /** Stäng-callback (Escape, bakgrundsklick, stäng-knapp anropar denna). */
  onClose: () => void;
  /** Ref till dialog-panelen (fokus-fälla + fokus in). Ägs av triggern. */
  dialogRef: React.RefObject<HTMLDivElement | null>;
  /** Ref till stäng-knappen (fokus-startpunkt vid öppning). Ägs av triggern. */
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Fokus-fälle-hanteraren (Tab hålls inom dialogen). Ägs av triggern. */
  onDialogKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** true => animera panelen (reducerad rörelse gatar bort den). Ägs av triggern. */
  motionEnabled: boolean;
}

/**
 * Själva kom-igång-dialogen. Härleder plattforms-läget EN gång per öppning (rena
 * detektor-anrop via resolveGetStartedState) och låter användaren byta väg via flikar.
 */
export function GetStartedDialog({
  onClose,
  dialogRef,
  closeButtonRef,
  onDialogKeyDown,
  motionEnabled,
}: GetStartedDialogProps) {
  // Härled läget ur webbläsaren en gång vid öppning (standalone? + förvald plattform).
  const [{ isStandalone, defaultPlatform }] = useState(() => resolveGetStartedState(window));
  // Vilken plattforms-flik som är aktiv (startar på den förvalda, kan bytas).
  const [activePlatform, setActivePlatform] = useState<GetStartedPlatform>(defaultPlatform);

  const headingId = 'kom-igang-rubrik';
  const introId = 'kom-igang-intro';

  const panelInitial = motionEnabled ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 0 };
  const panelAnimate = motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 };

  return createPortal(
    <motion.div
      data-get-started-overlay=""
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.quick}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 backdrop-blur-sm sm:items-center sm:p-6"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={introId}
        data-get-started-dialog=""
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        initial={panelInitial}
        animate={panelAnimate}
        transition={motionEnabled ? springs.gentle : transitions.quick}
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-card border border-border bg-surface shadow-[var(--vm-shadow-raised)] sm:max-h-[88dvh] sm:rounded-card"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng kom igång"
          data-get-started-close=""
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-surface/80 text-fg-muted outline-none backdrop-blur-sm transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* HERO-BANDET: "arena i kvällsljus" (grön + guld glow mot surface-raised),
              samma familj som poäng-guiden. Ett solid-emblem + eyebrow + rubrik. All
              text står på den opaka surface-raised-fonden, glow:en är ren stämning. */}
          <header className="vm-get-started-hero relative flex items-center gap-4 overflow-hidden border-b border-border px-6 pb-5 pr-14 pt-6 sm:px-7 sm:pt-7">
            {/* Mjukt ljus-svep (stannar vid reducerad rörelse via index.css). Ren dekor. */}
            <span
              aria-hidden="true"
              className="vm-hero-sheen pointer-events-none absolute inset-0"
            />
            {/* Emblem: solid guld-bricka med mörk ink (samma färg-oberoende form som
                poäng-guidens pokal). En enkel "raket/kom-igång"-glyf. Dekorativt, rubriken
                bär betydelsen. */}
            <span
              aria-hidden="true"
              className="vm-get-started-emblem relative h-11 w-11 shrink-0 rounded-pill sm:h-12 sm:w-12"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 15c-1.5 1.3-2 4.5-2 4.5s3.2-.5 4.5-2" />
                <path d="M9 12a13 13 0 0 1 9-9 13 13 0 0 1-9 9Z" />
                <path d="M14.5 6.5 17 9M9 12l-2.5-.5a1 1 0 0 0-.9.27L4 13.5l3 1M12 15l.5 2.5a1 1 0 0 1-.27.9L10.5 20l-1-3" />
              </svg>
            </span>
            <div className="relative flex min-w-0 flex-col gap-0.5">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Kom igång
              </p>
              <h2
                id={headingId}
                className="font-display text-xl font-bold leading-tight sm:text-2xl"
              >
                Använd appen direkt, eller lägg den på hemskärmen
              </h2>
            </div>
          </header>

          {isStandalone ? (
            <AlreadyInstalled introId={introId} />
          ) : (
            <GetStartedBody
              introId={introId}
              activePlatform={activePlatform}
              onSelectPlatform={setActivePlatform}
            />
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/**
 * Standalone-läget: appen körs redan installerad, så vi ber INTE användaren installera
 * den igen, vi FIRAR lugnt att allt är på plats (T54-direktivet: "redan installerad ->
 * visa 'du kör appen, allt klart'"). En grön success-bock-medalj (solid success-yta +
 * mätt ink, samma färg-oberoende form som "Klar"-chippen, T11) ger ett tydligt
 * "allt klart"-ankare.
 */
function AlreadyInstalled({ introId }: { introId: string }) {
  return (
    <div data-get-started-installed="" className="flex flex-col gap-4 px-6 py-6 sm:px-7">
      <div className="vm-get-started-done flex items-start gap-4 rounded-card border border-border p-4 sm:p-5">
        {/* Success-bock-medalj: solid --vm-success-yta med mätt ink (--vm-on-success),
            den färg-oberoende solid-bricka-formen. Dekorativt, texten bär betydelsen. */}
        <span
          aria-hidden="true"
          className="vm-get-started-done-seal mt-0.5 h-11 w-11 shrink-0 rounded-pill"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12.5 4 4 10-10" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-display text-base font-bold leading-tight text-fg">Allt klart</p>
          <p id={introId} className="text-sm leading-relaxed text-fg">
            Du kör redan appen från hemskärmen, allt är klart. Dina tips sparas stabilt och du
            startar appen med ett tryck.
          </p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-fg-muted">
        Inget mer att göra här. Stäng den här rutan och fortsätt följa VM:t.
      </p>
    </div>
  );
}

/**
 * De TVÅ vägarna som val-kort (läses på en sekund) + plattforms-flikarna med rätt
 * installations-steg. Val-korten är rena rubriker över de två sektionerna: webb-läget
 * (alltid synligt) och hemskärms-läget (steg bakom flikar).
 */
function GetStartedBody({
  introId,
  activePlatform,
  onSelectPlatform,
}: {
  introId: string;
  activePlatform: GetStartedPlatform;
  onSelectPlatform: (platform: GetStartedPlatform) => void;
}) {
  return (
    <div className="flex flex-col gap-6 px-6 py-5 sm:px-7 sm:py-6">
      {/* En kort, vänlig ingress som sätter de två vägarna i kontext. */}
      <p className="text-sm leading-relaxed text-fg-muted">
        Det finns två sätt att vara med. Välj det som passar dig, du kan börja direkt.
      </p>

      {/* VÄG 1: använd direkt i webbläsaren (med ärlig info). */}
      <WebModeSection introId={introId} />

      {/* VÄG 2: lägg på hemskärmen, rätt steg för rätt enhet bakom flikar. */}
      <section
        aria-labelledby="kom-igang-app-rubrik"
        className="vm-get-started-path flex flex-col gap-3 rounded-card border border-border p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <PathGlyph tone="accent">
            {/* Telefon med plus = "lägg på hemskärmen". */}
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M10.5 18.5h3" />
            <path d="M12 7v5M9.5 9.5h5" />
          </PathGlyph>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id="kom-igang-app-rubrik"
                className="font-display text-base font-bold leading-tight text-fg"
              >
                Eller lägg den på hemskärmen som en app
              </h3>
              <span className="vm-get-started-tag vm-get-started-tag--accent shrink-0">
                Tryggast
              </span>
            </div>
            <p className="text-sm leading-relaxed text-fg-muted">
              Då öppnas den i helskärm, startar snabbt och fungerar även utan nät. Välj din enhet:
            </p>
          </div>
        </div>

        <PlatformTabs activePlatform={activePlatform} onSelectPlatform={onSelectPlatform} />
        <PlatformSteps activePlatform={activePlatform} />
      </section>
    </div>
  );
}

/**
 * En liten rund glyf-bricka som ankrar en väg/sektion. tone styr ringfärgen (accent
 * eller guld), men glyfen ritas i den dämpade fg-tonen mot en lugn tint, så den är
 * ren dekoration (aria-hidden) och bär ingen läsbarhet. children = SVG-path-innehållet.
 */
function PathGlyph({ tone, children }: { tone: 'accent' | 'gold'; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`vm-get-started-glyph vm-get-started-glyph--${tone} mt-0.5 h-10 w-10 shrink-0 rounded-pill`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

/** "Använd direkt i webbläsaren"-kortet: glyf + rubrik + ärliga punkter + rekommendation. */
function WebModeSection({ introId }: { introId: string }) {
  return (
    <section
      aria-labelledby="kom-igang-webb-rubrik"
      data-get-started-web=""
      className="vm-get-started-path flex flex-col gap-3 rounded-card border border-border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <PathGlyph tone="gold">
          {/* Glob = "i webbläsaren". */}
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
        </PathGlyph>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="kom-igang-webb-rubrik"
              className="font-display text-base font-bold leading-tight text-fg"
            >
              {WEB_MODE_FACTS.heading}
            </h3>
            <span className="vm-get-started-tag vm-get-started-tag--gold shrink-0">
              Snabbast att börja
            </span>
          </div>
          <p id={introId} className="text-sm leading-relaxed text-fg">
            {WEB_MODE_FACTS.intro}
          </p>
        </div>
      </div>

      {/* Ärliga punkter: en vänlig "tänk på"-ruta, inte en skrämmande varningslista. */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {WEB_MODE_FACTS.cautions.map((caution) => (
          <li
            key={caution}
            className="flex items-start gap-2.5 text-sm leading-relaxed text-fg-muted"
          >
            {/* Dekorativ "tänk på"-prick; texten bär hela betydelsen. */}
            <span
              aria-hidden="true"
              className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-pill bg-warning"
            />
            {caution}
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium leading-relaxed text-fg">{WEB_MODE_FACTS.recommendation}</p>
    </section>
  );
}

/**
 * Plattforms-flikarna. En tablist (WCAG: role="tablist"/"tab", aria-selected), så en
 * skärmläsare/tangentbordsanvändare förstår att det är växlingsbara vägar. Den aktiva
 * fliken bär aria-selected=true; klick byter aktiv väg. Varje flik har en enkel,
 * varumärkesneutral enhets-glyf (dekor) + sin etikett.
 */
function PlatformTabs({
  activePlatform,
  onSelectPlatform,
}: {
  activePlatform: GetStartedPlatform;
  onSelectPlatform: (platform: GetStartedPlatform) => void;
}) {
  return (
    <div role="tablist" aria-label="Välj enhet" className="flex flex-wrap gap-2">
      {GET_STARTED_PATHS.map((path) => {
        const selected = path.platform === activePlatform;
        return (
          <button
            key={path.platform}
            type="button"
            role="tab"
            aria-selected={selected}
            // aria-controls BARA på den valda fliken (copilot R2): bara den aktiva
            // tabpanel:n finns i DOM, och en IDREF mot ett orenderat id är ogiltig
            // ARIA. Ovalda flikar utan aria-controls är tillåtet mönster.
            aria-controls={selected ? `kom-igang-steg-${path.platform}` : undefined}
            id={`kom-igang-flik-${path.platform}`}
            data-get-started-tab={path.platform}
            onClick={() => onSelectPlatform(path.platform)}
            className="inline-flex items-center gap-2 rounded-pill border px-3.5 py-2 font-display text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            style={{
              backgroundColor: selected ? 'var(--color-accent)' : 'var(--color-surface)',
              color: selected ? 'var(--color-accent-fg)' : 'var(--color-fg-muted)',
              borderColor: selected
                ? 'color-mix(in srgb, var(--color-accent) 70%, transparent)'
                : 'var(--color-border)',
            }}
          >
            <PlatformGlyph platform={path.platform} />
            {path.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * En enkel, varumärkesneutral enhets-glyf per plattform (rent dekor, aria-hidden). Inga
 * varumärken: en generisk telefon för Android/iPhone (skilda av flik-etiketten) och en
 * skärm för datorn. currentColor => följer flikens text-färg, så glyfen ärver
 * vald/ovald-kontrasten automatiskt.
 */
function PlatformGlyph({ platform }: { platform: GetStartedPlatform }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {platform === 'desktop' ? (
        <>
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" />
        </>
      ) : (
        <>
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
          <path d="M10.5 18.5h3" />
        </>
      )}
    </svg>
  );
}

/** De numrerade stegen för den aktiva plattformen + ev. plattforms-noten. */
function PlatformSteps({ activePlatform }: { activePlatform: GetStartedPlatform }) {
  const path = getPathFor(activePlatform);
  // getPathFor är total över GetStartedPlatform-unionen (varje plattform finns i
  // GET_STARTED_PATHS), men TypeScript vet inte det. FAIL-LOUD på riktigt (copilot
  // R1 + PRINCIPLES §8): driftar datan och unionen isär ska det smälla i dev/test,
  // inte tyst rendera en tom yta.
  if (path === undefined) {
    throw new Error(`Kom-igång-väg saknas för plattformen "${activePlatform}" (datadrift)`);
  }
  // Båda noterna är numera VÄNLIG bra-att-veta-info: Android = Play Skydd-lugnande,
  // iOS = Safari-rekommendation (review-F1: inget hårt krav längre). Info-ton för
  // båda, ingen varnande ton behövs.
  const noteTone = 'info' as const;
  return (
    <div
      role="tabpanel"
      id={`kom-igang-steg-${activePlatform}`}
      aria-labelledby={`kom-igang-flik-${activePlatform}`}
      data-get-started-steps={activePlatform}
      className="flex flex-col gap-3"
    >
      {/* Numrerad lista = ordningen bärs av <ol> (skärmläsare läser steg-numren),
          inte av en hårdkodad siffra i texten. Tummvänliga steg-medaljer + luft. */}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {path.steps.map((step, index) => (
          <li key={step.id} data-get-started-step={step.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="vm-get-started-step-num mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill font-display text-xs font-bold tabular-nums"
            >
              {index + 1}
            </span>
            <span className="pt-0.5 text-sm leading-relaxed text-fg">{step.text}</span>
          </li>
        ))}
      </ol>
      {path.note !== null ? (
        <PlatformNote tone={noteTone} platform={activePlatform}>
          {path.note}
        </PlatformNote>
      ) : null}
    </div>
  );
}

/**
 * Plattforms-noten under stegen: en vänlig info-ruta med en liten glyf, så
 * Play Skydd-lugnandet (sköld) och iOS-Safari-rekommendationen (info-i, review-F1:
 * inget hårt krav) känns hjälpsamma, inte läskiga. Warning-tonen finns kvar i
 * typ-unionen för framtida bruk men används inte av någon nuvarande not.
 * Tinten + glyfen är ren dekor; texten bär betydelsen.
 */
function PlatformNote({
  tone,
  platform,
  children,
}: {
  tone: 'info' | 'warning';
  platform: GetStartedPlatform;
  children: ReactNode;
}) {
  return (
    <p
      data-get-started-note={platform}
      className={`vm-get-started-note vm-get-started-note--${tone} flex items-start gap-2.5 rounded-card border px-3.5 py-3 text-xs leading-relaxed text-fg-muted`}
    >
      <span aria-hidden="true" className="vm-get-started-note-glyph mt-px shrink-0">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {platform === 'android' ? (
            // Sköld = "lugnande, säkert", hör ihop med Play Skydd-INNEHÅLLET, inte
            // tonen (copilot R2: glyf keyad på plattform så iOS inte får skölden).
            <path d="M12 3 5 6v5c0 4.2 3 7.4 7 9 4-1.6 7-4.8 7-9V6l-7-3Z" />
          ) : (
            // Info-i = "bra att veta" (iOS Safari-rekommendationen m.fl.).
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </>
          )}
        </svg>
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
