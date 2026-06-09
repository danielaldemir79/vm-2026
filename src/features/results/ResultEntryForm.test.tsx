import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultEntryForm } from './ResultEntryForm';
import { validateResultEntry, type ResultEntry } from './validate-result';
import type { Match, Team } from '../../domain/types';

// Vi använder fireEvent (redan tillgängligt via @testing-library/react) i stället
// för @testing-library/user-event, för att inte lägga till ett nytt beroende för
// det dessa tester behöver (PRINCIPLES §11). fireEvent.change räcker för att
// driva native input/select och submit deterministiskt.

const teams: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
];
const teamsById = new Map(teams.map((t) => [t.id, t]));

function scheduledMatch(): Match {
  return {
    id: 'm1',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff: '2026-06-12T19:00:00Z',
    venue: 'Testarena',
    result: null,
    status: 'scheduled',
  };
}

// En onSubmit som delegerar till den riktiga valideringen, så formuläret testas
// mot det faktiska kontraktet (inte en attrapp som alltid säger ok).
function realSubmit(match: Match) {
  return (_matchId: string, entry: ResultEntry) => validateResultEntry(match.status, entry);
}

describe('ResultEntryForm, tillgänglighet', () => {
  it('har riktiga labels kopplade till varje fält', () => {
    render(
      <ResultEntryForm
        match={scheduledMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    // getByLabelText hittar bara om label är korrekt kopplad (htmlFor/id).
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sydafrika \(borta\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Status/)).toBeInTheDocument();
  });

  it('namnger matchen i en legend (skärmläsar-kontext)', () => {
    render(
      <ResultEntryForm
        match={scheduledMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    expect(screen.getByRole('group', { name: /Mexiko mot Sydafrika/ })).toBeInTheDocument();
  });
});

describe('ResultEntryForm, fel-vägar (visas + kopplas via aria)', () => {
  it('visar valideringsfel i en role="alert" vid ogiltig inmatning', () => {
    const match = scheduledMatch();
    render(<ResultEntryForm match={match} teamsById={teamsById} onSubmit={realSubmit(match)} />);

    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara/ }));

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/heltal som är noll eller större/i);
  });

  it('kopplar felet till fältet via aria-describedby + aria-invalid', () => {
    const match = scheduledMatch();
    render(<ResultEntryForm match={match} teamsById={teamsById} onSubmit={realSubmit(match)} />);

    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara/ }));

    const homeInput = screen.getByLabelText(/Mexiko \(hemma\)/);
    expect(homeInput).toHaveAttribute('aria-invalid', 'true');
    const describedBy = homeInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    // describedby ska peka på fel-listans id (role=alert).
    expect(screen.getByRole('alert')).toHaveAttribute('id', describedBy!);
  });

  // C1: ett 'result'-fel ("finished utan resultat") sitter inte på ett enskilt
  // måltal utan på BÅDA. Tidigare markerades inget fält som ogiltigt eftersom
  // hjälparna bara kollade exakt fältnamn ('result' matchar ingen input). Nu ska
  // BÅDA målfälten bli aria-invalid och peka på fel-listan via describedby, så
  // skärmläsaren får fel-kontexten på de tomma fälten, inte bara i fel-listan.
  it('kopplar ett "result"-fel (finished utan resultat) till BÅDA målfälten (aria)', () => {
    const match = scheduledMatch();
    render(<ResultEntryForm match={match} teamsById={teamsById} onSubmit={realSubmit(match)} />);

    // Status finished men målfälten lämnas tomma => 'finished-without-result' (field 'result').
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara/ }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/kräver både hemma- och bortamål/i);

    const homeInput = screen.getByLabelText(/Mexiko \(hemma\)/);
    const awayInput = screen.getByLabelText(/Sydafrika \(borta\)/);
    expect(homeInput).toHaveAttribute('aria-invalid', 'true');
    expect(awayInput).toHaveAttribute('aria-invalid', 'true');
    // Båda målfälten pekar på fel-listans id (role=alert) via describedby.
    expect(homeInput).toHaveAttribute('aria-describedby', alert.getAttribute('id')!);
    expect(awayInput).toHaveAttribute('aria-describedby', alert.getAttribute('id')!);
  });
});

describe('ResultEntryForm, lyckad inmatning', () => {
  it('kallar onSubmit med rätt entry och rensar fel + kallar onSaved', () => {
    const match = scheduledMatch();
    const onSubmit = vi.fn(() => ({ ok: true }) as const);
    const onSaved = vi.fn();
    render(
      <ResultEntryForm match={match} teamsById={teamsById} onSubmit={onSubmit} onSaved={onSaved} />
    );

    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara/ }));

    expect(onSubmit).toHaveBeenCalledWith('m1', { homeGoals: 2, awayGoals: 1, status: 'finished' });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('seedar fälten från ett redan inmatat resultat (redigera-läge)', () => {
    const finished: Match = {
      ...scheduledMatch(),
      status: 'finished',
      result: { homeGoals: 3, awayGoals: 2 },
    };
    render(
      <ResultEntryForm match={finished} teamsById={teamsById} onSubmit={() => ({ ok: true })} />
    );
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toHaveValue(3);
    expect(screen.getByLabelText(/Sydafrika \(borta\)/)).toHaveValue(2);
  });
});
