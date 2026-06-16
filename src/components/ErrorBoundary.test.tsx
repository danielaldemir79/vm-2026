// Tester för ErrorBoundary (HOTFIX, white-screen): en kraschande komponent får ALDRIG
// släcka hela trädet , boundaryn fångar felet, visar en lugn role=alert-fallback, loggar
// fail-loud, och låter syskon-innehåll leva vidare. resetKey + retry nollställer felet.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

/** En komponent som kastar under render (simulerar en sektion som kraschar på verklig data). */
function Boom({ message = 'krasch i render' }: { message?: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  it('fångar en kraschande komponent och visar fallbacken i stället för en blank yta', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary label="skytteligan">
        <Boom />
      </ErrorBoundary>
    );
    // Fallbacken visas, INTE en blank sida.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-error-boundary');
    expect(alert.textContent).toContain('Något gick fel i skytteligan');
    // Fail-loud: felet loggades (PRINCIPLES §8), inte tyst maskerat.
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('ISOLERAR felet: ett kraschande delträd släcker inte ett syskon-delträd', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <ErrorBoundary label="vy A">
          <Boom />
        </ErrorBoundary>
        <ErrorBoundary label="vy B">
          <p>vy B lever</p>
        </ErrorBoundary>
      </div>
    );
    // Den kraschade ytan visar fallback, men syskon-ytan renderar normalt.
    expect(screen.getByText(/Något gick fel i vy A/)).toBeInTheDocument();
    expect(screen.getByText('vy B lever')).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('fallbacken är tillgänglig: role=alert och fokuseras (fokus fastnar ej i avmonterat träd)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(alert);
    errSpy.mockRestore();
  });

  it('"Försök igen" nollställer felet så ett delträd som slutat kasta renderas igen', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // En komponent som kastar EN gång, sedan renderar normalt vid nästa försök.
    let shouldThrow = true;
    function FlakyChild() {
      if (shouldThrow) {
        throw new Error('transient');
      }
      return <p>läkt innehåll</p>;
    }

    render(
      <ErrorBoundary>
        <FlakyChild />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Roten "lagas" och användaren trycker Försök igen -> innehållet renderas.
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /Försök igen/ }));
    expect(screen.getByText('läkt innehåll')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('resetKey-ändring nollställer fel-läget (t.ex. flik-byte) utan en retry-knapp-klick', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let shouldThrow = true;
    function FlakyChild() {
      if (shouldThrow) {
        throw new Error('transient');
      }
      return <p>nu ok</p>;
    }
    function Harness() {
      const [key, setKey] = useState('a');
      return (
        <>
          <button type="button" onClick={() => setKey('b')}>
            byt flik
          </button>
          <ErrorBoundary resetKey={key}>
            <FlakyChild />
          </ErrorBoundary>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Barnet slutar kasta och resetKey byts (simulerar navigering till annan flik).
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'byt flik' }));
    expect(screen.getByText('nu ok')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    errSpy.mockRestore();
  });
});
