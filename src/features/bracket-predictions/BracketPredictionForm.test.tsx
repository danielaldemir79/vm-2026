import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BracketPredictionForm } from './BracketPredictionForm';
import { teamCode, type TeamCode } from '../../domain/team-code';
import type { SlotTeamOption } from './bracket-predictable-slots';

function opt(code: string, name: string): SlotTeamOption {
  return { code: teamCode(code) as TeamCode, name };
}

const TWO_TEAMS: SlotTeamOption[] = [opt('BRA', 'Brasilien'), opt('ARG', 'Argentina')];

describe('BracketPredictionForm', () => {
  it('OKÄNDA LAG (teamsKnown=false): renderar en TBD-ruta, ingen väljare', () => {
    render(
      <BracketPredictionForm
        slotId="M74"
        label="Sextondelsfinal M74"
        teams={[]}
        teamsKnown={false}
        current={null}
        locked={false}
        onSubmit={vi.fn()}
      />
    );
    const form = document.querySelector('[data-slot-id="M74"]')!;
    expect(form.hasAttribute('data-bracket-prediction-tbd')).toBe(true);
    expect(form.querySelector('select')).toBeNull();
    expect(form).toHaveTextContent(/Lagen avgörs av tidigare resultat/);
  });

  it('fel-väg: spara utan val ger en alert (Välj ett lag), inget onSubmit', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <BracketPredictionForm
        slotId="M73"
        label="Sextondelsfinal M73"
        teams={TWO_TEAMS}
        teamsKnown
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Spara tips/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Välj ett lag/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('happy: väljer ett lag och sparar -> onSubmit får slotId + code, sparat-kvitto syns', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <BracketPredictionForm
        slotId="M73"
        label="Sextondelsfinal M73"
        teams={TWO_TEAMS}
        teamsKnown
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'BRA' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara tips/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('M73', 'BRA'));
    expect(await screen.findByText('Sparat')).toBeInTheDocument();
  });

  it('fail loud: ett serverfel (RLS-avslag) visas inline som alert, inte tyst', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('slotten är låst'));
    render(
      <BracketPredictionForm
        slotId="M73"
        label="Sextondelsfinal M73"
        teams={TWO_TEAMS}
        teamsKnown
        current={null}
        locked={false}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ARG' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara tips/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/slotten är låst/);
  });

  it('LÅST: väljaren disabled, mitt tips kvar synligt, ingen spara-knapp', () => {
    render(
      <BracketPredictionForm
        slotId="M73"
        label="Sextondelsfinal M73"
        teams={TWO_TEAMS}
        teamsKnown
        current="BRA"
        locked
        onSubmit={vi.fn()}
      />
    );
    const form = document.querySelector('[data-slot-id="M73"]')!;
    expect(form.querySelector('[data-bracket-prediction-lock]')).not.toBeNull();
    // Väljaren finns kvar (a11y + testkontrakt) men är disabled via fieldset[disabled]
    // (toBeDisabled tar hänsyn till fieldset-arvet, till skillnad från .disabled-propen).
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(form.querySelector('[data-bracket-prediction-save]')).toBeNull();
    // Mitt tips står kvar synligt.
    expect(form).toHaveTextContent(/Mitt tips: Brasilien/);
  });

  it('seedar väljaren från mitt befintliga tips (current)', () => {
    render(
      <BracketPredictionForm
        slotId="champion"
        label="VM-vinnare"
        teams={TWO_TEAMS}
        teamsKnown
        current="ARG"
        locked={false}
        onSubmit={vi.fn()}
      />
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('ARG');
    // "Ändra tips" när ett tips redan finns.
    expect(screen.getByRole('button', { name: /Ändra tips/ })).toBeInTheDocument();
  });
});
