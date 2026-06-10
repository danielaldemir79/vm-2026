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
// mot det faktiska kontraktet (inte en attrapp som alltid säger ok). Stage skickas
// med så slutspels-straffregeln (FIFA Art. 14) gäller för slutspelsmatcher.
function realSubmit(match: Match) {
  return (_matchId: string, entry: ResultEntry) =>
    validateResultEntry(match.status, entry, match.stage);
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

// Straffläggning i slutspel (F1/penalties-pinnen, FIFA Art. 14). Straff-fälten
// visas BARA för en slutspelsmatch som matas in som spelad med lika ordinarie
// ställning, och submit:en bär då straffarna. Gruppspel visar dem aldrig.
describe('ResultEntryForm, slutspels-straffar (FIFA Art. 14)', () => {
  function knockoutMatch(): Match {
    return {
      id: 'M73',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: 'mex',
      awayTeamId: 'rsa',
      kickoff: '2026-07-01T19:00:00Z',
      venue: 'Testarena',
      result: null,
      status: 'scheduled',
    };
  }

  it('GRUPPSPEL: visar ALDRIG straff-fält, även vid lika ställning', () => {
    render(
      <ResultEntryForm
        match={scheduledMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '1' } });
    expect(document.querySelector('[data-penalties-row]')).toBeNull();
  });

  it('SLUTSPEL: straff-fält dyker upp vid lika ställning (spelad), inte vid ledning', () => {
    render(
      <ResultEntryForm
        match={knockoutMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '1' } });
    // Ledning 2-1: ingen straffläggning.
    expect(document.querySelector('[data-penalties-row]')).toBeNull();

    // Ändra till lika 1-1: straff-raden dyker upp.
    fireEvent.change(screen.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '2' } });
    expect(document.querySelector('[data-penalties-row]')).not.toBeNull();
  });

  // C13: lika NEGATIVA heltal (t.ex. -1 mot -1) är inte ett giltigt slutspelsresultat
  // och får INTE trigga straff-fälten. Number.isInteger ensamt godtog dem (de är ju
  // heltal); icke-negativ-checken (>= 0) stänger den vägen.
  it('SLUTSPEL: visar INTE straff-fält vid lika NEGATIVA mål (-1 mot -1)', () => {
    render(
      <ResultEntryForm
        match={knockoutMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '-1' } });
    expect(document.querySelector('[data-penalties-row]')).toBeNull();
  });

  it('SLUTSPEL: submit bär straffarna när ställningen är lika', () => {
    const onSubmit = vi.fn(() => ({ ok: true }) as const);
    render(<ResultEntryForm match={knockoutMatch()} teamsById={teamsById} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '1' } });
    // Straff-fälten (synliga nu): hemma 4, borta 2.
    const pensInputs = document.querySelector('[data-penalties-row]')!.querySelectorAll('input');
    fireEvent.change(pensInputs[0], { target: { value: '4' } });
    fireEvent.change(pensInputs[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara/ }));

    expect(onSubmit).toHaveBeenCalledWith('M73', {
      homeGoals: 1,
      awayGoals: 1,
      status: 'finished',
      penalties: { homeGoals: 4, awayGoals: 2 },
    });
  });

  it('SLUTSPEL: seedar straff-fälten från ett redan straff-avgjort resultat', () => {
    const finished: Match = {
      ...knockoutMatch(),
      status: 'finished',
      result: { homeGoals: 1, awayGoals: 1, penalties: { homeGoals: 5, awayGoals: 3 } },
    };
    render(
      <ResultEntryForm match={finished} teamsById={teamsById} onSubmit={() => ({ ok: true })} />
    );
    const pensInputs = document.querySelector('[data-penalties-row]')!.querySelectorAll('input');
    expect(pensInputs[0]).toHaveValue(5);
    expect(pensInputs[1]).toHaveValue(3);
  });
});

// EXTERN UPPDATERING (Copilot R2, C7/C8): matchen kan ändras EXTERNT i den delade
// storen (t.ex. realtid T18, eller en annan vy) medan formuläret är monterat. Då
// ska fälten synka in det nya värdet, mål OCH straffar konsekvent (C8), men ETT
// pågående osparat lokalt edit ska aldrig klottras över (synka bara när inte dirty).
describe('ResultEntryForm, synkar mot extern matchuppdatering (C7/C8)', () => {
  function knockoutMatch(): Match {
    return {
      id: 'M73',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: 'mex',
      awayTeamId: 'rsa',
      kickoff: '2026-07-01T19:00:00Z',
      venue: 'Testarena',
      result: null,
      status: 'scheduled',
    };
  }

  it('seedar om MÅL + status när matchen uppdateras externt (rent formulär)', () => {
    const { rerender } = render(
      <ResultEntryForm
        match={scheduledMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    // Inget inmatat än: fälten är tomma, status "Ej spelad".
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toHaveValue(null);

    // Extern uppdatering: samma match får nu ett resultat (finished 2-1).
    const updated: Match = {
      ...scheduledMatch(),
      status: 'finished',
      result: { homeGoals: 2, awayGoals: 1 },
    };
    rerender(
      <ResultEntryForm match={updated} teamsById={teamsById} onSubmit={() => ({ ok: true })} />
    );

    // Fälten ska spegla det nya externa resultatet (inte de gamla mount-värdena).
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toHaveValue(2);
    expect(screen.getByLabelText(/Sydafrika \(borta\)/)).toHaveValue(1);
    expect(screen.getByLabelText(/Status/)).toHaveValue('finished');
  });

  it('seedar om STRAFFARNA när bara penalties ändras externt (C8, konsekvent med målen)', () => {
    // Start: en straff-avgjord slutspelsmatch 1-1 (5-3 på straffar).
    const start: Match = {
      ...knockoutMatch(),
      status: 'finished',
      result: { homeGoals: 1, awayGoals: 1, penalties: { homeGoals: 5, awayGoals: 3 } },
    };
    const { rerender } = render(
      <ResultEntryForm match={start} teamsById={teamsById} onSubmit={() => ({ ok: true })} />
    );
    let pens = document.querySelector('[data-penalties-row]')!.querySelectorAll('input');
    expect(pens[0]).toHaveValue(5);
    expect(pens[1]).toHaveValue(3);

    // Extern uppdatering: SAMMA mål (1-1) men ANDRA straffar (4-2). Den gamla
    // re-key-strategin saknade straffarna, så detta hade INTE synkats (C8).
    const updated: Match = {
      ...knockoutMatch(),
      status: 'finished',
      result: { homeGoals: 1, awayGoals: 1, penalties: { homeGoals: 4, awayGoals: 2 } },
    };
    rerender(
      <ResultEntryForm match={updated} teamsById={teamsById} onSubmit={() => ({ ok: true })} />
    );

    pens = document.querySelector('[data-penalties-row]')!.querySelectorAll('input');
    expect(pens[0]).toHaveValue(4);
    expect(pens[1]).toHaveValue(2);
  });

  it('BEVARAR ett pågående osparat edit när matchen uppdateras externt (synka bara när inte dirty)', () => {
    const { rerender } = render(
      <ResultEntryForm
        match={scheduledMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    // Användaren börjar skriva (osparat): hemma = 7. Formuläret är nu "smutsigt".
    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '7' } });
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toHaveValue(7);

    // En extern uppdatering kommer in (t.ex. realtid) medan editet pågår.
    const updated: Match = {
      ...scheduledMatch(),
      status: 'finished',
      result: { homeGoals: 2, awayGoals: 1 },
    };
    rerender(
      <ResultEntryForm match={updated} teamsById={teamsById} onSubmit={() => ({ ok: true })} />
    );

    // Det osparade editet ska INTE klottras över av den externa uppdateringen.
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toHaveValue(7);
  });

  it('efter SPARAT synkar formuläret igen mot nästa externa uppdatering (dirty nollas)', () => {
    const onSubmit = vi.fn(() => ({ ok: true }) as const);
    const { rerender } = render(
      <ResultEntryForm match={scheduledMatch()} teamsById={teamsById} onSubmit={onSubmit} />
    );
    // Mata in och spara (dirty -> rent igen).
    fireEvent.change(screen.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: /Spara/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // En SENARE extern uppdatering (annan vy korrigerade till 3-0) ska nu synka in,
    // eftersom sparningen nollade dirty-flaggan.
    const updated: Match = {
      ...scheduledMatch(),
      status: 'finished',
      result: { homeGoals: 3, awayGoals: 0 },
    };
    rerender(<ResultEntryForm match={updated} teamsById={teamsById} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toHaveValue(3);
    expect(screen.getByLabelText(/Sydafrika \(borta\)/)).toHaveValue(0);
  });
});

// STABIL KOLUMN-LAYOUT (#39, Daniels feedback): poängrutorna ska ligga i samma
// kolumner kort för kort oavsett lagnamnens längd, och ett långt namn ska trunkera
// (ellipsis) utan att knuffa layouten. jsdom har ingen riktig layout-motor, så vi
// kan inte mäta pixlar; vi vaktar i stället de STRUKTURELLA garantierna som ger
// den stabila layouten: rutorna har en FAST bredd-klass (oberoende av namn),
// lagnamnet är `truncate` med fullt namn i title, och a11y-namnet bevaras.
describe('ResultEntryForm, stabil kolumn-layout (#39)', () => {
  // Ett extremt långt lagnamn (den värsta knuff-risken i den gamla flex-layouten).
  const longTeams = new Map<string, Team>([
    [
      'long',
      {
        id: 'long',
        name: 'Bosnien och Hercegovina-landslaget med långt namn',
        code: 'BIH',
        group: 'A',
      },
    ],
    ['rsa', { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' }],
  ]);
  function longNameMatch(): Match {
    return { ...scheduledMatch(), homeTeamId: 'long', awayTeamId: 'rsa' };
  }

  it('poäng-fälten har en FAST bredd-klass (w-16), oberoende av lagnamnets längd', () => {
    const { rerender } = render(
      <ResultEntryForm
        match={scheduledMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    // Kort lagnamn: rutan är w-16.
    expect(screen.getByLabelText(/Mexiko \(hemma\)/)).toHaveClass('w-16');

    // Långt lagnamn: SAMMA fasta bredd, namnet får inte ha tänjt rutan.
    rerender(
      <ResultEntryForm
        match={longNameMatch()}
        teamsById={longTeams}
        onSubmit={() => ({ ok: true })}
      />
    );
    const longHome = screen.getByLabelText(/Bosnien och Hercegovina.*\(hemma\)/);
    expect(longHome).toHaveClass('w-16');
  });

  it('lagnamnet trunkeras (ellipsis) och bär fullt namn via title (ingen ful avhuggning)', () => {
    render(
      <ResultEntryForm
        match={longNameMatch()}
        teamsById={longTeams}
        onSubmit={() => ({ ok: true })}
      />
    );
    // Labeln (kopplad till hemma-fältet) är truncate och har title = fullt namn.
    const input = screen.getByLabelText(/Bosnien och Hercegovina.*\(hemma\)/);
    const label = document.querySelector(`label[for="${input.id}"]`) as HTMLElement;
    expect(label).not.toBeNull();
    expect(label).toHaveClass('truncate');
    expect(label).toHaveAttribute('title', 'Bosnien och Hercegovina-landslaget med långt namn');
  });

  it('a11y-namnet bevarar "(hemma)"/"(borta)" trots truncate (sr-only suffix)', () => {
    render(
      <ResultEntryForm
        match={longNameMatch()}
        teamsById={longTeams}
        onSubmit={() => ({ ok: true })}
      />
    );
    // getByLabelText matchar bara om hela det tillgängliga namnet finns, inkl suffix.
    expect(
      screen.getByLabelText(/Bosnien och Hercegovina-landslaget med långt namn \(hemma\)/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Sydafrika \(borta\)/)).toBeInTheDocument();
  });

  it('"mot"-avdelaren och score-blocket ligger i ett rutnät (stabila kolumn-spår)', () => {
    const { container } = render(
      <ResultEntryForm
        match={scheduledMatch()}
        teamsById={teamsById}
        onSubmit={() => ({ ok: true })}
      />
    );
    const body = container.querySelector('[data-result-card-body]');
    expect(body).not.toBeNull();
    // Grid-layouten är seamen som ger stabila kolumner (design-frontend kan
    // finslipa spåren, men det MÅSTE vara ett grid, inte den gamla flex-knuffen).
    expect(body).toHaveClass('grid');
  });
});
