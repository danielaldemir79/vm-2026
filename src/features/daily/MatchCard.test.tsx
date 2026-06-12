import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { Match, Team } from '../../domain/types';
import { MatchCard } from './MatchCard';
// Lagnamnen i kortet är klickbara (TeamNameButton -> useTeamProfile, T10), så
// renderingen sker i en minimal profil-context-stub (utan den fulla modalen).
import { TeamProfileStub } from '../../test/team-profile-stub';

/** Rendera MatchCard i profil-context-stuben (klickbara lagnamn kräver den). */
function renderCard(ui: ReactElement) {
  return render(<TeamProfileStub>{ui}</TeamProfileStub>);
}

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
    renderCard(<MatchCard match={groupMatch()} teamsById={teamsById} />);

    // <article> med ett sammanfattande tillgängligt namn (tid, lag, steg, kanal).
    const card = screen.getByRole('article');
    expect(card).toHaveAccessibleName(/21:00.*Mexiko mot Sydafrika.*Grupp A.*TV4/);

    expect(within(card).getByText('Mexiko')).toBeInTheDocument();
    expect(within(card).getByText('Sydafrika')).toBeInTheDocument();
    expect(within(card).getByText('TV4')).toBeInTheDocument();
  });

  it('tiden bär ett <time>-element med maskinläsbar UTC-instant', () => {
    const { container } = renderCard(<MatchCard match={groupMatch()} teamsById={teamsById} />);
    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute('dateTime', '2026-06-11T19:00:00.000Z');
    expect(time).toHaveTextContent('21:00'); // svensk tid, inte 19:00 (UTC)
  });

  it('DÖLJER arena-platshållaren (#35), visar inte "ej verifierad" som om det vore data', () => {
    renderCard(<MatchCard match={groupMatch()} teamsById={teamsById} />);
    expect(screen.queryByText(/ej verifierad/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Arena')).not.toBeInTheDocument();
  });

  it('VISAR arena när den är riktig (verifierad data)', () => {
    renderCard(
      <MatchCard
        match={groupMatch({ venue: 'MetLife Stadium, East Rutherford' })}
        teamsById={teamsById}
      />
    );
    expect(screen.getByText('MetLife Stadium, East Rutherford')).toBeInTheDocument();
  });

  it('markerar "Dagens match" via textetikett + data-highlight (färg-oberoende, T7-pin)', () => {
    // Default highlightLabel = "Dagens match" (bakåtkompatibelt, #54 C3).
    renderCard(<MatchCard match={groupMatch()} teamsById={teamsById} highlight />);
    expect(screen.getByText('Dagens match')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-highlight', '');
  });

  it('chippet visar den DYNAMISKA highlightLabel (matchens datum) när matchen inte är idag (#54 C3)', () => {
    // När hero-etiketten är matchens dag (inte idag) ska chippet säga SAMMA sak,
    // annars var UI:t inkonsekvent (datum ovanför men "Dagens match" i chippet).
    renderCard(
      <MatchCard
        match={groupMatch()}
        teamsById={teamsById}
        highlight
        highlightLabel="Torsdag 11 juni"
      />
    );
    expect(screen.getByText('Torsdag 11 juni')).toBeInTheDocument();
    // Och INTE den gamla hårdkodade texten, så chip + etikett aldrig krockar.
    expect(screen.queryByText('Dagens match')).not.toBeInTheDocument();
  });

  it('utan highlight visas inget highlight-chip (varken default- eller datum-text)', () => {
    renderCard(
      <MatchCard match={groupMatch()} teamsById={teamsById} highlightLabel="Torsdag 11 juni" />
    );
    expect(screen.queryByText('Dagens match')).not.toBeInTheDocument();
    expect(screen.queryByText('Torsdag 11 juni')).not.toBeInTheDocument();
  });

  it('visar RESULTATET för en färdigspelad match (T57): siffrorna + a11y-namnet (gruppspel)', () => {
    const finished = groupMatch({
      status: 'finished',
      result: { homeGoals: 2, awayGoals: 1 },
    });
    const { container } = renderCard(<MatchCard match={finished} teamsById={teamsById} />);

    // Resultatet syns i kortet (data-match-score är den stabila styling-/test-haken).
    const score = container.querySelector('[data-match-score]');
    expect(score).not.toBeNull();
    expect(score).toHaveTextContent('2-1');

    // A11y-namnet bär resultatet i mitten ("Mexiko 2-1 Sydafrika"), inte "mot".
    const card = screen.getByRole('article');
    expect(card).toHaveAccessibleName(/Mexiko 2-1 Sydafrika/);
    expect(card.getAttribute('aria-label')).not.toContain('Mexiko mot Sydafrika');
  });

  it('en OSPELAD match visar "mot" och INGET resultat (data-match-score saknas)', () => {
    const { container } = renderCard(<MatchCard match={groupMatch()} teamsById={teamsById} />);
    expect(container.querySelector('[data-match-score]')).toBeNull();
    expect(screen.getByRole('article')).toHaveAccessibleName(/Mexiko mot Sydafrika/);
  });

  it('visar STRAFFAR separat för ett slutspel avgjort på straffar (inte tvetydigt, T57)', () => {
    const ko = groupMatch({
      id: 'M104',
      stage: 'final',
      groupId: null,
      status: 'finished',
      result: { homeGoals: 2, awayGoals: 2, penalties: { homeGoals: 4, awayGoals: 3 } },
    });
    renderCard(<MatchCard match={ko} teamsById={teamsById} />);

    // Ordinarie-resultatet och straffarna står SEPARAT.
    expect(screen.getByText('2-2')).toBeInTheDocument();
    expect(screen.getByText('(4-3 på straffar)')).toBeInTheDocument();
    // A11y-namnet rymmer bägge så en skärmläsare hör hela slutresultatet.
    expect(screen.getByRole('article')).toHaveAccessibleName(/2-2 .*\(4-3 på straffar\)/);
  });

  it('slutspelsmatch utan kända lag visar platshållare, inte ett gissat lag', () => {
    const ko = groupMatch({
      id: 'M73',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
    });
    renderCard(<MatchCard match={ko} teamsById={teamsById} />);
    const card = screen.getByRole('article');
    expect(within(card).getAllByText('Ej klart')).toHaveLength(2);
    expect(within(card).getByText('Sextondelsfinal')).toBeInTheDocument();
  });
});
