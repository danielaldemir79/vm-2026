import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsProvider } from '../results/ResultsProvider';
import { SimulationBanner } from './SimulationBanner';
import { SimulationFrame } from './SimulationFrame';

// Den app-globala sim-ramens UI (T12, visuellt lager): markeringen ska bara
// finnas när sim-läget är PÅ, vara FÄRG-OBEROENDE (text + role="status", inte
// bara en ton) och spegla storens läge till data-attributet som CSS hänger
// ringen/tinten på. Funktionellt testat mot den riktiga storen (banner-knappen
// slår på/av läget), så ramen och kontrollen är i synk.

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

  it('PÅ: visar en FÄRG-OBEROENDE markering (text + role=status) och flippar data-attributet', async () => {
    renderFramedApp();
    await waitFor(() => expect(frame()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /starta simulering/i }));

    expect(frame()).toHaveAttribute('data-simulation-active', 'true');

    // Markeringen bärs av TEXT (inte bara en ton), uppläst via role="status".
    const statuses = screen.getAllByRole('status');
    expect(statuses.some((el) => /simuleringsläge/i.test(el.textContent ?? ''))).toBe(true);
    expect(screen.getByText(/^simuleringsläge$/i)).toBeInTheDocument();
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
