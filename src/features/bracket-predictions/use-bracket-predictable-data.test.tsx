import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBracketPredictableData } from './use-bracket-predictable-data';
import { ResultsStoreContext, type ResultsStore } from '../results/results-context';
import type { Match } from '../../domain/types';

// REGRESSION (buggfix 2026-06-28): slutspels-tipsen läste FÖRR den råa matchplanen via
// getDataSource (utan invävt facit), så när gruppspelet var avgjort seedades tips-trädet
// aldrig och slot-tipsen förblev stängda trots komplett facit. Fixen: hooken läser i
// första hand den delade results-storen (samma invävda facit som Turnering-trädet). Det
// här testet vaktar att storen FAKTISKT är källan när en ResultsProvider finns.

function Probe() {
  const { status, matches } = useBracketPredictableData();
  return <div data-testid="probe">{`${status}:${matches.map((m) => m.id).join(',')}`}</div>;
}

describe('useBracketPredictableData , datakälla', () => {
  it('föredrar results-storens matcher (invävt facit) när en ResultsProvider finns', () => {
    // En sentinel-match som BARA finns i storen, aldrig i getDataSource:s plan. Syns den i
    // hookens output bevisar det att storen är källan (inte den råa matchplanen).
    const sentinel = {
      id: 'SENTINEL-STORE-MATCH',
      stage: 'group',
      groupId: 'A',
      homeTeamId: null,
      awayTeamId: null,
      kickoff: '2026-06-11T19:00:00Z',
      status: 'scheduled',
    } as Match;
    const fakeStore = {
      status: 'ready',
      matches: [sentinel],
      teams: [],
      groups: [],
      error: null,
    } as unknown as ResultsStore;

    render(
      <ResultsStoreContext.Provider value={fakeStore}>
        <Probe />
      </ResultsStoreContext.Provider>
    );

    const text = screen.getByTestId('probe').textContent ?? '';
    expect(text).toContain('ready');
    expect(text).toContain('SENTINEL-STORE-MATCH');
  });
});
