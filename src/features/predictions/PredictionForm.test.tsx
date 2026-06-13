import { describe, expect, it, vi } from 'vitest';
// fireEvent räcker för det dessa tester behöver (samma val som ResultEntryForm-
// testet, PRINCIPLES §11: lägg inte till user-event-beroendet för detta).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PredictionForm } from './PredictionForm';
import type { Match, Team } from '../../domain/types';
import { PREDICTION_POINTS } from '../../data/predictions';

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

/** Samma match men AVGJORD, med ett valbart resultat (facit). Driver poäng-raden. */
function finishedMatch(homeGoals: number, awayGoals: number): Match {
  return { ...MATCH, status: 'finished', result: { homeGoals, awayGoals } };
}

/** Samma match men PÅGÅENDE (live): låst men inget facit, ska aldrig ge en poäng-rad. */
const LIVE_MATCH: Match = { ...MATCH, status: 'live', result: null };

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

// POÄNG-RADEN på tips-kortet (T58 krav 1, #99): på en AVGJORD match jag tippade visas
// poängen + VARFÖR direkt på kupongen, härlett ur den DELADE poäng-vägen (scorePrediction
// + matchPointLabel). Fokus: rätt etikett per utfall, INGEN poäng-rad på pågående/otippad,
// och att siffran är kopplad till poäng-KONSTANTERNA (mutations-vakt, T34-mönstret).
describe('PredictionForm , poäng-rad på avgjord match (T58, #99)', () => {
  /** Hämta poäng-brickans element (eller null), så test inte beror på exakt text-form. */
  const tipResult = () => document.querySelector('[data-tip-result]');

  function renderFinished(
    home: number,
    away: number,
    current: { homeGoals: number; awayGoals: number } | null
  ) {
    return render(
      <PredictionForm
        match={finishedMatch(home, away)}
        teamsById={teamsById}
        current={current}
        locked={true}
        onSubmit={vi.fn()}
      />
    );
  }

  it('EXAKT resultat -> "+3 · Exakt resultat" (data-hooks satta)', () => {
    renderFinished(2, 1, { homeGoals: 2, awayGoals: 1 });
    const badge = tipResult();
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('data-tip-point-type', 'exact');
    expect(badge).toHaveAttribute('data-tip-points', String(PREDICTION_POINTS.exact));
    expect(badge).toHaveTextContent('+3');
    expect(badge).toHaveTextContent('Exakt resultat');
  });

  it('RÄTT UTFALL på en VINST -> "+1 · Rätt vinnare"', () => {
    // Tippade 1-0 (hemmavinst), facit 2-0 (hemmavinst, ej exakt) -> rätt vinnare, 1p.
    renderFinished(2, 0, { homeGoals: 1, awayGoals: 0 });
    const badge = tipResult();
    expect(badge).toHaveAttribute('data-tip-point-type', 'outcome');
    expect(badge).toHaveAttribute('data-tip-points', String(PREDICTION_POINTS.outcome));
    expect(badge).toHaveTextContent('+1');
    expect(badge).toHaveTextContent('Rätt vinnare');
  });

  // HARD (#69 kryss-noten): rätt utfall på ett OAVGJORT får ALDRIG heta "Rätt vinnare".
  it('RÄTT UTFALL på ett OAVGJORT -> "+1 · Rätt kryss", aldrig "Rätt vinnare"', () => {
    // Tippade 1-1 (kryss), facit 2-2 (kryss, ej exakt) -> rätt kryss, 1p.
    renderFinished(2, 2, { homeGoals: 1, awayGoals: 1 });
    const badge = tipResult();
    expect(badge).toHaveAttribute('data-tip-point-type', 'outcome');
    expect(badge).toHaveTextContent('+1');
    expect(badge).toHaveTextContent('Rätt kryss');
    expect(badge).not.toHaveTextContent('Rätt vinnare');
  });

  it('MISS -> "0 · Miss" (noll utan plustecken, det är ingen vinst)', () => {
    // Tippade hemmavinst 2-0, facit bortavinst 0-1 -> fel utfall, 0p.
    renderFinished(0, 1, { homeGoals: 2, awayGoals: 0 });
    const badge = tipResult();
    expect(badge).toHaveAttribute('data-tip-point-type', 'miss');
    expect(badge).toHaveAttribute('data-tip-points', String(PREDICTION_POINTS.miss));
    expect(badge).toHaveTextContent('Miss');
    // 0 får INGET plustecken: brickan börjar med "0", inte "+0".
    expect(badge?.textContent?.trimStart().startsWith('0')).toBe(true);
    expect(badge).not.toHaveTextContent('+0');
  });

  it('PÅGÅENDE (live) låst match: INGEN poäng-rad, bara "Ditt tips" (T55, inga gissade poäng)', () => {
    render(
      <PredictionForm
        match={LIVE_MATCH}
        teamsById={teamsById}
        current={{ homeGoals: 2, awayGoals: 1 }}
        locked={true}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText(/Ditt tips: 2–1/)).toBeInTheDocument();
    expect(tipResult()).toBeNull();
  });

  it('OTIPPAD avgjord match: INGEN poäng-rad (ingen "0 Miss" för den som inte tippade, ärligt)', () => {
    renderFinished(2, 1, null);
    expect(screen.getByText(/Du hann inte tippa/)).toBeInTheDocument();
    expect(tipResult()).toBeNull();
    expect(screen.queryByText(/Miss/)).not.toBeInTheDocument();
  });

  it('mutations-koppling: poäng-siffran kommer ur PREDICTION_POINTS, inte ett magiskt tal', () => {
    // Tre utfall, var och en mot SIN konstant (inte en hårdkodad 3/1/0): byter någon
    // konstanten failar detta, så siffran är bevisat samma sanning som poängsättningen.
    const cases: Array<{
      facit: [number, number];
      tips: [number, number];
      expected: number;
    }> = [
      { facit: [2, 1], tips: [2, 1], expected: PREDICTION_POINTS.exact },
      { facit: [2, 0], tips: [1, 0], expected: PREDICTION_POINTS.outcome },
      { facit: [0, 1], tips: [2, 0], expected: PREDICTION_POINTS.miss },
    ];
    for (const { facit, tips, expected } of cases) {
      const { unmount } = renderFinished(facit[0], facit[1], {
        homeGoals: tips[0],
        awayGoals: tips[1],
      });
      expect(tipResult()).toHaveAttribute('data-tip-points', String(expected));
      unmount();
    }
  });
});
