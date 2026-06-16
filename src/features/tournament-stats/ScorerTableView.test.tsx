// Tester för skytteliga-vyn (T87, #179). Mockar useCrossMatchEvents så varje tillstånd
// (loading/error/ready) + datamängd drivs deterministiskt , vyn själv aggregerar via den
// rena aggregateScoring (redan hårt testad), så här bevisar vi PRESENTATIONEN:
//   - laddning = role=status, fel = role=alert (fail-loud)
//   - ready med mål: skytteligan renderas, rad bär spelare + lag + mål, straff-notering
//   - tom data (inga mål än) = lugn rad (ingen tom ruta, ingen krasch)
//   - segment-växel byter till assist-ligan
//   - lång lista börjar KOMPRIMERAD (topp-N) + "Visa alla"-utfäll finns

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { ScorerTableView } from './ScorerTableView';
import type { CrossMatchEventsResult } from './use-cross-match-events';
import type { LiveMatchEvents, LiveEvent } from '../../data/livescore';

const mockUseCrossMatchEvents = vi.fn<() => CrossMatchEventsResult>();
vi.mock('./use-cross-match-events', () => ({
  useCrossMatchEvents: () => mockUseCrossMatchEvents(),
}));

afterEach(() => {
  cleanup();
  mockUseCrossMatchEvents.mockReset();
});

/** Bygg ett mål-event (teamApiId 6 = Brasilien, finns i team-bridge -> en flagg-disc). */
function goal(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 10,
    extra: null,
    kind: 'goal',
    rawType: 'Goal',
    detail: 'Normal Goal',
    teamApiId: 6,
    teamName: 'Brasilien',
    playerId: 100,
    playerName: 'Stjärnskytten',
    assistId: null,
    assistName: null,
    cardColor: null,
    ...over,
  };
}

function ready(matches: LiveMatchEvents[]): CrossMatchEventsResult {
  return { status: 'ready', matches, error: null };
}

describe('ScorerTableView , tillstånd', () => {
  it('LADDNING visar en role=status', () => {
    mockUseCrossMatchEvents.mockReturnValue({ status: 'loading', matches: [], error: null });
    render(<ScorerTableView />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('FEL fail-loud:ar i en role=alert med feltexten', () => {
    mockUseCrossMatchEvents.mockReturnValue({
      status: 'error',
      matches: [],
      error: 'Nätfel',
    });
    render(<ScorerTableView />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nätfel');
  });

  it('renderar i ett etiketterat avsnitt med rubriken Skytteliga', () => {
    mockUseCrossMatchEvents.mockReturnValue(ready([]));
    render(<ScorerTableView />);
    expect(screen.getByRole('heading', { name: 'Skytteliga' })).toBeInTheDocument();
  });
});

describe('ScorerTableView , innehåll', () => {
  it('visar en målskytt med lag, mål och straff-notering', () => {
    mockUseCrossMatchEvents.mockReturnValue(
      ready([
        {
          matchId: 'm1',
          events: [
            goal({ playerId: 100, playerName: 'Stjärnskytten', detail: 'Normal Goal' }),
            goal({ playerId: 100, playerName: 'Stjärnskytten', detail: 'Penalty' }),
          ],
        },
      ])
    );
    const { container } = render(<ScorerTableView />);
    const row = container.querySelector('[data-scorer-row][data-player-id="100"]');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Stjärnskytten');
    expect(row).toHaveTextContent('Brasilien');
    expect(row).toHaveTextContent('2 mål');
    expect(row).toHaveTextContent('varav 1 straff'); // straff-notering (R2)
    // Placeringen är tillgänglig.
    expect(within(row as HTMLElement).getByLabelText('Placering 1')).toBeInTheDocument();
  });

  it('tom data (inga mål än) visar en lugn rad, ingen tom ruta', () => {
    mockUseCrossMatchEvents.mockReturnValue(ready([{ matchId: 'm1', events: [] }]));
    const { container } = render(<ScorerTableView />);
    expect(container.querySelector('[data-scorer-empty]')).toBeInTheDocument();
    // Inga rad-element.
    expect(container.querySelector('[data-scorer-row]')).toBeNull();
  });

  it('segment-växel byter till assist-ligan', () => {
    mockUseCrossMatchEvents.mockReturnValue(
      ready([
        {
          matchId: 'm1',
          events: [
            goal({ playerId: 200, playerName: 'Målgör', assistId: 300, assistName: 'Passaren' }),
          ],
        },
      ])
    );
    const { container } = render(<ScorerTableView />);
    // Default = skytteligan: målskytten syns.
    expect(container.querySelector('[data-scorer-row][data-player-id="200"]')).not.toBeNull();

    // Klicka "Assist"-fliken -> assist-ligan: passaren (300) syns, målskytten (200) inte.
    fireEvent.click(screen.getByRole('tab', { name: /Assist/ }));
    expect(container.querySelector('[data-scorer-row][data-player-id="300"]')).not.toBeNull();
    expect(container.querySelector('[data-scorer-row][data-player-id="200"]')).toBeNull();
  });

  it('lång lista börjar KOMPRIMERAD (topp-5) med en "Visa alla"-utfäll', () => {
    // 7 distinkta skyttar (1 mål var) -> komprimerat visas 5, en "Visa alla 7"-knapp finns.
    const events: LiveEvent[] = [];
    for (let i = 1; i <= 7; i++) {
      events.push(goal({ playerId: i, playerName: `Skytt ${i}` }));
    }
    mockUseCrossMatchEvents.mockReturnValue(ready([{ matchId: 'm1', events }]));
    const { container } = render(<ScorerTableView />);
    // Komprimerat: exakt COLLAPSED_VISIBLE (5) rader i previewn, inte alla 7.
    const previewRows = container.querySelectorAll('[data-scorer-preview] [data-scorer-row]');
    expect(previewRows.length).toBe(5);
    // "Visa alla 7"-utfällskontroll finns (den delade CollapsibleLists expand-knapp).
    expect(screen.getByRole('button', { name: /Visa alla 7/ })).toBeInTheDocument();
  });
});
