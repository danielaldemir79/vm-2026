// Wiring-test: bevisar att GroupStageView faktiskt trär igenom ett grupp-tips-resultat
// till kortet (poäng-pill + grön bock + "Du tippade"-rad). Hooken mockas i EN egen fil
// (vi.mock är fil-scopad) så den inte läcker till de andra GroupStageView-testerna.

import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mocka hooken: ett resultat för grupp A (rätt gruppvinnare, fel tvåa = 3p).
vi.mock('./use-group-prediction-results', () => ({
  useGroupPredictionResults: () =>
    new Map([
      [
        'A',
        {
          groupId: 'A',
          points: 3,
          winnerCorrect: true,
          runnerUpCorrect: false,
          predictedWinnerCode: 'MEX',
          predictedRunnerUpCode: 'RSA',
        },
      ],
    ]),
}));

import { GroupStageView } from './GroupStageView';
import { ResultsProvider } from '../results/ResultsProvider';
import { useResultsStore, type ResultsStore } from '../results/results-context';
import { TeamProfileProvider } from '../team-profile';

/** Fångar results-storen så testet kan slå på what-if-läget EFTER att datan laddats
 *  (en seedning nollställer simulating, så vi får inte trigga det vid montering). */
let capturedStore: ResultsStore | null = null;
function CaptureStore() {
  capturedStore = useResultsStore();
  return null;
}

describe('GroupStageView, grupp-tips-overlay (wiring genom GroupCard)', () => {
  it('renderar poäng-pill + Du tippade-rad + grön bock för grupp A när ett resultat finns', async () => {
    render(
      <ResultsProvider env={{} as ImportMetaEnv}>
        <TeamProfileProvider>
          <GroupStageView />
        </TeamProfileProvider>
      </ResultsProvider>
    );
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0));

    // Poäng-pill (headern) + "Du tippade"-rad (under tabellen) = overlay trädd igenom.
    expect(screen.getAllByText(/Dina gruppoäng:/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Du tippade:/)).toBeInTheDocument();
    // Grön bock för rätt tippad gruppvinnare (sr-only-texten finns i DOM).
    expect(screen.getByText('Rätt tippad gruppvinnare')).toBeInTheDocument();
    // Fel tippad tvåa -> ingen bock för grupptvåan.
    expect(screen.queryByText('Rätt tippad grupptvåa')).not.toBeInTheDocument();
  });

  it('döljer overlayen i what-if-läge (simulerade placeringar är hypotetiska)', async () => {
    capturedStore = null;
    render(
      <ResultsProvider env={{} as ImportMetaEnv}>
        <TeamProfileProvider>
          <CaptureStore />
          <GroupStageView />
        </TeamProfileProvider>
      </ResultsProvider>
    );
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0));
    // Sanity: overlayen VISAS i normalt läge (annars bevisar testet inget).
    expect(screen.getByText(/Du tippade:/)).toBeInTheDocument();

    // Gå in i what-if-läge EFTER load (seedningen nollställer annars simulating).
    await act(async () => {
      capturedStore?.enterSimulation();
    });

    // Nu ska overlayen vara borta, fast hooken (mockad) fortfarande ger ett resultat.
    expect(screen.queryByText(/Du tippade:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dina gruppoäng:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Rätt tippad gruppvinnare')).not.toBeInTheDocument();
  });
});
