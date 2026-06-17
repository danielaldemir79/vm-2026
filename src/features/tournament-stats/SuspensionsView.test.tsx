// Tester för avstängda-vyn (T99, #200). Mockar useCrossMatchEvents + useResultsStore så varje
// tillstånd drivs deterministiskt , vyn härleder via den RENA deriveSuspensions (redan hårt
// testad i suspensions.test.ts), så här bevisar vi PRESENTATIONEN + wiringen:
//   - laddning = role=status, fel = role=alert (fail-loud)
//   - ready med en avstängning: rad med spelare + lag + orsak + "sitter ute"-match
//   - intro flaggar att längden är UPPSKATTAD (Daniels krav: var tydlig)
//   - tom data (inga avstängda) = lugn rad (ingen tom ruta, ingen krasch)
//   - lång lista börjar KOMPRIMERAD (topp-N) + "Visa alla"-utfäll

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SuspensionsView } from './SuspensionsView';
import type { CrossMatchEventsResult } from './use-cross-match-events';
import type { LiveEvent, LiveMatchEvents } from '../../data/livescore';
import type { Match, Team } from '../../domain/types';

const mockEvents = vi.fn<() => CrossMatchEventsResult>();
const mockResults = vi.fn();

vi.mock('./use-cross-match-events', () => ({
  useCrossMatchEvents: () => mockEvents(),
}));
vi.mock('../results', () => ({
  useResultsStore: () => mockResults(),
}));

afterEach(() => {
  cleanup();
  mockEvents.mockReset();
  mockResults.mockReset();
});

/** teamApiId 6 = Brasilien (i bryggan -> app-id 'bra' + flagg-disc). */
function card(color: 'yellow' | 'red', over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 30,
    extra: null,
    kind: 'card',
    rawType: 'Card',
    detail: color === 'yellow' ? 'Yellow Card' : 'Red Card',
    teamApiId: 6,
    teamName: 'Brasilien',
    playerId: 100,
    playerName: 'Försvararen',
    assistId: null,
    assistName: null,
    cardColor: color,
    ...over,
  };
}

function eventsReady(matches: LiveMatchEvents[]): CrossMatchEventsResult {
  return { status: 'ready', matches, error: null };
}

/** En gruppmatch i planen (scheduled = inte spelad). */
function groupMatch(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'bra',
    awayTeamId: 'arg',
    kickoff,
    venue: 'Arena',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'bra', group: 'A' },
  { id: 'arg', name: 'Argentina', code: 'arg', group: 'A' },
];

// Avspark LÅNGT i framtiden (2027) så matcherna garanterat är OSPELADE relativt vyns riktiga
// Date.now() (vyn injicerar ingen klocka , den rena klock-logiken är testad separat med injekterad
// nowMs i suspensions.test.ts). Här bevisar vi presentationen med aktiva (ej avtjänade) poster.
const PLAN = [
  groupMatch('g-A-1', '2027-06-11T19:00:00.000Z'),
  groupMatch('g-A-2', '2027-06-15T19:00:00.000Z'),
];

/** results-store-mock i "ready" med plan + lag. */
function resultsReady(matches: Match[] = PLAN) {
  return { matches, teams: TEAMS, status: 'ready' };
}

describe('SuspensionsView , tillstånd', () => {
  it('LADDNING visar en role=status', () => {
    mockEvents.mockReturnValue({ status: 'loading', matches: [], error: null });
    mockResults.mockReturnValue(resultsReady());
    render(<SuspensionsView />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('FEL fail-loud:ar i en role=alert med feltexten', () => {
    mockEvents.mockReturnValue({ status: 'error', matches: [], error: 'Nätfel' });
    mockResults.mockReturnValue(resultsReady());
    render(<SuspensionsView />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nätfel');
  });

  it('renderar rubrik och en intro som flaggar att längden är UPPSKATTAD', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockResults.mockReturnValue(resultsReady());
    render(<SuspensionsView />);
    expect(screen.getByRole('heading', { name: 'Avstängda spelare' })).toBeInTheDocument();
    // Daniels krav: var tydlig med att längden är en uppskattning.
    expect(screen.getByText(/uppskattning/i)).toBeInTheDocument();
  });
});

describe('SuspensionsView , innehåll', () => {
  it('en avstängning (rött kort) visar spelare, lag, orsak och "sitter ute"-match', () => {
    mockEvents.mockReturnValue(eventsReady([{ matchId: 'g-A-1', events: [card('red')] }]));
    mockResults.mockReturnValue(resultsReady());
    const { container } = render(<SuspensionsView />);
    const row = container.querySelector('[data-suspension-row]');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Försvararen');
    expect(row).toHaveTextContent('Brasilien');
    expect(row).toHaveTextContent('Rött kort');
    // Sitter ute lagets nästa match (g-A-2): etiketten bär den matchen.
    expect(row).toHaveTextContent(/Sitter ute:/);
    expect(row).toHaveTextContent(/Grupp A/);
  });

  it('en avstängning (två gula i skilda matcher) visar orsaken "Två gula kort"', () => {
    mockEvents.mockReturnValue(
      eventsReady([
        { matchId: 'g-A-1', events: [card('yellow')] },
        // andra gula i en match som finns i planen efter g-A-1; behöver en match EFTER den att
        // gälla -> utöka planen med en tredje match.
        { matchId: 'g-A-2', events: [card('yellow')] },
      ])
    );
    mockResults.mockReturnValue(
      resultsReady([...PLAN, groupMatch('g-A-3', '2027-06-20T19:00:00.000Z')])
    );
    const { container } = render(<SuspensionsView />);
    const row = container.querySelector('[data-suspension-row]');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Två gula kort');
  });

  it('tom data (inga avstängda) visar en lugn rad, ingen tom ruta', () => {
    mockEvents.mockReturnValue(eventsReady([{ matchId: 'g-A-1', events: [] }]));
    mockResults.mockReturnValue(resultsReady());
    const { container } = render(<SuspensionsView />);
    expect(container.querySelector('[data-suspensions-empty]')).toBeInTheDocument();
    expect(container.querySelector('[data-suspension-row]')).toBeNull();
  });

  it('lång lista börjar KOMPRIMERAD (topp-5) med en "Visa alla"-utfäll', () => {
    // 7 distinkta spelare med rött kort i match 1 -> 7 avstängningar; komprimerat visas 5.
    const events: LiveEvent[] = [];
    for (let i = 1; i <= 7; i++) {
      events.push(card('red', { playerId: i, playerName: `Spelare ${i}` }));
    }
    mockEvents.mockReturnValue(eventsReady([{ matchId: 'g-A-1', events }]));
    mockResults.mockReturnValue(resultsReady());
    const { container } = render(<SuspensionsView />);
    const previewRows = container.querySelectorAll(
      '[data-suspensions-preview] [data-suspension-row]'
    );
    expect(previewRows.length).toBe(5);
    expect(screen.getByRole('button', { name: /Visa alla 7/ })).toBeInTheDocument();
  });
});
