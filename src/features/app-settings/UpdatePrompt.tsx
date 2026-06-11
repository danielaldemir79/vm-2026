// "Ny version finns"-prompten (PRESENTATION, T43): en DISKRET banner som dyker upp
// när en ny app-version väntar (eller, en gång, när appen blivit offline-redo).
//
// Logiken (finns en ny version? ta i bruk den? avfärda?) ägs av useAppUpdate;
// denna komponent renderar bara. Estetiken speglar OnlineStatusIndicator/
// InstallBanner (samma yt-tokens, pill-knappar, status-prick) så den känns hemma
// i appens "arena i kvällsljus"-uttryck. Design-frontend ger finputs ovanpå; en
// funktionell, tillgänglig bas räcker här.
//
// TILLGÄNGLIGHET: role="status" + aria-live="polite" så en skärmläsare hör att en
// ny version finns utan att fokus flyttas. Knapparna bär synlig text som matchar
// sitt tillgängliga namn (WCAG 2.5.3). Fäst längst ner (fixed) så den aldrig
// tränger sönder layouten; pointer-events styrs så den inte blockerar appen när dold.

import { useAppUpdate, type AppUpdateApi } from './use-app-update';
import type { RegisterAppSw } from './register-sw';

export interface UpdatePromptProps {
  /**
   * Injicerbar uppdaterings-API (testbarhet): default = den riktiga useAppUpdate.
   * Test/Storybook kan skicka ett pinnat tillstånd, och NÄR `api` är satt skickar
   * komponenten en no-op-registrerare till useAppUpdate så ingen riktig SW
   * registreras (hookens eget tillstånd ignoreras till förmån för `api`).
   */
  api?: AppUpdateApi;
}

/**
 * No-op SW-registrerare som matchar RegisterAppSw men aldrig rör en riktig service
 * worker. Används när `api` injiceras: rules-of-hooks tvingar oss att alltid anropa
 * useAppUpdate, men dess registrerings-effekt får då ingen sidoeffekt. updateSW blir
 * en no-op (returnerar löst Promise) eftersom det injicerade api:t ändå äger handlingen.
 */
const noopRegister: RegisterAppSw = () => async () => {};

/**
 * Liten uppdaterings-ikon (cirkulär pil) i en accent-tonad bricka, aria-hidden.
 * Ren dekor: etiketten bär betydelsen, ikonen gör bara prompten igenkännbar som
 * "uppdatera". Samma "app-bricka"-form som InstallBanner för visuell familjelikhet.
 */
function UpdateIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-accent"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))',
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </span>
  );
}

export function UpdatePrompt({ api }: UpdatePromptProps) {
  // Hooken anropas ovillkorligt (rules-of-hooks). När `api` injiceras skickar vi
  // en no-op-registrerare så hookens registrerings-effekt INTE rör en riktig SW,
  // och vi använder då det injicerade api:t (hookens eget tillstånd ignoreras).
  // Utan `api` (produktionsvägen) körs den riktiga registreraren som vanligt.
  const own = useAppUpdate(api ? noopRegister : undefined);
  const { needRefresh, offlineReady, updateApp, dismiss } = api ?? own;

  // Inget att visa: varken ny version eller offline-redo-beskedet.
  if (!needRefresh && !offlineReady) {
    return null;
  }

  // En ny version har företräde framför offline-redo-beskedet (det är det
  // handlingsbara: en knapp att uppdatera). offlineReady ensamt är ren info.
  const showRefresh = needRefresh;

  return (
    <div
      role="status"
      aria-live="polite"
      data-update-prompt={showRefresh ? 'refresh' : 'offline-ready'}
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <section
        className="flex w-full max-w-md flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-[var(--vm-shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-surface) 92%, var(--color-accent))',
        }}
      >
        <div className="flex items-center gap-3">
          <UpdateIcon />
          <div className="flex flex-col gap-0.5">
            <p className="font-display text-sm font-bold sm:text-base">
              {showRefresh ? 'Ny version finns' : 'Klar att användas offline'}
            </p>
            <p className="text-xs text-fg-muted">
              {showRefresh
                ? 'Ladda om för senaste versionen av appen.'
                : 'Appen fungerar nu även utan nätanslutning.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {showRefresh ? (
            <button
              type="button"
              data-update-action=""
              onClick={updateApp}
              className="rounded-pill bg-accent px-4 py-2 font-display text-sm font-semibold text-accent-fg shadow-md outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            >
              Ladda om
            </button>
          ) : null}
          <button
            type="button"
            data-update-dismiss=""
            onClick={dismiss}
            // WCAG 2.5.3: det tillgängliga namnet INNEHÅLLER den synliga texten
            // "Stäng", så röststyrning matchar, och aria-label förtydligar för
            // skärmläsare vad knappen gör i just detta läge.
            aria-label={showRefresh ? 'Stäng, behåll nuvarande version' : 'Stäng offline-beskedet'}
            className="rounded-pill border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-fg-muted outline-none transition-colors hover:bg-surface-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            Stäng
          </button>
        </div>
      </section>
    </div>
  );
}
