import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketPredictionsView } from './BracketPredictionsView';
import {
  BracketPredictionsStoreContext,
  type BracketPredictionsStore,
} from './bracket-predictions-context';
import type { BracketPrediction } from '../../data/predictions';
import type { BracketMatchState, BracketSlotState, BracketState } from '../bracket';
import type { Match, Team } from '../../domain/types';
import { teamCode } from '../../domain/team-code';

const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A' },
  { id: 'arg', name: 'Argentina', code: 'ARG', group: 'B' },
  { id: 'fra', name: 'Frankrike', code: 'FRA', group: 'C' },
  { id: 'esp', name: 'Spanien', code: 'ESP', group: 'D' },
];

function slot(
  matchId: string,
  side: 'home' | 'away',
  stage: BracketSlotState['stage'],
  teamId: string | null
): BracketSlotState {
  return {
    id: `${matchId}-${side}`,
    matchId,
    side,
    stage,
    nextSlotId: null,
    resolution: teamId !== null ? 'resolved' : 'tbd',
    label: teamId ?? 'okänt',
    teamId,
    candidateTeamIds: [],
  };
}

function bracketMatch(
  matchId: string,
  stage: BracketSlotState['stage'],
  home: string | null,
  away: string | null
): BracketMatchState {
  return {
    matchId,
    stage,
    home: slot(matchId, 'home', stage, home),
    away: slot(matchId, 'away', stage, away),
    winnerSlotId: null,
  };
}

function kickoffMatch(id: string, kickoff: string): Match {
  return {
    id,
    stage: id.startsWith('g-') ? 'group' : 'round-of-32',
    groupId: id.startsWith('g-') ? (id.charAt(2) as Match['groupId']) : null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  } as Match;
}

const MATCHES: Match[] = [
  kickoffMatch('g-A-1', '2026-06-11T16:00:00.000Z'),
  kickoffMatch('M73', '2026-07-01T16:00:00.000Z'),
  kickoffMatch('M74', '2026-07-02T16:00:00.000Z'),
];

const BRACKET: BracketState = {
  matches: [
    bracketMatch('M73', 'round-of-32', 'bra', 'arg'), // båda kända -> tippbar
    bracketMatch('M74', 'round-of-32', 'fra', null), // okänd motståndare -> TBD
  ],
  locked: true,
};

// Mocka data-laddnings-hooken (vi testar vyns LÄGEN, inte I/O:t).
const dataState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  bracket: null as BracketState | null,
  teams: [] as Team[],
  matches: [] as Match[],
  error: null as string | null,
}));
vi.mock('./use-bracket-predictable-data', () => ({
  useBracketPredictableData: () => dataState,
}));

function store(partial: Partial<BracketPredictionsStore>): BracketPredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myBracketPredictions: new Map(),
    saveBracketPrediction: vi.fn().mockResolvedValue(undefined),
    ...partial,
  };
}

function renderView(s: BracketPredictionsStore, now: Date) {
  return render(
    <BracketPredictionsStoreContext.Provider value={s}>
      <BracketPredictionsView now={now} />
    </BracketPredictionsStoreContext.Provider>
  );
}

beforeEach(() => {
  dataState.status = 'ready';
  dataState.bracket = BRACKET;
  dataState.teams = TEAMS;
  dataState.matches = MATCHES;
  dataState.error = null;
});

describe('BracketPredictionsView', () => {
  it('UTAN aktivt rum: visar "gå med i ett rum" och inga slot-formulär', () => {
    renderView(store({ enabled: false, activeRoomId: null }), new Date('2026-06-01T00:00:00Z'));
    expect(screen.getByText(/Gå med i ett rum för att tippa slutspelet/)).toBeInTheDocument();
    expect(document.querySelector('[data-bracket-prediction-form]')).toBeNull();
  });

  it('fel-väg: store-error visas som alert', () => {
    renderView(store({ status: 'error', error: 'trasig' }), new Date('2026-06-01T00:00:00Z'));
    expect(screen.getByRole('alert')).toHaveTextContent('trasig');
  });

  it('laddning: visar laddnings-status', () => {
    renderView(store({ status: 'loading' }), new Date('2026-06-01T00:00:00Z'));
    expect(screen.getByText(/Laddar slutspelet att tippa/)).toBeInTheDocument();
  });

  it('READY: renderar champion-väljaren + ett formulär per slot', () => {
    renderView(store({}), new Date('2026-06-01T00:00:00Z'));
    expect(document.querySelector('[data-bracket-predictions-champion]')).not.toBeNull();
    // M73 (tippbar) + M74 (TBD) + champion = 3 formulär-element totalt.
    expect(document.querySelectorAll('[data-bracket-prediction-form]')).toHaveLength(3);
    expect(document.querySelector('[data-slot-id="M73"]')).not.toBeNull();
    expect(document.querySelector('[data-slot-id="M74"]')).not.toBeNull();
    expect(document.querySelector('[data-slot-id="champion"]')).not.toBeNull();
  });

  it('OKÄNDA LAG: M74 (okänd motståndare) renderas som TBD, inte en väljare', () => {
    renderView(store({}), new Date('2026-06-01T00:00:00Z'));
    const m74 = document.querySelector('[data-slot-id="M74"]')!;
    expect(m74.hasAttribute('data-bracket-prediction-tbd')).toBe(true);
    expect(m74.querySelector('select')).toBeNull();
    expect(m74).toHaveTextContent(/Lagen avgörs av tidigare resultat/);
  });

  it('TIPPBAR SLOT: M73 har en väljare med matchens två lag (som code)', () => {
    renderView(store({}), new Date('2026-06-01T00:00:00Z'));
    const m73 = document.querySelector('[data-slot-id="M73"]')!;
    const options = [...m73.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    // Tom platshållare + de två lagens CODE (versal, F1-seamen).
    expect(options).toEqual(['', 'BRA', 'ARG']);
  });

  it('öppen-räknare: champion + M73 öppna (M74 är TBD), visar "2 slots öppna"', () => {
    renderView(store({}), new Date('2026-06-01T00:00:00Z'));
    expect(screen.getByText(/2 slots öppna att tippa/)).toBeInTheDocument();
  });

  it('PER-SLOT-LÅS: M73 låst efter sin avspark (lås-etikett)', () => {
    renderView(store({}), new Date('2026-07-01T18:00:00.000Z')); // efter M73-avspark
    const m73 = document.querySelector('[data-slot-id="M73"]')!;
    expect(m73.querySelector('[data-bracket-prediction-lock]')).not.toBeNull();
  });

  it('CHAMPION-LÅS: efter turneringsstart (g-A-1) är champion låst', () => {
    renderView(store({}), new Date('2026-06-11T18:00:00.000Z'));
    const champion = document.querySelector('[data-slot-id="champion"]')!;
    expect(champion.querySelector('[data-bracket-prediction-lock]')).not.toBeNull();
  });

  it('seedar champion-väljaren från mitt befintliga tips', () => {
    const mine: BracketPrediction = {
      slotId: 'champion',
      userId: 'me',
      advancingTeamId: teamCode('ESP'),
      updatedAt: 't1',
    };
    renderView(
      store({ myBracketPredictions: new Map([['champion', mine]]) }),
      new Date('2026-06-01T00:00:00Z')
    );
    const champion = document.querySelector('[data-slot-id="champion"]')!;
    expect((champion.querySelector('select') as HTMLSelectElement).value).toBe('ESP');
  });
});
