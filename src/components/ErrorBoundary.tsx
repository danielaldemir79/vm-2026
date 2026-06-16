// ErrorBoundary, appens skyddsnät mot en kraschande komponent (HOTFIX, white-screen).
//
// VARFÖR (Daniels "aldrig krasch"-krav): appen hade INGEN error boundary, så ett
// undantag som kastas under render i EN komponent avmonterade HELA React-trädet ->
// blank sida ("white screen of death"). Det inträffade live mitt under VM: en alltid-
// monterad vy (T83 håller alla flik-paneler monterade) kastade på verklig data och
// släckte hela appen. En error boundary fångar felet, ISOLERAR det till sin egen
// delträd, och visar en lugn fallback medan RESTEN av appen lever vidare.
//
// REACT-KONTRAKTET: bara en KLASS-komponent kan vara en error boundary (det finns
// ingen hook-motsvarighet). Den fångar fel under render, i livscykler och i
// konstruktorer hos sina BARN (inte i event-handlers, async-kod eller sig själv).
// Vi implementerar båda krokarna:
//   - getDerivedStateFromError: sätter fallback-state (rendera fallbacken nästa gång).
//   - componentDidCatch: loggar felet + komponent-stacken fail-loud (PRINCIPLES §8),
//     så ett fångat fel ALDRIG maskeras tyst , det syns i konsolen för felsökning.
//
// ISOLERINGS-GRANULARITET: en boundary isolerar sitt delträd. Vi wrappar därför varje
// flik-panels INNEHÅLL (en kraschande flik släcker inte de andra) och de tunga
// sektionerna var för sig (en kraschande stats-vy släcker inte livekortet), plus en
// boundary kring app-roten som sista skyddsnät. resetKey: byts den (t.ex. aktiv flik)
// nollställs fel-läget, så en transient krasch inte fastnar efter att användaren
// navigerat vidare.
//
// A11Y: fallbacken är role="alert" (annonseras av skärmläsare), fokuserbar (tabIndex
// -1 + autofokus) så tangentbordsfokus inte fastnar i ett avmonterat delträd, och helt
// statisk (ingen rörelse, så den är reduced-motion-ok per definition).

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Kort etikett för VAD som kraschade ("den här vyn", "skytteligan"), så fallback-
   * texten och logg-meddelandet pekar ut delträdet. Default: en neutral formulering.
   */
  label?: string;
  /**
   * Byt detta värde för att NOLLSTÄLLA fel-läget (t.ex. aktiv flik-id): när det ändras
   * försöker boundaryn rendera sina barn igen. Låter en transient krasch släppa när
   * användaren navigerar vidare i stället för att fastna tills sid-omladdning.
   */
  resetKey?: string | number;
  /**
   * Egen fallback-render (sällan behövd). Default = den inbyggda lugna fallback-rutan.
   * Får felet + en retry-funktion, så en anropare kan bygga en egen lugn yta.
   */
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  /** Det fångade felet, eller null när delträdet renderar normalt. */
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  /** React-kroken som växlar till fallback-render när ett barn kastar. */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  /** Logga fail-loud (PRINCIPLES §8): felet + komponent-stacken, aldrig tyst maskering. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    const where = this.props.label ? ` (${this.props.label})` : '';
    // Fail-loud diagnostik (PRINCIPLES §8): felet + komponent-stacken syns i konsolen.
    console.error(
      `[VM2026] ErrorBoundary fångade ett renderingsfel${where}. ` +
        'Delträdet visar en fallback; resten av appen lever vidare.',
      error,
      info.componentStack
    );
  }

  /** resetKey ändrades (t.ex. flik-byte) och vi är i fel-läge -> försök rendera barnen igen. */
  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.props.resetKey !== prev.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  /**
   * Callback-ref på fallback-rutan: flyttar fokus till den (role=alert) NÄR den fästs i
   * DOM:en, så en skärmläsare hör den OCH tangentbordsfokus inte ligger kvar i det
   * avmonterade delträdet. Robust oavsett om felet fångas vid mount eller en senare
   * uppdatering (en callback-ref körs vid varje attach, till skillnad från componentDid*
   * som beror på exakt vilken livscykel-övergång felet inträffade i).
   */
  private readonly focusFallback = (node: HTMLDivElement | null): void => {
    node?.focus();
  };

  /** Försök rendera barnen igen (retry-knappen + resetKey-väg). */
  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback(error, this.retry);
    }

    const what = this.props.label ?? 'den här vyn';
    return (
      <div
        ref={this.focusFallback}
        role="alert"
        tabIndex={-1}
        data-error-boundary=""
        className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-5 text-sm outline-none"
      >
        <p className="font-display text-base font-semibold text-fg">Något gick fel i {what}</p>
        <p className="text-fg-muted">
          Vi kunde inte visa den här delen just nu. Resten av appen fungerar som vanligt, du kan
          försöka igen.
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="rounded-pill border border-border bg-surface-raised px-4 py-1.5 font-display text-sm font-semibold text-fg transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Försök igen
        </button>
      </div>
    );
  }
}
