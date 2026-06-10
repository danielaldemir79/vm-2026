import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsProvider } from '../results/ResultsProvider';
import { SimulationBanner } from './SimulationBanner';
import { SimulationFrame } from './SimulationFrame';

// Den app-globala sim-ramens UI (T12, visuellt lager): markeringen ska bara
// finnas när sim-läget är PÅ, vara FÄRG-OBEROENDE (badge:n bär TEXT, inte bara
// en ton) och spegla storens läge till data-attributet som CSS hänger
// ringen/tinten på. Funktionellt testat mot den riktiga storen (banner-knappen
// slår på/av läget), så ramen och kontrollen är i synk.
//
// EN live region (C4): badge:n är VISUELL förstärkning och aria-hidden, så bara
// EN role="status" finns (bannerns announcement). Annars dubbel uppläsning.

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function renderFramedApp() {
  return render(
    <ResultsProvider env={fixturesEnv()}>
      <SimulationFrame>
        <SimulationBanner />
        <p>Simulerad vy</p>
      </SimulationFrame>
    </ResultsProvider>
  );
}

/** Ram-elementet (stabil hake för ringen/tinten i CSS). */
function frame(): HTMLElement {
  return document.querySelector('[data-simulation-frame]') as HTMLElement;
}

describe('SimulationFrame, app-global markering', () => {
  it('börjar AV: ingen markeringsbadge, data-attributet är false', async () => {
    renderFramedApp();
    await waitFor(() => expect(frame()).toBeInTheDocument());

    expect(frame()).toHaveAttribute('data-simulation-active', 'false');
    // Ingen "Simuleringsläge"-badge i vilo-läge (bara banner-texten finns).
    expect(screen.queryByText(/^simuleringsläge$/i)).not.toBeInTheDocument();
  });

  it('PÅ: visar en FÄRG-OBEROENDE text-badge och flippar data-attributet', async () => {
    renderFramedApp();
    await waitFor(() => expect(frame()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /starta simulering/i }));

    expect(frame()).toHaveAttribute('data-simulation-active', 'true');

    // Markeringen bärs av TEXT (inte bara en ton): badge:n syns visuellt.
    expect(screen.getByText(/^simuleringsläge$/i)).toBeInTheDocument();
  });

  it('PÅ: bara EN live region (bannern), badge:n är aria-hidden (C4, ingen dubbel uppläsning)', async () => {
    renderFramedApp();
    await waitFor(() => expect(frame()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /starta simulering/i }));

    // Exakt ett role="status" i hela trädet: bannerns announcement. Badge:n är
    // aria-hidden => ingen egen live-roll, så skärmläsaren läser inte dubbelt.
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(/simulering pågår/i);
    expect(statuses.some((el) => /simuleringsläge/i.test(el.textContent ?? ''))).toBe(false);

    // Badge:n finns visuellt men ligger inuti ett aria-hidden-lager.
    const badge = screen.getByText(/^simuleringsläge$/i);
    expect(badge.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('AV igen: markeringen försvinner när läget stängs', async () => {
    renderFramedApp();
    await waitFor(() => expect(frame()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /starta simulering/i }));
    expect(screen.getByText(/^simuleringsläge$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /avsluta simulering/i }));
    expect(frame()).toHaveAttribute('data-simulation-active', 'false');
    expect(screen.queryByText(/^simuleringsläge$/i)).not.toBeInTheDocument();
  });

  it('renderar barnen oförändrat (ramen är en tunn wrapper, inte en gate)', async () => {
    renderFramedApp();
    await waitFor(() => expect(frame()).toBeInTheDocument());

    // Barnet syns både i vilo- och sim-läge.
    expect(within(frame()).getByText('Simulerad vy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /starta simulering/i }));
    expect(within(frame()).getByText('Simulerad vy')).toBeInTheDocument();
  });
});
