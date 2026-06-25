import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GroupTeamOption } from './group-predictable-data';
import type { GroupResultEntry } from '../groups/derive-group-prediction-results';
import { GroupResultPanel } from './GroupResultPanel';

const teams: GroupTeamOption[] = [
  { code: 'MEX', name: 'Mexiko' },
  { code: 'KOR', name: 'Sydkorea' },
  { code: 'JPN', name: 'Japan' },
  { code: 'CZE', name: 'Tjeckien' },
];

// Tippade 1:a Mexiko (rätt), 2:a Sydkorea (fel). Facit: 1:a Mexiko, 2:a Japan -> 3p.
const result: GroupResultEntry = {
  groupId: 'A',
  points: 3,
  winnerCorrect: true,
  runnerUpCorrect: false,
  predictedWinnerCode: 'MEX',
  predictedRunnerUpCode: 'KOR',
  actualWinnerTeamId: 'mex',
  actualRunnerUpTeamId: 'jpn',
};

describe('GroupResultPanel', () => {
  it('visar gruppoängen, mina pick:ar med rätt/fel + delpoäng, och facit', () => {
    render(<GroupResultPanel result={result} teams={teams} />);
    // Poäng tydligt utskrivet.
    expect(screen.getByText(/3 poäng/)).toBeInTheDocument();
    // Mina pick:ar (1:a Mexiko rätt, 2:a Sydkorea fel).
    expect(screen.getByText('Mexiko')).toBeInTheDocument();
    expect(screen.getByText('Sydkorea')).toBeInTheDocument();
    // Färg-oberoende status: sr-only "rätt"/"fel".
    expect(screen.getByText('rätt')).toBeInTheDocument();
    expect(screen.getByText('fel')).toBeInTheDocument();
    // Delpoäng: vinnaren gav +3, tvåan 0.
    expect(screen.getByText('+3')).toBeInTheDocument();
    // Facit-raden ("Så blev det"): faktisk 2:a Japan, via id-uppslag (gemen jpn -> Japan).
    expect(screen.getByText(/Så blev det/)).toBeInTheDocument();
    expect(screen.getByText(/Japan/)).toBeInTheDocument();
  });

  it('båda rätt: 5 poäng, två rätt-markeringar, inga fel', () => {
    render(
      <GroupResultPanel
        result={{
          ...result,
          points: 5,
          winnerCorrect: true,
          runnerUpCorrect: true,
          predictedRunnerUpCode: 'JPN',
        }}
        teams={teams}
      />
    );
    expect(screen.getByText(/5 poäng/)).toBeInTheDocument();
    expect(screen.getAllByText('rätt')).toHaveLength(2);
    expect(screen.queryByText('fel')).not.toBeInTheDocument();
  });
});
