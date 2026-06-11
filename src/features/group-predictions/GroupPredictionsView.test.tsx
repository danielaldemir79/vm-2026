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

// Mocka data-laddnings-hooken (vi testar vyns LÄGEN, inte I/O:t).
const dataState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  groups: [] as Group[],
  teams: [] as Team[],
  matches: [] as Match[],
  error: null as string | null,
}));
vi.mock('./use-group-predictable-data', () => ({
  useGroupPredictableData: () => dataState,
}));

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
  { id: 'can', name: 'Kanada', code: 'CAN', group: 'B' },
  { id: 'bih', name: 'Bosnien', code: 'BIH', group: 'B' },
];

const GROUPS: Group[] = [
  { id: 'A', teamIds: ['mex', 'rsa'] },
  { id: 'B', teamIds: ['can', 'bih'] },
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
  gmatch('g-A-1', '2026-06-11T19:00:00.000Z'),
  gmatch('g-B-1', '2026-06-12T19:00:00.000Z'),
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

  it('READY: renderar ett formulär per grupp (A + B)', () => {
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    const forms = document.querySelectorAll('[data-group-prediction-form]');
    expect(forms).toHaveLength(2);
    expect(document.querySelector('[data-group-id="A"]')).not.toBeNull();
    expect(document.querySelector('[data-group-id="B"]')).not.toBeNull();
  });

  it('öppen-räknare: visar antal grupper öppna att tippa', () => {
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByText(/2 grupper öppna att tippa/)).toBeInTheDocument();
  });

  it('PER-GRUPP-LÅS: grupp A låst men B öppen mellan deadlines (1 öppen)', () => {
    renderView(store({}), new Date('2026-06-12T10:00:00Z')); // efter g-A-1, före g-B-1
    // A är låst (låst-etikett finns), B öppen (1 öppen kvar).
    const aForm = document.querySelector('[data-group-id="A"]');
    expect(aForm?.querySelector('[data-group-prediction-lock]')).not.toBeNull();
    expect(screen.getByText(/1 grupp öppen att tippa/)).toBeInTheDocument();
  });

  it('AC#3 DEADLINE: öppen grupp visar EXAKT deadline (gruppens första match), låst grupp gör det inte', () => {
    renderView(store({}), new Date('2026-06-12T10:00:00Z')); // efter g-A-1, före g-B-1
    const aForm = document.querySelector('[data-group-id="A"]')!; // låst
    const bForm = document.querySelector('[data-group-id="B"]')!; // öppen
    // Öppna gruppen B bär en deadline-rad ur SAMMA ISO som låset (g-B-1 = 12 juni 19:00Z
    // = 21:00 svensk), den låsta gruppen A har INGEN öppen deadline-rad (låst-etikett i stället).
    const bNotice = bForm.querySelector('[data-deadline-notice]');
    expect(bNotice).not.toBeNull();
    expect(bNotice!.getAttribute('data-deadline-iso')).toBe('2026-06-12T19:00:00.000Z');
    expect(bNotice).toHaveTextContent(/Tippningen låses/);
    expect(bNotice).toHaveTextContent(/12 juni kl 21:00/);
    expect(aForm.querySelector('[data-deadline-notice]')).toBeNull();
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
