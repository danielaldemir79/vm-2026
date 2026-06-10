import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroupTable } from './GroupTable';
import type { GroupStanding, Team } from '../../domain/types';
// Lagnamnen i tabellen är klickbara (TeamNameButton -> useTeamProfile, T10), så
// renderingen sker i en minimal profil-context-stub (utan den fulla modalen).
import { TeamProfileStub } from '../../test/team-profile-stub';

// Bygg en standings-rad kort (alla numeriska fält explicit för läsbarhet).
function row(teamId: string, rank: number, over: Partial<GroupStanding> = {}): GroupStanding {
  return {
    teamId,
    played: 3,
    won: 2,
    drawn: 1,
    lost: 0,
    goalsFor: 6,
    goalsAgainst: 2,
    goalDifference: 4,
    points: 7,
    rank,
    ...over,
  };
}

const teamsById = new Map<string, Team>([
  ['mex', { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' }],
  ['rsa', { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' }],
  ['kor', { id: 'kor', name: 'Sydkorea', code: 'KOR', group: 'A' }],
  ['cze', { id: 'cze', name: 'Tjeckien', code: 'CZE', group: 'A' }],
]);

const standings: GroupStanding[] = [
  row('mex', 1),
  row('rsa', 2),
  row('kor', 3, {
    won: 0,
    drawn: 1,
    lost: 2,
    points: 1,
    goalsFor: 1,
    goalsAgainst: 4,
    goalDifference: -3,
  }),
  row('cze', 4, {
    won: 0,
    drawn: 0,
    lost: 3,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 5,
    goalDifference: -5,
  }),
];

function renderTable() {
  return render(
    <TeamProfileStub>
      <GroupTable groupId="A" standings={standings} teamsById={teamsById} />
    </TeamProfileStub>
  );
}

describe('GroupTable, tillgänglig tabell-semantik', () => {
  it('renderar en riktig table med en caption som namnger gruppen', () => {
    renderTable();
    // En <table> exponeras med roll "table" och en tillgänglig caption.
    const table = screen.getByRole('table', { name: /Grupp A/i });
    expect(table).toBeInTheDocument();
  });

  it('har en kolumn-header per fält (placering, lag + de 8 statistik-kolumnerna)', () => {
    renderTable();
    // 10 kolumn-headers: #, Lag, S, V, O, F, GM, IM, MS, P.
    const columnHeaders = screen.getAllByRole('columnheader');
    expect(columnHeaders).toHaveLength(10);
    expect(columnHeaders.map((th) => th.textContent)).toEqual([
      '#',
      'Lag',
      'S',
      'V',
      'O',
      'F',
      'GM',
      'IM',
      'MS',
      'P',
    ]);
  });

  it('exponerar varje lag som en rad-header (th scope=row) för skärmläsare', () => {
    renderTable();
    // Lagnamnen blir rad-headers, så en skärmläsare kopplar siffrorna till laget.
    expect(screen.getByRole('rowheader', { name: /Mexiko/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Tjeckien/ })).toBeInTheDocument();
  });

  it('renderar en rad per lag i rätt ordning (computeStandings sorterar, vi bara visar)', () => {
    renderTable();
    // En header-rad + 4 lag-rader = 5 rader totalt.
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(5);

    // Lagordningen i tbody följer standings-ordningen (rank 1 först).
    const bodyRowHeaders = screen.getAllByRole('rowheader').map((th) => th.textContent);
    expect(bodyRowHeaders[0]).toMatch(/Mexiko/);
    expect(bodyRowHeaders[3]).toMatch(/Tjeckien/);
  });

  it('visar lagets statistik-värden i raden', () => {
    renderTable();
    const mexRow = screen.getByRole('rowheader', { name: /Mexiko/ }).closest('tr');
    expect(mexRow).not.toBeNull();
    const cells = within(mexRow as HTMLElement).getAllByRole('cell');
    // cell[0] = placering (#). Sedan S V O F GM IM MS P.
    expect(cells[0]).toHaveTextContent('1');
    // Poäng (sista cellen) = 7.
    expect(cells[cells.length - 1]).toHaveTextContent('7');
  });
});

describe('GroupTable, kvalificeringszon (markeras tillgängligt, inte med färg)', () => {
  it('markerar etta och tvåa som kvalificerade via data-attribut + dold text', () => {
    renderTable();
    // De direkt kvalificerade lagen (rank 1-2) bär data-qualified (för design-
    // frontends styling) och en sr-only-text (för skärmläsare), inte en färg
    // (T7 äger statusfärger). Etta + tvåa = 2 markerade.
    const qualifiedRows = document.querySelectorAll('tr[data-qualified="true"]');
    expect(qualifiedRows).toHaveLength(2);

    expect(screen.getByText(/Mexiko/).closest('tr')).toHaveAttribute('data-qualified', 'true');
    expect(screen.getByText(/Tjeckien/).closest('tr')).not.toHaveAttribute('data-qualified');
  });
});

describe('GroupTable, fel-väg: okänt lag-id maskeras inte', () => {
  it('visar id:t synligt om ett lag saknas i uppslaget (fail loud light)', () => {
    // En standings-rad för ett lag som inte finns i teamsById, ska inte tyst
    // dölja raden eller krascha, utan visa id:t så data-inkonsistensen syns.
    const orphan = [row('okant-lag', 1)];
    render(
      <TeamProfileStub>
        <GroupTable groupId="B" standings={orphan} teamsById={teamsById} />
      </TeamProfileStub>
    );

    expect(screen.getByRole('rowheader', { name: /okant-lag/ })).toBeInTheDocument();
  });

  it('gör ett okänt lag ICKE-klickbart (C8): ingen knapp som öppnar en tom profil', () => {
    // C8: saknas laget i teamsById hittar profil-modalen inget lag, så en klickbar
    // knapp skulle göra tyst ingenting. Ett okänt lag ska därför vara ren text, inte
    // en TeamNameButton (teamId=null -> span), medan ett KÄNT lag förblir klickbart.
    const openProfile = vi.fn();
    const mixed = [row('okant-lag', 1), row('mex', 2)];
    render(
      <TeamProfileStub openProfile={openProfile}>
        <GroupTable groupId="B" standings={mixed} teamsById={teamsById} />
      </TeamProfileStub>
    );

    // Det okända laget renderas som text, men exponeras INTE som en knapp.
    const orphanHeader = screen.getByRole('rowheader', { name: /okant-lag/ });
    expect(within(orphanHeader).queryByRole('button')).not.toBeInTheDocument();

    // Det kända laget (Mexiko) är fortfarande klickbart och öppnar rätt profil.
    const knownButton = screen.getByRole('button', { name: /Visa lagprofil för Mexiko/i });
    fireEvent.click(knownButton);
    expect(openProfile).toHaveBeenCalledWith('mex');
  });
});
