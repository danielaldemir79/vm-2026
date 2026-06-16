// MÅL-NOTISER opt-in-sektion för Mer-fliken (T85, #177).
//
// VARFÖR i Mer: notis-opt-in är en INSTÄLLNING (slå på/av pling vid mål), hör hemma i
// Mer , den lugna samlingsplatsen för inställningar/arrangörsytor, bredvid favoritlag och
// install. Den DISKRETA app-känslan bevaras (ingen påträngande banner).
//
// Komponenten är TUNN: hela logiken (stöd, behörighet, prenumeration, lagring, fel) bor i
// usePush (som i sin tur lutar sig mot den rena state-maskinen + glue:n). Här väljer vi
// bara VAD som visas per läge, ärligt:
//   - ios-not-installed: lugn hint "lägg till på hemskärmen" (web-push kan inte fungera i
//     iOS-fliken, Apples krav), INGEN död knapp.
//   - unsupported:       "stöds inte i den här webbläsaren"-rad.
//   - denied:            "du har nekat notiser, slå på i webbläsarens inställningar".
//   - subscribable:      "Aktivera mål-notiser"-knappen (begär behörighet på klicket).
//   - subscribed:        "på" + "Skicka test-notis" (end-to-end-beviset) + "Stäng av".
//
// `surface` injiceras av call-sitet (samma Panel-form som resten av Mer), så sektionen hör
// visuellt till flik-familjen (DRY-yta, samma kontrakt som FavoriteTeamSection).

import type { ReactNode } from 'react';
import { usePush } from './use-push';
import type { PushApi } from './use-push';

export interface PushOptInSectionProps {
  /** Yt-formen från call-sitet (App ger Panel), så sektionen matchar Mer. */
  surface: (children: ReactNode) => ReactNode;
  /**
   * Injicerbar push-API (för test/Storybook). I appen utelämnas den och hooken körs;
   * tester kan injicera ett känt läge utan att mocka hela browser-/Supabase-stacken.
   */
  api?: PushApi;
}

/** Gemensam header (rubrik-kapitäl + titel + förklaring), en sanning för sektionen. */
function SectionHeader() {
  return (
    <header className="flex flex-col gap-1">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        Notiser
      </p>
      <h2 className="font-display text-xl font-bold sm:text-2xl">Mål-notiser</h2>
      <p className="text-sm text-fg-muted">
        Få en pling på mobilen när det blir mål i matcherna du följer.
      </p>
    </header>
  );
}

/** En lugn upplysnings-rad (oaktiverbara lägen: ios-hint, unsupported, denied). */
function InfoRow({ children, attr }: { children: ReactNode; attr: string }) {
  return (
    <p data-push-info={attr} className="text-sm text-fg-muted">
      {children}
    </p>
  );
}

export function PushOptInSection({ surface, api }: PushOptInSectionProps) {
  // Hooken körs ALLTID (regel: inga villkorade hooks). Den injicerade api:n vinner sedan
  // (test/Storybook). Hook-anropet är biverkningsfritt vid mount, så detta är säkert.
  const live = usePush();
  const { state, busy, error, info, activate, deactivate, sendTest } = api ?? live;

  return surface(
    <section data-push-optin-section="" className="flex flex-col gap-4">
      <SectionHeader />

      {state === 'ios-not-installed' ? (
        <InfoRow attr="ios">
          Lägg till appen på hemskärmen för att få notiser. På iPhone fungerar notiser bara när
          appen är installerad (öppna Dela-menyn och välj Lägg till på hemskärmen).
        </InfoRow>
      ) : null}

      {state === 'unsupported' ? (
        <InfoRow attr="unsupported">
          Notiser stöds inte i den här webbläsaren. Prova en nyare webbläsare eller installera appen
          på hemskärmen.
        </InfoRow>
      ) : null}

      {state === 'denied' ? (
        <InfoRow attr="denied">
          Du har nekat notiser för appen. Slå på dem igen i webbläsarens inställningar för den här
          sidan, så kan du aktivera mål-notiser.
        </InfoRow>
      ) : null}

      {state === 'subscribable' ? (
        <div className="flex">
          <button
            type="button"
            data-push-activate=""
            onClick={() => void activate()}
            disabled={busy}
            className="vm-install-pill disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BellIcon />
            {busy ? 'Aktiverar...' : 'Aktivera mål-notiser'}
          </button>
        </div>
      ) : null}

      {state === 'subscribed' ? (
        <div className="flex flex-col gap-3">
          <p data-push-info="on" className="text-sm font-medium text-fg">
            Mål-notiser är på för den här enheten.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-push-test=""
              onClick={() => void sendTest()}
              disabled={busy}
              className="vm-install-pill disabled:cursor-not-allowed disabled:opacity-60"
            >
              <BellIcon />
              {busy ? 'Skickar...' : 'Skicka test-notis'}
            </button>
            <button
              type="button"
              data-push-deactivate=""
              onClick={() => void deactivate()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-4 py-2 text-sm font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Stäng av
            </button>
          </div>
        </div>
      ) : null}

      {/* Feedback (fel/info): aria-live så hjälpmedel läser upp resultatet av en åtgärd.
          Fel i rött (semantisk fg), info diskret. Bara ETT av dem är satt åt gången
          (run() nollar det andra). */}
      <div aria-live="polite" className="min-h-0">
        {error ? (
          <p data-push-error="" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {info ? (
          <p data-push-feedback="" className="text-sm text-fg-muted">
            {info}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Liten klock-/notis-ikon (dekorativ, aria-hidden; texten bär betydelsen). */
function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="vm-install-pill-icon"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
