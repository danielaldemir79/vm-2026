// Installations-bannern (PRESENTATION, T13): en DISKRET yta som erbjuder att
// installera appen, eller (på iOS Safari) visar hur man gör det manuellt.
//
// Logiken (vad som ska visas, prompt-anrop, avfärdande-persistens) ägs av
// useInstallPrompt; denna komponent renderar bara. Diskret = ett litet kort, inte
// en påträngande overlay, och med en avfärda-knapp som respekteras permanent.

import { ANDROID_PLAY_PROTECT_NOTE, detectAndroid } from './install-prompt';
import { useInstallPrompt } from './use-install-prompt';

/**
 * Liten installations-ikon i en mjuk accent-tonad "app-bricka" (dekorativ,
 * aria-hidden). Brickan gör erbjudandet INBJUDANDE (det läser som en app-ikon
 * att lägga till), utan att bli påträngande. KONTRAST (uppmätt, .vmshots): den
 * gröna ikonen på accent-tinten (color-mix accent 12% surface) håller 7.53:1
 * (mörkt) / 4.57:1 (ljust), båda >= 4.5:1, fast ikonen är dekorativ och
 * etiketten ("Installera VM 2026") bär betydelsen ändå.
 */
function InstallIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-accent"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))',
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    </span>
  );
}

export function InstallBanner() {
  const { mode, promptInstall, dismiss } = useInstallPrompt();

  if (mode === 'hidden') {
    return null;
  }

  // Play Protect-noten är Android-specifik. Läge 'prompt' fyras även av
  // desktop-Chrome (samma beforeinstallprompt-event), så vi gate:ar noten på
  // Android-UA, annars vore raden missvisande på desktop (T30/#50, C4).
  const showPlayProtectNote = mode === 'prompt' && detectAndroid(navigator);

  return (
    <section
      aria-labelledby="install-rubrik"
      data-install-banner={mode}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-[var(--vm-shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex items-center gap-3">
        <InstallIcon />
        <div className="flex flex-col gap-1">
          <h2 id="install-rubrik" className="font-display text-base font-bold sm:text-lg">
            Installera VM 2026
          </h2>
          {mode === 'prompt' ? (
            <>
              <p className="text-sm text-fg-muted">
                Lägg till appen på hemskärmen för helskärm, snabb start och offline-läge.
              </p>
              {/* Ärlig rad om Play Protect-varningen (T30/#50). Den kan inte
                  elimineras från vår sida (WebAPK:ns targetSdk ägs av webbläsarens
                  mintningsserver), så vi lugnar i stället för att förvirra. Diskret
                  (mindre + dämpad) så den inte stjäl fokus från install-knappen.
                  Visas BARA på Android (C4), den är irrelevant på desktop-Chrome. */}
              {showPlayProtectNote ? (
                <p data-install-play-protect-note="" className="text-xs text-fg-muted/80">
                  {ANDROID_PLAY_PROTECT_NOTE}
                </p>
              ) : null}
            </>
          ) : (
            // iOS-instruktion: Safari saknar install-prompt, så vi visar vägen.
            <p data-install-ios-steps="" className="text-sm text-fg-muted">
              Tryck på Dela-knappen i Safari och välj{' '}
              <span className="font-semibold text-fg">Lägg till på hemskärmen</span>.
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {mode === 'prompt' ? (
          <button
            type="button"
            data-install-action=""
            onClick={promptInstall}
            className="rounded-pill bg-accent px-4 py-2 font-display text-sm font-semibold text-accent-fg shadow-md outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            Installera
          </button>
        ) : null}
        <button
          type="button"
          data-install-dismiss=""
          onClick={dismiss}
          // WCAG 2.5.3 (Label in Name): det tillgängliga namnet INNEHÅLLER den
          // synliga texten "Inte nu", så röststyrning ("klicka Inte nu") matchar,
          // medan aria-label:n förtydligar VAD knappen gör för skärmläsare.
          aria-label="Inte nu, avfärda installations-tipset"
          className="rounded-pill border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-fg-muted outline-none transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          Inte nu
        </button>
      </div>
    </section>
  );
}
