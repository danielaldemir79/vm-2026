import { describe, expect, it, vi } from 'vitest';
// fireEvent räcker för det dessa tester behöver (samma val som ResultEntryForm-
// testet, PRINCIPLES §11: lägg inte till user-event-beroendet för detta).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PredictionForm } from './PredictionForm';
import type { Match, Team } from '../../domain/types';

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
];
const teamsById = new Map(TEAMS.map((t) => [t.id, t]));

const MATCH: Match = {
  id: 'g-A-1',
  stage: 'group',
  groupId: 'A',
  homeTeamId: 'mex',
  awayTeamId: 'rsa',
  kickoff: '2026-06-20T18:00:00.000Z',
  venue: 'x',
  result: null,
  status: 'scheduled',
};

const homeField = () => screen.getByLabelText(/Mexiko \(hemma\)/);
const awayField = () => screen.getByLabelText(/Sydafrika \(borta\)/);

describe('PredictionForm (tips-inmatning, #39-formspråk)', () => {
  it('renderar lagnamnen + en submit-knapp och fälten', () => {
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={null}
        locked={false}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText('Mexiko')).toBeInTheDocument();
    expect(screen.getByText('Sydafrika')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spara tips' })).toBeInTheDocument();
  });

  it('sparar ett giltigt tips (anropar onSubmit med matchId + mål)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(homeField(), { target: { value: '2' } });
    fireEvent.change(awayField(), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tips' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('g-A-1', 2, 1));
    expect(await screen.findByText('Sparat')).toBeInTheDocument();
  });

  it('FEL-VÄG: ofullständigt tips (bara ett fält) visar ett fel, sparar inte', async () => {
    const onSubmit = vi.fn();
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(homeField(), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tips' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Ange ett tips/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('FEL-VÄG: negativt mål avvisas (icke-negativa heltal)', async () => {
    const onSubmit = vi.fn();
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(homeField(), { target: { value: '-1' } });
    fireEvent.change(awayField(), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tips' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('FEL-VÄG: decimaltal avvisas (heltal krävs)', async () => {
    const onSubmit = vi.fn();
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(homeField(), { target: { value: '1.5' } });
    fireEvent.change(awayField(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tips' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('FAIL LOUD: ett serverfel (RLS-avslag) visas som ett fel i formuläret', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Spara tips misslyckades: låst'));
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(homeField(), { target: { value: '1' } });
    fireEvent.change(awayField(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara tips' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/misslyckades/);
  });

  it('befintligt tips: seedar fälten och knappen heter "Ändra tips"', () => {
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={{ homeGoals: 3, awayGoals: 2 }}
        locked={false}
        onSubmit={vi.fn()}
      />
    );
    expect((homeField() as HTMLInputElement).value).toBe('3');
    expect((awayField() as HTMLInputElement).value).toBe('2');
    expect(screen.getByRole('button', { name: 'Ändra tips' })).toBeInTheDocument();
  });

  it('LÅST: fälten är inaktiva, ingen spar-knapp, och en låst-etikett visas med mitt tips', () => {
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={{ homeGoals: 2, awayGoals: 1 }}
        locked={true}
        onSubmit={vi.fn()}
      />
    );
    for (const input of screen.getAllByRole('spinbutton') as HTMLInputElement[]) {
      expect(input).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: /tips/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Tipset är låst/)).toBeInTheDocument();
    expect(screen.getByText(/Ditt tips: 2–1/)).toBeInTheDocument();
  });

  it('LÅST utan tips: etiketten säger att man inte hann tippa', () => {
    render(
      <PredictionForm
        match={MATCH}
        teamsById={teamsById}
        current={null}
        locked={true}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText(/Du hann inte tippa/)).toBeInTheDocument();
  });
});
