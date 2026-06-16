import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PushOptInSection } from './PushOptInSection';
import type { PushApi } from './use-push';

// Sektionen testas med en INJICERAD PushApi (api-propen), så varje opt-in-läge renderas
// utan att mocka hela browser-/Supabase-stacken. Hooken (usePush) testas indirekt via sina
// rena delar (push-support/push-client-testerna); här bevisar vi att UI:t visar RÄTT sak
// per läge + att knapparna kallar rätt åtgärd.

/** En komplett, spionerbar PushApi i ett givet läge. */
function api(overrides: Partial<PushApi> = {}): PushApi {
  return {
    state: 'subscribable',
    busy: false,
    error: null,
    info: null,
    activate: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    sendTest: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Panel-yta-stub (samma kontrakt som App ger). */
const surface = (children: React.ReactNode) => <div data-surface="">{children}</div>;

describe('PushOptInSection', () => {
  it('subscribable: visar aktivera-knappen och kallar activate vid klick', () => {
    const a = api({ state: 'subscribable' });
    render(<PushOptInSection surface={surface} api={a} />);
    const btn = screen.getByRole('button', { name: /aktivera mål-notiser/i });
    fireEvent.click(btn);
    expect(a.activate).toHaveBeenCalledOnce();
    // Ingen test-/av-knapp i detta läge.
    expect(screen.queryByRole('button', { name: /skicka test-notis/i })).toBeNull();
  });

  it('subscribed: visar på-läget + test- och av-knapp, som kallar rätt åtgärd', () => {
    const a = api({ state: 'subscribed' });
    render(<PushOptInSection surface={surface} api={a} />);
    expect(screen.getByText(/mål-notiser är på/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /skicka test-notis/i }));
    expect(a.sendTest).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /stäng av/i }));
    expect(a.deactivate).toHaveBeenCalledOnce();

    // Ingen aktivera-knapp när man redan är på.
    expect(screen.queryByRole('button', { name: /aktivera mål-notiser/i })).toBeNull();
  });

  it('ios-not-installed: visar hemskärms-hinten, INGEN knapp (web-push kan inte fungera)', () => {
    render(<PushOptInSection surface={surface} api={api({ state: 'ios-not-installed' })} />);
    expect(screen.getByText(/lägg till appen på hemskärmen/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('unsupported: visar stöds-inte-raden, ingen knapp', () => {
    render(<PushOptInSection surface={surface} api={api({ state: 'unsupported' })} />);
    expect(screen.getByText(/stöds inte i den här webbläsaren/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('denied: visar inställnings-vägen, ingen aktiv knapp', () => {
    render(<PushOptInSection surface={surface} api={api({ state: 'denied' })} />);
    expect(screen.getByText(/nekat notiser/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('busy: knappen disablas och visar pågår-text', () => {
    render(<PushOptInSection surface={surface} api={api({ state: 'subscribable', busy: true })} />);
    const btn = screen.getByRole('button', { name: /aktiverar/i });
    expect(btn).toBeDisabled();
  });

  it('visar ett fel ärligt (aria-live), och inte samtidigt info', () => {
    render(
      <PushOptInSection
        surface={surface}
        api={api({ state: 'subscribable', error: 'Något gick fel' })}
      />
    );
    expect(screen.getByText('Något gick fel')).toBeInTheDocument();
  });

  it('visar info-feedback (t.ex. test skickad)', () => {
    render(
      <PushOptInSection
        surface={surface}
        api={api({
          state: 'subscribed',
          info: 'Test-notis skickad. Den dyker upp om en liten stund.',
        })}
      />
    );
    expect(screen.getByText(/test-notis skickad/i)).toBeInTheDocument();
  });

  it('använder inga em-dash i den svenska copyn (voice-regel)', () => {
    const { container } = render(
      <PushOptInSection surface={surface} api={api({ state: 'ios-not-installed' })} />
    );
    expect(container.textContent).not.toContain('—');
  });
});
