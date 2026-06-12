import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { GroupPredictionForm } from './GroupPredictionForm';
import type { GroupTeamOption } from './group-predictable-data';

const TEAMS: GroupTeamOption[] = [
  { code: 'MEX', name: 'Mexiko' },
  { code: 'RSA', name: 'Sydafrika' },
  { code: 'KOR', name: 'Sydkorea' },
  { code: 'CZE', name: 'Tjeckien' },
];

function renderForm(overrides: Partial<ComponentProps<typeof GroupPredictionForm>> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  render(
    <GroupPredictionForm
      groupId="A"
      teams={TEAMS}
      current={null}
      locked={false}
      deadlineIso="2026-06-20T18:00:00.000Z"
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit };
}

describe('GroupPredictionForm', () => {
  it('VALIDERING: tomt val ger fel, inget save', () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Spara grupp-tips/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Välj både gruppvinnare/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('VALIDERING: 1:a och 2:a samma lag ger fel (speglar DB-constrainten), inget save', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    fireEvent.change(screen.getByLabelText(/Grupptvåa/), { target: { value: 'MEX' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara grupp-tips/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/måste vara olika lag/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('giltigt tips: anropar onSubmit med grupp + koderna och visar Sparat', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    fireEvent.change(screen.getByLabelText(/Grupptvåa/), { target: { value: 'RSA' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara grupp-tips/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('A', 'MEX', 'RSA'));
    expect(await screen.findByText('Sparat')).toBeInTheDocument();
  });

  it('FAIL LOUD: ett serverfel (RLS-avslag) visas inline, ingen tyst miss', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('[VM2026] gruppen är låst'));
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    fireEvent.change(screen.getByLabelText(/Grupptvåa/), { target: { value: 'RSA' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara grupp-tips/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/gruppen är låst/);
  });

  it('LÅST: väljarna disabled, ingen spar-knapp, låst-etikett visas', () => {
    renderForm({
      locked: true,
      current: { winnerCode: 'MEX', runnerUpCode: 'RSA' },
    });
    expect(screen.getByLabelText(/Gruppvinnare/)).toBeDisabled();
    expect(screen.getByLabelText(/Grupptvåa/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /grupp-tips/ })).toBeNull();
    expect(document.querySelector('[data-group-prediction-lock]')).not.toBeNull();
  });

  it('seedar väljarna från mitt nuvarande tips (redigera = se det jag tippat)', () => {
    renderForm({ current: { winnerCode: 'KOR', runnerUpCode: 'CZE' } });
    expect((screen.getByLabelText(/Gruppvinnare/) as HTMLSelectElement).value).toBe('KOR');
    expect((screen.getByLabelText(/Grupptvåa/) as HTMLSelectElement).value).toBe('CZE');
    // "Ändra grupp-tips" när ett tips redan finns.
    expect(screen.getByRole('button', { name: /Ändra grupp-tips/ })).toBeInTheDocument();
  });

  // ---- T65 (#119): "Föreslå ur mina matchtips"-knappen --------------------------

  it('FÖRSLAG: knapp saknas helt när suggestion-propen inte ges (inget match-tips-lager)', () => {
    renderForm(); // suggestion = undefined
    expect(screen.queryByRole('button', { name: /Föreslå ur mina matchtips/ })).toBeNull();
  });

  it('FÖRSLAG: komplett förslag -> klick FÖRIFYLLER 1:a/2:a, men sparar ALDRIG (onSubmit ej anropad)', () => {
    const { onSubmit } = renderForm({ suggestion: { winnerCode: 'KOR', runnerUpCode: 'CZE' } });
    fireEvent.click(screen.getByRole('button', { name: /Föreslå ur mina matchtips/ }));
    // Väljarna är förifyllda...
    expect((screen.getByLabelText(/Gruppvinnare/) as HTMLSelectElement).value).toBe('KOR');
    expect((screen.getByLabelText(/Grupptvåa/) as HTMLSelectElement).value).toBe('CZE');
    // ...men INGET sparades (HARD-regel: aldrig auto-spar, Spara är användarens handling).
    expect(onSubmit).not.toHaveBeenCalled();
    // Inget "Sparat"-kvitto har visats (förifyllnad är inte ett sparat tips).
    expect(screen.queryByText('Sparat')).toBeNull();
  });

  it('FÖRSLAG: skriver över ett befintligt val i FORMULÄRET, men sparar fortfarande inte', () => {
    const { onSubmit } = renderForm({
      current: { winnerCode: 'MEX', runnerUpCode: 'RSA' },
      suggestion: { winnerCode: 'KOR', runnerUpCode: 'CZE' },
    });
    // Före klick: formuläret visar det befintliga (seedade) valet.
    expect((screen.getByLabelText(/Gruppvinnare/) as HTMLSelectElement).value).toBe('MEX');
    fireEvent.click(screen.getByRole('button', { name: /Föreslå ur mina matchtips/ }));
    // Efter klick: förslaget har ersatt valet i formuläret...
    expect((screen.getByLabelText(/Gruppvinnare/) as HTMLSelectElement).value).toBe('KOR');
    expect((screen.getByLabelText(/Grupptvåa/) as HTMLSelectElement).value).toBe('CZE');
    // ...men det befintliga sparade tipset är orört (onSubmit ej anropad).
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('FÖRSLAG: efter förifyllnad kan användaren själv Spara, och DÅ anropas onSubmit med förslagets koder', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit, suggestion: { winnerCode: 'KOR', runnerUpCode: 'CZE' } });
    fireEvent.click(screen.getByRole('button', { name: /Föreslå ur mina matchtips/ }));
    fireEvent.click(screen.getByRole('button', { name: /Spara grupp-tips/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('A', 'KOR', 'CZE'));
  });

  it('FÖRSLAG: ofullständigt tippat (suggestion null) -> knappen inaktiverad + ärlig text, inget förifylls', () => {
    renderForm({ suggestion: null });
    const button = screen.getByRole('button', { name: /Föreslå ur mina matchtips/ });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Tippa gruppens alla matcher först/)).toBeInTheDocument();
    // Ett klick på en disabled knapp gör inget; väljarna förblir tomma.
    fireEvent.click(button);
    expect((screen.getByLabelText(/Gruppvinnare/) as HTMLSelectElement).value).toBe('');
  });

  it('FÖRSLAG: LÅST grupp -> ingen förslags-knapp (formuläret är ändå låst)', () => {
    renderForm({
      locked: true,
      suggestion: { winnerCode: 'KOR', runnerUpCode: 'CZE' },
      current: { winnerCode: 'MEX', runnerUpCode: 'RSA' },
    });
    expect(screen.queryByRole('button', { name: /Föreslå ur mina matchtips/ })).toBeNull();
  });
});
