// Installations-bannern (PRESENTATION, T13): en DISKRET yta som erbjuder att
// installera appen, eller (på iOS Safari) visar hur man gör det manuellt.
//
// Logiken (vad som ska visas, prompt-anrop, avfärdande-persistens) ägs av
// useInstallPrompt; denna komponent renderar bara. Diskret = ett litet kort, inte
// en påträngande overlay, och med en avfärda-knapp som respekteras permanent.

import { useInstallPrompt } from './use-install-prompt';

/** Liten nedladdnings-/installations-ikon (dekorativ, aria-hidden). */
function InstallIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-accent"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function InstallBanner() {
  const { mode, promptInstall, dismiss } = useInstallPrompt();

  if (mode === 'hidden') {
    return null;
  }

  return (
    <section
      aria-labelledby="install-rubrik"
      data-install-banner={mode}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-[var(--vm-shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex items-start gap-3">
        <InstallIcon />
        <div className="flex flex-col gap-1">
          <h2 id="install-rubrik" className="font-display text-base font-bold sm:text-lg">
            Installera VM 2026
          </h2>
          {mode === 'prompt' ? (
            <p className="text-sm text-fg-muted">
              Lägg till appen på hemskärmen för helskärm, snabb start och offline-läge.
            </p>
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
