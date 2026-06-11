import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupPredictionsView } from './GroupPredictionsView';
import {
  GroupPredictionsStoreContext,
  type GroupPredictionsStore,
} from './group-predictions-context';
import type { GroupPrediction } from '../../data/predictions';
import type { Group, Match, Team } from '../../domain/types';
import { teamCode } from '../../domain/team-code';

// Mocka data-laddnings-hooken (vi testar vyns LÄGEN, inte I/O:t). Hooken är en
// vi.fn() så vi kan RÄKNA anrop: efter T51-fixen (en laddning, ingen dubbel fetch)
// ska den anropas exakt EN gång per render av vyn, inte två (den tips-härledda
// vyn laddar inte längre samma turneringsdata igen, den får den injicerad).
const dataState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  groups: [] as Group[],
  teams: [] as Team[],
  matches: [] as Match[],
  error: null as string | null,
}));
const useGroupPredictableDataMock = vi.hoisted(() => vi.fn());
vi.mock('./use-group-predictable-data', () => ({
  useGroupPredictableData: useGroupPredictableDataMock,
}));

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
  { id: 'can', name: 'Kanada', code: 'CAN', group: 'B' },
  { id: 'bih', name: 'Bosnien', code: 'BIH', group: 'B' },
  { id: 'sui', name: 'Schweiz', code: 'SUI', group: 'G' },
  { id: 'nor', name: 'Norge', code: 'NOR', group: 'G' },
];

const GROUPS: Group[] = [
  { id: 'A', teamIds: ['mex', 'rsa'] },
  { id: 'B', teamIds: ['can', 'bih'] },
  // Grupp G är en SEN grupp (g-G-1 = 15/6, EFTER fasta söndagstiden): T53 behåller dess
  // senare ankare, så den är öppen längre än A/B. Används för per-grupp-lås-testet.
  { id: 'G', teamIds: ['sui', 'nor'] },
];

function gmatch(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: id.charAt(2) as Group['id'],
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  };
}

const MATCHES: Match[] = [
  gmatch('g-A-1', '2026-06-11T19:00:00.000Z'), // tidig -> T53 förlänger till 14/6 21:59Z
  gmatch('g-B-1', '2026-06-12T19:00:00.000Z'), // tidig -> förlängs
  gmatch('g-G-1', '2026-06-15T19:00:00.000Z'), // sen -> behåller eget ankare (15/6)
];

function store(partial: Partial<GroupPredictionsStore>): GroupPredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myGroupPredictions: new Map(),
    saveGroupPrediction: vi.fn().mockResolvedValue(undefined),
    ...partial,
  };
}

function renderView(s: GroupPredictionsStore, now: Date) {
  return render(
    <GroupPredictionsStoreContext.Provider value={s}>
      <GroupPredictionsView now={now} />
    </GroupPredictionsStoreContext.Provider>
  );
}

beforeEach(() => {
  dataState.status = 'ready';
  dataState.groups = GROUPS;
  dataState.teams = TEAMS;
  dataState.matches = MATCHES;
  dataState.error = null;
  useGroupPredictableDataMock.mockReset();
  useGroupPredictableDataMock.mockReturnValue(dataState);
});

describe('GroupPredictionsView', () => {
  it('UTAN aktivt rum: visar "gå med i ett rum" och ingen grupp-lista', () => {
    renderView(store({ enabled: false, activeRoomId: null }), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByText(/Gå med i ett rum för att tippa grupperna/)).toBeInTheDocument();
    expect(document.querySelector('[data-group-predictions-list]')).toBeNull();
  });

  it('fel-väg: store-error visas som alert', () => {
    renderView(store({ status: 'error', error: 'trasig' }), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByRole('alert')).toHaveTextContent('trasig');
  });

  it('laddning: visar laddnings-status', () => {
    renderView(store({ status: 'loading' }), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByText(/Laddar grupper att tippa/)).toBeInTheDocument();
  });

  it('READY: renderar ett formulär per grupp (A + B + G)', () => {
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    const forms = document.querySelectorAll('[data-group-prediction-form]');
    expect(forms).toHaveLength(3);
    expect(document.querySelector('[data-group-id="A"]')).not.toBeNull();
    expect(document.querySelector('[data-group-id="B"]')).not.toBeNull();
    expect(document.querySelector('[data-group-id="G"]')).not.toBeNull();
  });

  it('öppen-räknare: visar antal grupper öppna att tippa', () => {
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByText(/3 grupper öppna att tippa/)).toBeInTheDocument();
  });

  it('PER-GRUPP-LÅS (T53): tidig grupp A LÅST efter söndagen, sen grupp G ÖPPEN', () => {
    // 15/6 08:00: A:s FÖRLÄNGDA deadline (14/6 21:59Z) passerad -> låst. G:s ankare
    // (15/6 19:00) ej passerat -> öppen. Bevisar att G INTE drogs ner till söndagen.
    renderView(store({}), new Date('2026-06-15T08:00:00Z'));
    const aForm = document.querySelector('[data-group-id="A"]');
    expect(aForm?.querySelector('[data-group-prediction-lock]')).not.toBeNull();
    expect(screen.getByText(/1 grupp öppen att tippa/)).toBeInTheDocument();
  });

  it('AC#3 DEADLINE (T53): öppen tidig grupp visar den FÖRLÄNGDA söndagen, låst grupp inte', () => {
    // 13/6 (mellan g-A-1 och söndagen): grupp A är ÖPPEN igen och dess deadline-rad ska
    // visa den FÖRLÄNGDA tiden (söndag 14/6 23:59 svensk = 21:59Z), inte den gamla 11/6.
    renderView(store({}), new Date('2026-06-13T08:00:00Z'));
    const aForm = document.querySelector('[data-group-id="A"]')!; // nu öppen (reopen)
    const aNotice = aForm.querySelector('[data-deadline-notice]');
    expect(aNotice).not.toBeNull();
    expect(aNotice!.getAttribute('data-deadline-iso')).toBe('2026-06-14T21:59:00.000Z');
    expect(aNotice).toHaveTextContent(/Tippningen låses/);
    expect(aNotice).toHaveTextContent(/söndag 14 juni kl 23:59/);
  });

  it('EN LADDNING: turneringsdatan laddas exakt en gång, den tips-härledda vyn får den injicerad', () => {
    // T51 Copilot-fynd 5: den simulerade slutspels-vyn laddade tidigare samma
    // turneringsdata IGEN (egen useGroupPredictableData) -> dubbel fetch + extra
    // loading-cykel. Nu skickar värd-vyn ned sin redan-laddade data, så hooken
    // anropas exakt EN gång och sim-sektionen renderas i samma render.
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    expect(useGroupPredictableDataMock).toHaveBeenCalledTimes(1);
    // Sim-sektionen är monterad (ready), driven av den injicerade datan.
    expect(document.querySelector('[data-tips-bracket-section]')).not.toBeNull();
    expect(screen.getByText('Slutspelet ur dina tips')).toBeInTheDocument();
  });

  it('seedar formuläret från mitt befintliga grupp-tips', () => {
    const mine: GroupPrediction = {
      groupId: 'A',
      userId: 'me',
      winnerTeamId: teamCode('MEX'),
      runnerUpTeamId: teamCode('RSA'),
      updatedAt: 't1',
    };
    renderView(
      store({ myGroupPredictions: new Map([['A', mine]]) }),
      new Date('2026-06-10T00:00:00Z')
    );
    const aForm = document.querySelector('[data-group-id="A"]')!;
    const selects = aForm.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('MEX');
    expect((selects[1] as HTMLSelectElement).value).toBe('RSA');
  });
});
