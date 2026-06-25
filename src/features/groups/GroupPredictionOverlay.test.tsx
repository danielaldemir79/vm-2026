import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Team } from '../../domain/types';
import { GroupPointsBadge, GroupPickSummary } from './GroupPredictionOverlay';
import type { GroupResultEntry } from './derive-group-prediction-results';

const teamsById = new Map<string, Team>([
  ['bra', { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'C' }],
  ['kam', { id: 'kam', name: 'Kamerun', code: 'KAM', group: 'C' }],
]);

// Du tippade 1:a Brasilien (rätt) + 2:a Kamerun (fel, kom 3:a) = 3p.
const result: GroupResultEntry = {
  groupId: 'C',
  points: 3,
  winnerCorrect: true,
  runnerUpCorrect: false,
  predictedWinnerCode: 'BRA',
  predictedRunnerUpCode: 'KAM',
};

describe('GroupPointsBadge', () => {
  it('visar gruppoängen', () => {
    const { container } = render(<GroupPointsBadge points={3} />);
    expect(container.textContent).toMatch(/Dina gruppoäng:\s*3p/);
  });
});

describe('GroupPickSummary', () => {
  it('stavar ut båda tippen med rätt/fel-status + per-position-poäng', () => {
    render(<GroupPickSummary result={result} teamsById={teamsById} />);
    expect(screen.getByText('Brasilien')).toBeInTheDocument();
    expect(screen.getByText('Kamerun')).toBeInTheDocument();
    // rätt vinnare -> +3p, sr-only "rätt"; fel tvåa -> 0p, sr-only "fel"
    expect(screen.getByText('+3p')).toBeInTheDocument();
    expect(screen.getByText('rätt')).toBeInTheDocument();
    expect(screen.getByText('fel')).toBeInTheDocument();
  });

  it('faller tillbaka på code om laget saknas i uppslaget (fail-safe)', () => {
    render(
      <GroupPickSummary result={{ ...result, predictedWinnerCode: 'XYZ' }} teamsById={teamsById} />
    );
    expect(screen.getByText('XYZ')).toBeInTheDocument();
  });
});
