import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import { ScenarioView } from './ScenarioView';
import { ResultsProvider } from '../results/ResultsProvider';
import { useResultsStore } from '../results/results-context';
import { createFailingDataSource } from '../../test/failing-data-source';

// ============================================================================
// "Vad krävs"-vyn (T11): LIVE-scenarier härledda ur den delade storen. Den rena
// motorn (scenario-engine.test.ts) är uttömmande testad; här bevisar vi att VYN
// kopplats rätt: renderar fixtures-läget utan att krascha (regression: en helt
// ospelad grupp = 6 kvar -> "too-early", inte ett kast), bär a11y-struktur +
// data-seamen, och RÄKNAR OM när matchlistan ändras (live).
// ============================================================================

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

/**
 * Liten test-sond: exponerar storens setMatches uppåt, så ett test kan ersätta
 * hela matchlistan med ett KONTROLLERAT scenario (en grupp nära avgjord) och
 * bevisa att vyn räknar om "live". Samma seam som T18:s realtid använder.
 */
function StoreProbe({ onReady }: { onReady: (setMatches: (m: Match[]) => void) => void }) {
  const { status, setMatches } = useResultsStore();
  if (status === 'ready') {
    onReady(setMatches);
  }
  return null;
}

describe('ScenarioView, rendering + a11y', () => {
  it('renderar i ett etiketterat section-landmark (a11y)', async () => {
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ScenarioView />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Vad krävs/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /Vad krävs/i })).toBeInTheDocument();
  });

  it('visar demo-data-märket i fixtures-läget', async () => {
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ScenarioView />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Demo-data/i)).toBeInTheDocument();
    });
  });

  it('renderar fixtures-läget (alla grupper ospelade) UTAN att krascha (too-early)', async () => {
    // Regression: en helt ospelad grupp har 6 återstående matcher; motorn skulle
    // kasta om vyn enumererade. Vyn ska i stället visa "3 omgångar kvar" (6 matcher
    // = 3 omgångar) och inte falla med ett fel (fail-loud-vakten gatas i too-early).
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ScenarioView />
      </ResultsProvider>
    );
    await waitFor(() => {
      // 12 grupp-kort renderas (en per grupp).
      expect(screen.getAllByText(/3 omgångar kvar/i).length).toBe(12);
    });
    // Inga fel-alerts (det är ett legitimt produkt-läge, inte ett fel).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ScenarioView, komprimering (T68/#129)', () => {
  it('komprimerad som default, rubrik synlig, expandera -> komprimera tillbaka', async () => {
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ScenarioView />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(screen.getAllByText(/3 omgångar kvar/i).length).toBe(12);
    });
    // Rubriken alltid synlig; kroppen komprimerad som default.
    expect(screen.getByRole('heading', { level: 2, name: /Vad krävs/i })).toBeInTheDocument();
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'true');
    // Expandera (namnrymd 'scenarios') -> komprimera tillbaka.
    fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
    expect(body).toHaveAttribute('data-collapsed', 'false');
    const [topCollapse] = screen.getAllByRole('button', { name: /Visa färre grupper/i });
    fireEvent.click(topCollapse);
    expect(body).toHaveAttribute('data-collapsed', 'true');
  });
});

describe('ScenarioView, fel-väg (fail loud)', () => {
  it('visar ett fel-meddelande när datakällan rejectar (genuint datakälle-fel)', async () => {
    render(
      <ResultsProvider env={fixturesEnv()} dataSource={createFailingDataSource()}>
        <ScenarioView />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Kunde inte ladda scenarierna/i);
  });
});

describe('ScenarioView, LIVE: en ändrad matchlista räknar om scenarierna', () => {
  it('när en grupp blir nära avgjord visar vyn Klar/Ute/Beror på-chips', async () => {
    let setMatches!: (m: Match[]) => void;
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ScenarioView />
        <StoreProbe onReady={(fn) => (setMatches = fn)} />
      </ResultsProvider>
    );

    // Vänta in seedningen (vyn visar fixtures-läget först).
    await waitFor(() => {
      expect(screen.getAllByText(/3 omgångar kvar/i).length).toBe(12);
    });

    // Ersätt matchlistan med ETT kontrollerat scenario för grupp A (de RIKTIGA
    // fixtures-lag-id:na mex/rsa/kor/cze): två omgångar spelade, sista omgången
    // kvar. mex leder klart (6 p, klar oavsett), övriga slåss vidare. Andra
    // grupper får inga matcher (blir "too-early", oviktigt för detta test).
    const controlled: Match[] = [
      fin('A-m1', 'A', 'mex', 'rsa', 1, 0),
      fin('A-m2', 'A', 'kor', 'cze', 1, 0),
      fin('A-m3', 'A', 'mex', 'kor', 1, 0), // mex: 6 p
      fin('A-m4', 'A', 'rsa', 'cze', 1, 0), // rsa: 3, kor: 3, cze: 0
      sched('A-m5', 'A', 'mex', 'cze'),
      sched('A-m6', 'A', 'rsa', 'kor'),
    ];
    act(() => {
      setMatches(controlled);
    });

    // Grupp A-kortet visar nu "2 matcher kvar" och statusar har klassats.
    await waitFor(() => {
      const card = document.querySelector('[data-scenario-group="A"]') as HTMLElement | null;
      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText(/Sista omgången/i)).toBeInTheDocument();
    });

    const card = document.querySelector('[data-scenario-group="A"]') as HTMLElement;
    // mex (6 p) är klar -> dess rad bär status "qualified".
    const mexRow = card.querySelector('[data-scenario-team="mex"]') as HTMLElement | null;
    expect(mexRow).not.toBeNull();
    expect(mexRow).toHaveAttribute('data-scenario-status', 'qualified');
    // Minst en "Klar"-chip syns i kortet (mex), bevis på live-klassningen.
    expect(within(card).getAllByText(/Klar/i).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Test-hjälpare (kompakta match-byggare).
 * ------------------------------------------------------------------ */

function fin(id: string, groupId: 'A', home: string, away: string, hg: number, ag: number): Match {
  return {
    id,
    stage: 'group',
    groupId,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-20T19:00:00Z',
    venue: 'Testarena',
    result: { homeGoals: hg, awayGoals: ag },
    status: 'finished',
  };
}

function sched(id: string, groupId: 'A', home: string, away: string): Match {
  return {
    id,
    stage: 'group',
    groupId,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-26T19:00:00Z',
    venue: 'Testarena',
    result: null,
    status: 'scheduled',
  };
}
