import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PredictionsView } from './PredictionsView';
import { PredictionsStoreContext, type PredictionsStore } from './predictions-context';
import type { Prediction } from '../../data/predictions';
import type { Match, Team } from '../../domain/types';

// Mocka data-laddnings-hooken så vyn matas med deterministiska matcher/lag utan
// att gå via datakällan (vi testar vyns LÄGEN, inte I/O:t som testas på annat håll).
const dataState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  matches: [] as Match[],
  teams: [] as Team[],
  error: null as string | null,
}));
vi.mock('./use-predictable-matches', () => ({
  usePredictableData: () => dataState,
}));

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
];

function match(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  };
}

function store(partial: Partial<PredictionsStore>): PredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myPredictions: new Map(),
    savePrediction: vi.fn().mockResolvedValue(undefined),
    ...partial,
  };
}

function renderView(s: PredictionsStore, now: Date, children?: ReactNode) {
  return render(
    <PredictionsStoreContext.Provider value={s}>
      <PredictionsView now={now} />
      {children}
    </PredictionsStoreContext.Provider>
  );
}

const NOW = new Date('2026-06-15T12:00:00.000Z');

beforeEach(() => {
  dataState.status = 'ready';
  dataState.matches = [];
  dataState.teams = TEAMS;
  dataState.error = null;
});

describe('PredictionsView', () => {
  it('UTAN aktivt rum: visar "gå med i ett rum för att tippa"', () => {
    renderView(store({ enabled: false, activeRoomId: null }), NOW);
    expect(screen.getByText(/Gå med i ett rum för att tippa/)).toBeInTheDocument();
    // Ingen tips-lista OCH inget tips-formulär i det läget (tips är per rum).
    expect(document.querySelector('[data-predictions-list]')).toBeNull();
    expect(document.querySelectorAll('[data-prediction-form]')).toHaveLength(0);
  });

  it('READY: listar tippbara matcher (kommande överst), ett formulär per match', () => {
    dataState.matches = [
      match('g-A-3', '2026-06-25T18:00:00.000Z'),
      match('g-A-1', '2026-06-20T18:00:00.000Z'),
    ];
    renderView(store({}), NOW);
    const forms = document.querySelectorAll('[data-prediction-form]');
    expect(forms).toHaveLength(2);
    // Tidigast först: g-A-1 (20 juni) före g-A-3 (25 juni).
    expect((forms[0] as HTMLElement).getAttribute('data-match-id')).toBe('g-A-1');
    expect((forms[1] as HTMLElement).getAttribute('data-match-id')).toBe('g-A-3');
  });

  it('LÅST: en match med passerad avspark renderas som låst form', () => {
    dataState.matches = [match('g-A-1', '2026-06-14T18:00:00.000Z')]; // före NOW
    renderView(store({}), NOW);
    const form = document.querySelector('[data-prediction-form]') as HTMLElement;
    expect(form.getAttribute('data-prediction-locked')).toBe('true');
    expect(screen.getByText(/Tipset är låst/)).toBeInTheDocument();
  });

  // C1-regression: låset räknas om NÄR TIDEN PASSERAR AVSPARK, utan omladdning. En
  // avspark passerar mitt på dagen, så en stabil-inom-dagen-tick (useTodayKey) räcker
  // inte; minut-ticken (use-deadline-tick) måste flippa låset. Vi använder falska
  // timers + en styrd systemklocka och stegar fram förbi avspark.
  it('LÅST räknas om när tiden passerar avspark (öppen -> låst utan omladdning)', () => {
    vi.useFakeTimers();
    try {
      const kickoff = '2026-06-15T15:00:00.000Z';
      const before = new Date('2026-06-15T14:59:00.000Z'); // en minut före avspark
      vi.setSystemTime(before);
      dataState.matches = [match('g-A-1', kickoff)];

      renderView(store({}), before);
      const formBefore = document.querySelector('[data-prediction-form]') as HTMLElement;
      // Före avspark: öppen, dvs låst-attributet är FRÅNVARANDE (formuläret
      // sätter bara data-prediction-locked="true" när det är låst). Räknaren
      // säger 1 match öppen.
      expect(formBefore.getAttribute('data-prediction-locked')).toBeNull();
      expect(screen.getByText(/1 match öppna att tippa/)).toBeInTheDocument();

      // Tiden passerar avspark; minut-ticken bumpar nu:et och låset ska räknas om.
      act(() => {
        vi.setSystemTime(new Date('2026-06-15T15:01:00.000Z'));
        vi.advanceTimersByTime(60_000);
      });

      const formAfter = document.querySelector('[data-prediction-form]') as HTMLElement;
      expect(formAfter.getAttribute('data-prediction-locked')).toBe('true');
      // Inga öppna matcher kvar -> räknaren visas inte längre (den döljs vid 0).
      expect(screen.queryByText(/öppna att tippa/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mitt tips syns: en redan tippad match seedar formuläret', () => {
    dataState.matches = [match('g-A-1', '2026-06-20T18:00:00.000Z')];
    const mine: Prediction = {
      matchId: 'g-A-1',
      userId: 'me',
      homeGoals: 4,
      awayGoals: 0,
      updatedAt: 't',
    };
    renderView(store({ myPredictions: new Map([['g-A-1', mine]]) }), NOW);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('4');
    expect(inputs[1].value).toBe('0');
  });

  it('FEL-VÄG: store-status error -> role=alert (fail loud)', () => {
    renderView(store({ status: 'error', error: 'kunde inte ladda' }), NOW);
    expect(screen.getByRole('alert')).toHaveTextContent(/kunde inte ladda/);
  });

  it('LADDNING: visar en laddnings-status', () => {
    renderView(store({ status: 'loading' }), NOW);
    expect(screen.getByRole('status')).toHaveTextContent(/Laddar/);
  });
});
