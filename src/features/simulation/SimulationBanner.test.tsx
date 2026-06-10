import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsProvider } from '../results/ResultsProvider';
import { SimulationBanner } from './SimulationBanner';

// What-if-kontrollens UI (T12): markering ("Simulering pågår") + toggle + reset.
// Funktionellt testat END-TO-END mot den riktiga storen (ResultsProvider), så
// knapparna faktiskt slår på/av sim-läget och markeringen speglar det.

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function renderBanner() {
  return render(
    <ResultsProvider env={fixturesEnv()}>
      <SimulationBanner />
    </ResultsProvider>
  );
}

/** Banner-sektionen (stabil hake), så vi kan scopa frågor till den. */
function banner(): HTMLElement {
  return document.querySelector('[data-simulation-banner]') as HTMLElement;
}

describe('SimulationBanner, markering + toggle', () => {
  it('börjar AV: visar Starta-knapp, ingen "Simulering pågår"-status', async () => {
    renderBanner();
    await waitFor(() => expect(banner()).toBeInTheDocument());

    expect(banner()).toHaveAttribute('data-simulation-active', 'false');
    expect(
      within(banner()).getByRole('button', { name: /starta simulering/i })
    ).toBeInTheDocument();
    expect(within(banner()).queryByRole('status')).not.toBeInTheDocument();
  });

  it('Starta slår PÅ läget: status-markering syns + Avsluta/Återställ-knappar', async () => {
    renderBanner();
    await waitFor(() => expect(banner()).toBeInTheDocument());

    fireEvent.click(within(banner()).getByRole('button', { name: /starta simulering/i }));

    expect(banner()).toHaveAttribute('data-simulation-active', 'true');
    // Markeringen: ett uppläst statusmeddelande (role="status", aria-live).
    const status = within(banner()).getByRole('status');
    expect(status).toHaveTextContent(/simulering pågår/i);
    expect(status).toHaveTextContent(/riktiga resultaten påverkas inte/i);
    expect(
      within(banner()).getByRole('button', { name: /avsluta simulering/i })
    ).toBeInTheDocument();
    expect(within(banner()).getByRole('button', { name: /återställ allt/i })).toBeInTheDocument();
  });

  it('Avsluta slår AV läget igen (markeringen försvinner)', async () => {
    renderBanner();
    await waitFor(() => expect(banner()).toBeInTheDocument());

    fireEvent.click(within(banner()).getByRole('button', { name: /starta simulering/i }));
    expect(banner()).toHaveAttribute('data-simulation-active', 'true');

    fireEvent.click(within(banner()).getByRole('button', { name: /avsluta simulering/i }));
    expect(banner()).toHaveAttribute('data-simulation-active', 'false');
    expect(within(banner()).queryByRole('status')).not.toBeInTheDocument();
    expect(
      within(banner()).getByRole('button', { name: /starta simulering/i })
    ).toBeInTheDocument();
  });

  it('Återställ behåller sim-läget (markeringen står kvar)', async () => {
    renderBanner();
    await waitFor(() => expect(banner()).toBeInTheDocument());

    fireEvent.click(within(banner()).getByRole('button', { name: /starta simulering/i }));
    fireEvent.click(within(banner()).getByRole('button', { name: /återställ allt/i }));

    // Fortfarande i sim-läge (Återställ tömmer overlayn men lämnar inte sandlådan).
    expect(banner()).toHaveAttribute('data-simulation-active', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/simulering pågår/i);
  });
});
