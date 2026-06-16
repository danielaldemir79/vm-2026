// Onboarding-touren (PRESENTATION + a11y-dialog, T13; migrerad till delad <Modal> T33).
//
// A11y-dialog-kontraktet (role="dialog" + aria-modal, aria-labelledby/-describedby,
// Escape = hoppa över, fokus in/ut, fokus-fälla, motion-gating, portal) ägs nu av den
// delade <Modal>-primitiven (T33/#56). Denna komponent bidrar med sitt INNEHÅLL (hero-
// strip + textblock per steg, steg-prickar, footer) + den distinkta overlay-/panel-
// stilen via slottarna, så det visuella är oförändrat.
//
// VIKTIG SKILLNAD mot de andra dialogerna, bevarad: touren stänger INTE på bakgrunds-
// klick (closeOnBackdrop={false}). En första-gångs-tour ska inte avfärdas av ett
// oavsiktligt klick utanför; användaren väljer "Hoppa över" eller går igenom stegen.
// Fokus flyttas in till den primära knappen (Nästa/Klart), inte en stäng-knapp.
//
// Runtime-tillståndet (öppen, steg, persistens) ägs av useOnboarding; denna
// komponent renderar bara och anropar tillbaka.

import { useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { transitions } from '../../motion';
import { Modal } from '../../components/Modal';
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from './onboarding';
import { OnboardingArt } from './OnboardingArt';
import { GetStartedControl } from './GetStartedControl';
import { useOnboarding, type OnboardingApi } from './use-onboarding';

/**
 * Touren kan TA EMOT sitt tillstånd utifrån (`onboarding`-proppen) i stället för
 * att äga ett eget hook-anrop. VARFÖR (T39/#68, F1): App-skalet behöver veta NÄR
 * touren är öppen för att gata den fristående install-bannern bakom den (annars
 * ligger touren ovanpå bannern och install-knappen ser ut att inte göra något).
 * Genom att skalet äger EN useOnboarding-instans och delar den hit blir det EN
 * sanning, inte två divergerande "open"-tillstånd. Standalone-rendering (tester,
 * isolerad användning) faller tillbaka på den egna hooken.
 *
 * OBS: pga rules-of-hooks anropas `useOnboarding()` (ownApi) ALLTID, även när
 * proppen skickas in. Den egna instansen ANVÄNDS bara som fallback (`onboarding ??
 * ownApi`); när skalet skickar proppen läses ownApi:s tillstånd aldrig (båda läser
 * ändå samma localStorage-flagga, så ingen divergens). Det är inte ett extra
 * "open"-tillstånd i bruk, bara ett oundvikligt extra hook-anrop.
 */
export function OnboardingDialog({ onboarding }: { onboarding?: OnboardingApi } = {}) {
  const ownApi = useOnboarding();
  const { open, stepIndex, onLastStep, next, finish } = onboarding ?? ownApi;
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  // motionEnabled gatar bara den INRE per-steg-cross-faden (AnimatePresence); panelens
  // egen in-resa gatas av <Modal>. WCAG 2.3.3: ingen förskjutning vid reducerad rörelse.
  const motionEnabled = useReducedMotion() === false;

  if (!open) {
    return null;
  }

  const step = ONBOARDING_STEPS[stepIndex];
  const headingId = 'onboarding-rubrik';
  const bodyId = 'onboarding-text';

  return (
    // Den delade <Modal> äger a11y-dialog-kontraktet. Escape = hoppa över (onClose=finish),
    // fokus in till den primära knappen. closeOnBackdrop={false}: en första-gångs-tour ska
    // inte avfärdas av ett oavsiktligt bakgrundsklick (bevarat beteende). data-onboarding-
    // step-content (per steg, inuti) bär steg-id:t för design/test, som förr.
    <Modal
      name="onboarding"
      onClose={finish}
      labelledById={headingId}
      describedById={bodyId}
      initialFocusRef={primaryButtonRef}
      closeOnBackdrop={false}
      overlayClassName="backdrop-blur-sm"
      overlayStyle={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 72%, transparent)' }}
      panelClassName="relative flex w-full max-w-md flex-col gap-5 overflow-hidden rounded-t-card border border-border bg-surface p-6 shadow-[var(--vm-shadow-raised)] sm:rounded-card sm:p-7"
    >
      {/* HERO-STRIP + TEXTBLOCK byter innehåll PER STEG med en mjuk cross-fade
            (AnimatePresence). Bara opacitet + en liten y-glid rör sig, så ingen
            layout hoppar (ingen CLS) och inget kräver tunga assets. Vid reducerad
            rörelse hoppar bytet rakt (transitions.quick, ingen förskjutning), så
            WCAG 2.3.3 respekteras. mode="wait" => det gamla steget tonar UT innan
            det nya tonar IN, så de aldrig överlappar visuellt.

            VARFÖR key på step.id: presence-bytet ska ske när STEGET byts, inte vid
            varje render. Eyebrow:n ("Välkommen till VM 2026") ligger MED i blocket
            (den är samma text varje steg, men får tona med så hela textpelaren
            byts som en enhet, i stället för att eyebrow:n står still medan resten
            glider, vilket skulle se hackigt ut). */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.id}
          data-onboarding-step-content={step.id}
          initial={motionEnabled ? { opacity: 0, y: 8 } : { opacity: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={motionEnabled ? { opacity: 0, y: -8 } : { opacity: 0 }}
          transition={transitions.quick}
          className="flex flex-col gap-5"
        >
          {/* Dekorativ hero-strip: "arena i kvällsljus" + stegets CSS-illustration.
                aria-hidden i sin helhet (bär ingen läsbar text). */}
          <OnboardingArt art={step.art} />

          <header className="flex flex-col gap-2">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Välkommen till VM 2026
            </p>
            <h2 id={headingId} className="font-display text-2xl font-bold sm:text-3xl">
              {step.title}
            </h2>
            <p id={bodyId} className="text-sm leading-relaxed text-fg-muted">
              {step.body}
            </p>
          </header>
        </motion.div>
      </AnimatePresence>

      {/* Kom-igång-CTA i install-steget (T54/#93): touren BESKREV tidigare bara
            installationen (ren info, T39/#68 F1), en vän visste inte HUR. Nu öppnar
            "Visa hur" samma kom-igång-dialog med båda vägarna + rätt steg för enheten,
            direkt i onboardingen. Bara på install-steget; övriga steg bär ingen CTA.
            (Dialogen ligger i ett eget portal-topplager ovanpå touren, så den hamnar
            inte bakom tour-overlayn.)

            LIGGER UTANFÖR AnimatePresence-blocket (gatad på det LIVE härledda `step`,
            samma sanning som prickarna/footern nedan använder via stepIndex): med
            mode="wait" lever det utgående steg-innehållet kvar tills exit-animationen
            slutförts, så en CTA INUTI presence-barnet skulle släpa efter steg-bytet.
            Här utanför speglar den steget direkt. */}
      {step.art === 'install' ? (
        <div data-onboarding-get-started="">
          <GetStartedControl variant="inline" />
        </div>
      ) : null}

      {/* Steg-indikator: prickar som visar var i touren man är. aria-hidden,
            steg-status bärs av "Steg X av Y"-texten nedan för skärmläsare. */}
      <div aria-hidden="true" data-onboarding-dots="" className="flex gap-1.5">
        {ONBOARDING_STEPS.map((s, i) => (
          <span
            key={s.id}
            className="h-1.5 rounded-pill transition-all duration-200"
            style={{
              width: i === stepIndex ? '1.5rem' : '0.375rem',
              backgroundColor:
                i === stepIndex
                  ? 'var(--color-accent)'
                  : 'color-mix(in srgb, var(--color-fg) 20%, transparent)',
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-fg-muted">
          Steg {stepIndex + 1} av {ONBOARDING_STEP_COUNT}
        </span>
        <div className="flex gap-2">
          {/* HOPPA ÖVER: bara meningsfullt innan sista steget (där den primära
                knappen ändå stänger). Markerar touren som avklarad. */}
          {!onLastStep ? (
            <button
              type="button"
              data-onboarding-skip=""
              onClick={finish}
              className="rounded-pill border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-fg-muted outline-none transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            >
              Hoppa över
            </button>
          ) : null}
          {/* PRIMÄR: "Nästa" tills sista steget, då "Klart". Fokus-startpunkt. */}
          <button
            ref={primaryButtonRef}
            type="button"
            data-onboarding-next={onLastStep ? 'finish' : 'next'}
            onClick={next}
            className="rounded-pill bg-accent px-5 py-2 font-display text-sm font-semibold text-accent-fg shadow-[var(--vm-shadow-button)] outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            {onLastStep ? 'Klart' : 'Nästa'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
