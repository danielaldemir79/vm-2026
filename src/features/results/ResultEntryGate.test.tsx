import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultEntryGate } from './ResultEntryGate';
import { shouldShowResultEntry } from './result-entry-gate-rule';
import { ResultsStoreContext, type ResultsStore } from './results-context';
import {
  OfficialResultsStoreContext,
  type OfficialResultsStore,
} from '../official-results/official-results-context';
import type { DataSourceMode } from '../../data';

// ============================================================================
// T48 (#81): grinden för resultatinmatnings-vyn. Det STARKA invariantet, en
// vanlig vän ska ALDRIG se den delade/officiella inmatningen i live-läge, men
// får simulera. Vi testar BÅDE den rena regeln (uttömmande över alla 6 fall) OCH
// komponenten (visar/döljer faktiskt vyn).
// ============================================================================

describe('shouldShowResultEntry (ren regel, uttömmande)', () => {
  // FIXTURES-läge: visa ALLTID, oavsett admin/sim (lokal utveckling oförändrad).
  it('fixtures: visar alltid (icke-admin, ej sim)', () => {
    expect(shouldShowResultEntry(false, false, false)).toBe(true);
  });
  it('fixtures: visar alltid (admin)', () => {
    expect(shouldShowResultEntry(false, true, false)).toBe(true);
  });
  it('fixtures: visar alltid (admin-status okänd)', () => {
    expect(shouldShowResultEntry(false, null, false)).toBe(true);
  });

  // LIVE-läge: admin visar, icke-admin bara i sim.
  it('live + admin: visar (arrangören får mata in)', () => {
    expect(shouldShowResultEntry(true, true, false)).toBe(true);
  });
  it('live + icke-admin + ej sim: DÖLJER (vanlig vän ser ingen delad inmatning)', () => {
    expect(shouldShowResultEntry(true, false, false)).toBe(false);
  });
  it('live + icke-admin + sim PÅ: visar (lokal "tänk om"-lek)', () => {
    expect(shouldShowResultEntry(true, false, true)).toBe(true);
  });
  it('live + admin-status okänd + ej sim: DÖLJER (fail-safe under laddning)', () => {
    expect(shouldShowResultEntry(true, null, false)).toBe(false);
  });
  it('live + admin-status okänd + sim PÅ: visar (sim är öppet för alla)', () => {
    expect(shouldShowResultEntry(true, null, true)).toBe(true);
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

function officialStore(isAdmin: boolean | null): OfficialResultsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    results: [],
    isAdmin,
    client: null,
    saveOfficialResult: async () => {},
    refresh: async () => {},
  };
}

function renderGate(mode: DataSourceMode, isAdmin: boolean | null, simulating: boolean) {
  return render(
    <ResultsStoreContext.Provider value={resultsStore(mode, simulating)}>
      <OfficialResultsStoreContext.Provider value={officialStore(isAdmin)}>
        <ResultEntryGate surface={(c) => <div data-testid="surface">{c}</div>} />
      </OfficialResultsStoreContext.Provider>
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
  it('live + icke-admin + ej sim: renderar VARKEN vyn NÄR ytan (ingen tom ruta)', () => {
    renderGate('live', false, false);
    expect(screen.queryByRole('region', { name: /Mata in resultat/i })).toBeNull();
    expect(screen.queryByTestId('surface')).toBeNull();
  });

  it('live + admin: renderar vyn (i ytan)', async () => {
    renderGate('live', true, false);
    await expectEntryVisible();
    expect(screen.getByTestId('surface')).toBeInTheDocument();
  });

  it('live + icke-admin + sim PÅ: renderar vyn (tänk om-leken)', async () => {
    renderGate('live', false, true);
    await expectEntryVisible();
  });

  it('fixtures + icke-admin: renderar vyn (oförändrat lokalt läge)', async () => {
    renderGate('fixtures', false, false);
    await expectEntryVisible();
  });
});
