import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Match, Team } from '../../domain/types';
import { MatchCard } from './MatchCard';

function team(id: string, name: string): Team {
  return { id, name, code: id.toUpperCase(), group: 'A' };
}

const teamsById = new Map<string, Team>([
  ['mex', team('mex', 'Mexiko')],
  ['rsa', team('rsa', 'Sydafrika')],
]);

function groupMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'g-A-1',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff: '2026-06-11T19:00:00.000Z',
    venue: 'Arena ej verifierad (egen data-punkt)',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
    ...overrides,
  } as Match;
}

describe('MatchCard, tillgänglig struktur + innehåll', () => {
  it('renderar tid (svensk), lag, steg och TV-kanal med ett tillgängligt namn', () => {
    render(<MatchCard match={groupMatch()} teamsById={teamsById} />);

    // <article> med ett sammanfattande tillgängligt namn (tid, lag, steg, kanal).
    const card = screen.getByRole('article');
    expect(card).toHaveAccessibleName(/21:00.*Mexiko mot Sydafrika.*Grupp A.*TV4/);

    expect(within(card).getByText('Mexiko')).toBeInTheDocument();
    expect(within(card).getByText('Sydafrika')).toBeInTheDocument();
    expect(within(card).getByText('TV4')).toBeInTheDocument();
  });

  it('tiden bär ett <time>-element med maskinläsbar UTC-instant', () => {
    const { container } = render(<MatchCard match={groupMatch()} teamsById={teamsById} />);
    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute('dateTime', '2026-06-11T19:00:00.000Z');
    expect(time).toHaveTextContent('21:00'); // svensk tid, inte 19:00 (UTC)
  });

  it('DÖLJER arena-platshållaren (#35), visar inte "ej verifierad" som om det vore data', () => {
    render(<MatchCard match={groupMatch()} teamsById={teamsById} />);
    expect(screen.queryByText(/ej verifierad/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Arena')).not.toBeInTheDocument();
  });

  it('VISAR arena när den är riktig (verifierad data)', () => {
    render(
      <MatchCard
        match={groupMatch({ venue: 'MetLife Stadium, East Rutherford' })}
        teamsById={teamsById}
      />
    );
    expect(screen.getByText('MetLife Stadium, East Rutherford')).toBeInTheDocument();
  });

  it('markerar "Dagens match" via textetikett + data-highlight (färg-oberoende, T7-pin)', () => {
    render(<MatchCard match={groupMatch()} teamsById={teamsById} highlight />);
    expect(screen.getByText('Dagens match')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-highlight', '');
  });

  it('slutspelsmatch utan kända lag visar platshållare, inte ett gissat lag', () => {
    const ko = groupMatch({
      id: 'M73',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
    });
    render(<MatchCard match={ko} teamsById={teamsById} />);
    const card = screen.getByRole('article');
    expect(within(card).getAllByText('Ej klart')).toHaveLength(2);
    expect(within(card).getByText('Sextondelsfinal')).toBeInTheDocument();
  });
});
