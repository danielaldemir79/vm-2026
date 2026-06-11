import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultEntryGate } from './ResultEntryGate';
import { shouldShowResultEntry } from './result-entry-gate-rule';
import { ResultsStoreContext, type ResultsStore } from './results-context';
import type { DataSourceMode } from '../../data';

// ============================================================================
// T48 (#81): grinden för resultatinmatnings-vyn. Det STARKA invariantet, en
// vanlig vän ska ALDRIG se den lokala/officiella inmatningen i live-läge, men
// får simulera. Efter F2 (Daniels feedback) gäller detta ÄVEN admin: i live
// matas officiella resultat in via AdminResultEntry, så den lokala vyn visas i
// live BARA i "tänk om"-läge, för alla. Vi testar BÅDE den rena regeln
// (uttömmande) OCH komponenten (visar/döljer faktiskt vyn).
// ============================================================================

describe('shouldShowResultEntry (ren regel, uttömmande)', () => {
  // FIXTURES-läge (live=false): visa ALLTID (lokal utveckling/test oförändrad).
  it('fixtures + ej sim: visar (lokal inmatning driver tabellerna)', () => {
    expect(shouldShowResultEntry(false, false)).toBe(true);
  });
  it('fixtures + sim: visar', () => {
    expect(shouldShowResultEntry(false, true)).toBe(true);
  });

  // LIVE-läge: visa BARA i sim-läget ("tänk om"), aldrig som delad/officiell inmatning.
  it('live + ej sim: DÖLJER (ingen ser en lokal/officiell inmatning, ej heller admin)', () => {
    expect(shouldShowResultEntry(true, false)).toBe(false);
  });
  it('live + sim PÅ: visar (lokal "tänk om"-lek, skriver bara till sim-overlayn)', () => {
    expect(shouldShowResultEntry(true, true)).toBe(true);
  });
});

// --- Komponent: bevisar att grinden faktiskt visar/döljer ResultEntryView. ---

function resultsStore(mode: DataSourceMode, simulating: boolean): ResultsStore {
  return {
    status: 'ready',
    matches: [],
    teams: [],
    groups: [],
    mode,
    error: null,
    setMatches: () => {},
    submitResult: () => ({ ok: true }),
    simulating,
    enterSimulation: () => {},
    exitSimulation: () => {},
    resetSimulation: () => {},
  };
}

function renderGate(mode: DataSourceMode, simulating: boolean) {
  return render(
    <ResultsStoreContext.Provider value={resultsStore(mode, simulating)}>
      <ResultEntryGate surface={(c) => <div data-testid="surface">{c}</div>} />
    </ResultsStoreContext.Provider>
  );
}

/** ResultEntryView:s rubrik = "Mata in resultat" (region-landmärket). */
async function expectEntryVisible() {
  await waitFor(() =>
    expect(screen.getByRole('region', { name: /Mata in resultat/i })).toBeInTheDocument()
  );
}

describe('ResultEntryGate (komponent)', () => {
  it('live + ej sim: renderar VARKEN vyn ELLER ytan (ingen tom ruta)', () => {
    renderGate('live', false);
    expect(screen.queryByRole('region', { name: /Mata in resultat/i })).toBeNull();
    expect(screen.queryByTestId('surface')).toBeNull();
  });

  it('live + sim PÅ: renderar vyn (tänk om-leken, i ytan)', async () => {
    renderGate('live', true);
    await expectEntryVisible();
    expect(screen.getByTestId('surface')).toBeInTheDocument();
  });

  it('fixtures + ej sim: renderar vyn (oförändrat lokalt läge)', async () => {
    renderGate('fixtures', false);
    await expectEntryVisible();
  });
});
