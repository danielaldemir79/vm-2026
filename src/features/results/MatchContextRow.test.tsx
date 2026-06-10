import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import { MatchContextRow } from './MatchContextRow';

function groupMatch(): Match {
  return {
    id: 'g-A-1',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    // 2026-06-11 19:00Z = 21:00 svensk tid (sommartid, +2).
    kickoff: '2026-06-11T19:00:00.000Z',
    venue: 'Arena ej verifierad',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

function knockoutMatch(): Match {
  return {
    id: 'M89',
    stage: 'quarter-final',
    groupId: null, // slutspel har ingen grupp
    homeTeamId: null,
    awayTeamId: null,
    kickoff: '2026-07-10T19:00:00.000Z',
    venue: 'Arena ej verifierad',
    result: null,
    status: 'scheduled',
  };
}

describe('MatchContextRow, kontext per kort (tid + grupp/runda)', () => {
  it('visar avsparkstid i SVENSK tid och grupp-etikett för en gruppspelsmatch', () => {
    const { container } = render(<MatchContextRow match={groupMatch()} />);
    // 19:00Z -> 21:00 svensk tid.
    const time = container.querySelector('[data-result-time]');
    expect(time).toHaveTextContent('21:00');
    // <time> bär den maskinläsbara UTC-instanten (a11y/SEO).
    expect(time).toHaveAttribute('datetime', '2026-06-11T19:00:00.000Z');
    // Gruppspel -> "Grupp A", inte ett rundnamn.
    expect(container.querySelector('[data-result-stage]')).toHaveTextContent('Grupp A');
  });

  it('visar RUNDNAMN (inte grupp) för en slutspelsmatch', () => {
    const { container } = render(<MatchContextRow match={knockoutMatch()} />);
    // Slutspel: rundnamnet, aldrig "Grupp ...". groupId är null så stageLabel
    // faller på STAGE_LABELS (källtestat i match-display.test.ts).
    const stage = container.querySelector('[data-result-stage]');
    expect(stage).toHaveTextContent('Kvartsfinal');
    expect(stage).not.toHaveTextContent(/Grupp/);
  });

  it('avdelar-pricken är aria-hidden (läses inte som en uppläst punkt)', () => {
    render(<MatchContextRow match={groupMatch()} />);
    // Raden läses som "21:00 Grupp A", inte "21:00 punkt Grupp A".
    const dot = screen.getByText('·', { selector: '[aria-hidden="true"]' });
    expect(dot).toBeInTheDocument();
  });
});
