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
    fireEvent.click(screen.getByRole('button', { name: /Spara grupptips/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Välj både gruppvinnare/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('VALIDERING: 1:a och 2:a samma lag ger fel (speglar DB-constrainten), inget save', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    fireEvent.change(screen.getByLabelText(/Grupptvåa/), { target: { value: 'MEX' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara grupptips/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/måste vara olika lag/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('giltigt tips: anropar onSubmit med grupp + koderna och visar Sparat', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    fireEvent.change(screen.getByLabelText(/Grupptvåa/), { target: { value: 'RSA' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara grupptips/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('A', 'MEX', 'RSA'));
    expect(await screen.findByText('Sparat')).toBeInTheDocument();
  });

  it('FAIL LOUD: ett serverfel (RLS-avslag) visas inline, ingen tyst miss', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('[VM2026] gruppen är låst'));
    renderForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    fireEvent.change(screen.getByLabelText(/Grupptvåa/), { target: { value: 'RSA' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara grupptips/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/gruppen är låst/);
  });

  it('LÅST: väljarna disabled, ingen spar-knapp, låst-etikett visas', () => {
    renderForm({
      locked: true,
      current: { winnerCode: 'MEX', runnerUpCode: 'RSA' },
    });
    expect(screen.getByLabelText(/Gruppvinnare/)).toBeDisabled();
    expect(screen.getByLabelText(/Grupptvåa/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Spara grupptips/ })).toBeNull();
    expect(document.querySelector('[data-group-prediction-lock]')).not.toBeNull();
  });

  it('seedar väljarna från mitt nuvarande tips (redigera = se det jag tippat)', () => {
    renderForm({ current: { winnerCode: 'KOR', runnerUpCode: 'CZE' } });
    expect((screen.getByLabelText(/Gruppvinnare/) as HTMLSelectElement).value).toBe('KOR');
    expect((screen.getByLabelText(/Grupptvåa/) as HTMLSelectElement).value).toBe('CZE');
    // Knappen heter ALLTID "Spara grupptips", aldrig "Ändra" (T68/#129 punkt 13).
    expect(screen.getByRole('button', { name: 'Spara grupptips' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ändra/ })).toBeNull();
  });

  // ---- T68 (#129) punkt 13: osparade-ändringar-indikator ------------------------

  it('OSPARAT: ett nytt val (utan sparat tips) visar "Osparade ändringar"', () => {
    renderForm();
    // Inga osparade ändringar i utgångsläget (inget valt, inget sparat).
    expect(screen.queryByText(/Osparade ändringar/)).toBeNull();
    // Gör ett val -> formuläret skiljer sig från sparat (inget) -> indikatorn dyker upp.
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    expect(screen.getByText(/Osparade ändringar/)).toBeInTheDocument();
  });

  it('OSPARAT: indikatorn försvinner efter Spara (formuläret == sparat)', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    fireEvent.change(screen.getByLabelText(/Grupptvåa/), { target: { value: 'RSA' } });
    expect(screen.getByText(/Osparade ändringar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Spara grupptips/ }));
    // Efter sparning: indikatorn borta, "Sparat"-kvittot framme.
    await waitFor(() => expect(screen.queryByText(/Osparade ändringar/)).toBeNull());
    expect(screen.getByText('Sparat')).toBeInTheDocument();
  });

  it('OSPARAT: en ÄNDRING av ett redan sparat tips visar indikatorn igen', () => {
    renderForm({ current: { winnerCode: 'KOR', runnerUpCode: 'CZE' } });
    // Seedat från sparat tips -> inget osparat.
    expect(screen.queryByText(/Osparade ändringar/)).toBeNull();
    // Ändra 1:an -> skiljer sig från sparat -> indikatorn dyker upp.
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'MEX' } });
    expect(screen.getByText(/Osparade ändringar/)).toBeInTheDocument();
    // Ändra TILLBAKA till det sparade -> indikatorn försvinner (inget osparat kvar).
    fireEvent.change(screen.getByLabelText(/Gruppvinnare/), { target: { value: 'KOR' } });
    expect(screen.queryByText(/Osparade ändringar/)).toBeNull();
  });

  it('OSPARAT: ett förslag (förifyllnad) räknas som osparad ändring tills man Sparar', () => {
    renderForm({ suggestion: { winnerCode: 'KOR', runnerUpCode: 'CZE' } });
    fireEvent.click(screen.getByRole('button', { name: /Föreslå ur mina matchtips/ }));
    // Förifyllnaden ändrade formuläret men sparade inte -> osparade ändringar.
    expect(screen.getByText(/Osparade ändringar/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Spara grupptips/ }));
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

describe('GroupPredictionForm, resultat-panel (avgjord grupp man tippat)', () => {
  it('låst + result + tippat: visar resultat-panelen (poäng + facit)', () => {
    renderForm({
      locked: true,
      current: { winnerCode: 'MEX', runnerUpCode: 'KOR' },
      result: {
        groupId: 'A',
        points: 3,
        winnerCorrect: true,
        runnerUpCorrect: false,
        predictedWinnerCode: 'MEX',
        predictedRunnerUpCode: 'KOR',
        actualWinnerTeamId: 'mex',
        actualRunnerUpTeamId: 'rsa',
      },
    });
    expect(screen.getByText(/3 poäng/)).toBeInTheDocument();
    expect(screen.getByText(/Så blev det/)).toBeInTheDocument();
  });

  it('utan result: ingen resultat-panel (oförändrad standard-väg)', () => {
    renderForm({ locked: true, current: { winnerCode: 'MEX', runnerUpCode: 'KOR' } });
    expect(screen.queryByText(/Så blev det/)).not.toBeInTheDocument();
  });
});
