// Tester för LIVEKORTET (Bit 3b). Bevisar: kärnan syns direkt (klocka + ställning +
// skyttar/kort/byten), klock-STATES (live tickar / paus fryser / slut visar etikett),
// "Visa mer" fäller ut statistik + laguppställning (expand/collapse + aria), och a11y
// (region med tillgängligt namn, ExpandToggle:s aria-expanded/-controls). `now` injiceras
// så klock-grenarna är deterministiska (samma princip som computeClock-testerna).

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LiveMatchCard } from './LiveMatchCard';
import type { LiveData, LiveEvent, LiveTeamStatistics, LiveLineup } from '../../data/livescore';

const HOME = 1118; // Nederländerna
const AWAY = 12; // Japan
const SYNC = '2026-06-14T20:00:00.000Z';
const SYNC_MS = Date.parse(SYNC);
const min = (m: number) => m * 60_000;

function goalEvent(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 23,
    extra: null,
    kind: 'goal',
    rawType: 'Goal',
    detail: 'Normal Goal',
    teamApiId: HOME,
    teamName: 'Netherlands',
    playerName: 'Memphis',
    assistName: 'Gakpo',
    cardColor: null,
    ...over,
  };
}

function statBlock(teamApiId: number, possession: string, shots: number): LiveTeamStatistics {
  return {
    teamApiId,
    teamName: teamApiId === HOME ? 'Netherlands' : 'Japan',
    statistics: [
      { type: 'Ball Possession', value: possession },
      { type: 'Total Shots', value: shots },
    ],
  };
}

function lineupBlock(teamApiId: number, formation: string): LiveLineup {
  return {
    teamApiId,
    teamName: teamApiId === HOME ? 'Netherlands' : 'Japan',
    formation,
    startXI: [{ apiPlayerId: 1, name: 'Keeper', number: 1, position: 'G', grid: '1:1' }],
    substitutes: [{ apiPlayerId: 2, name: 'Avbytare', number: 12, position: 'M', grid: null }],
  };
}

function live(over: Partial<LiveData> = {}): LiveData {
  return {
    matchId: 'g-F-1',
    apiFixtureId: 1489376,
    status: 'live',
    elapsedMinute: 29,
    homeGoals: 1,
    awayGoals: 0,
    events: [goalEvent()],
    statistics: [statBlock(HOME, '60%', 8), statBlock(AWAY, '40%', 5)],
    lineups: [lineupBlock(HOME, '4-3-3'), lineupBlock(AWAY, '4-2-3-1')],
    frozen: false,
    lastSyncedAt: SYNC,
    ...over,
  };
}

function renderCard(over: Partial<LiveData> = {}, now = SYNC_MS) {
  return render(
    <LiveMatchCard
      data={live(over)}
      homeName="Nederländerna"
      awayName="Japan"
      homeApiId={HOME}
      now={now}
    />
  );
}

describe('LiveMatchCard, kärnan syns direkt', () => {
  it('visar ställning, målskytt + assist (kärnan, utan att fälla ut)', () => {
    renderCard();
    const card = screen.getByRole('region');
    expect(within(card).getByText('Memphis')).toBeInTheDocument();
    expect(within(card).getByText(/assist: Gakpo/)).toBeInTheDocument();
    // Ställningen finns i en data-hak.
    expect(card.querySelector('[data-live-score]')?.textContent).toContain('1');
  });

  it('region bär ett tillgängligt namn som sammanfattar live-läget', () => {
    renderCard();
    expect(screen.getByRole('region', { name: /Nederländerna 1-0 Japan/i })).toBeInTheDocument();
  });

  it('visar gult OCH rött kort + byte i kärnan (färg-oberoende: ord + sida)', () => {
    renderCard({
      events: [
        goalEvent(),
        goalEvent({
          kind: 'card',
          rawType: 'Card',
          detail: 'Yellow Card',
          cardColor: 'yellow',
          minute: 40,
          playerName: 'De Jong',
        }),
        goalEvent({
          kind: 'card',
          rawType: 'Card',
          detail: 'Red Card',
          cardColor: 'red',
          minute: 70,
          teamApiId: AWAY,
          playerName: 'Endo',
        }),
        goalEvent({
          kind: 'subst',
          rawType: 'subst',
          detail: 'Substitution 1',
          minute: 60,
          playerName: 'Weghorst',
          assistName: 'Memphis',
        }),
      ],
    });
    expect(screen.getByText('De Jong')).toBeInTheDocument();
    expect(screen.getByText(/gult kort/)).toBeInTheDocument();
    expect(screen.getByText('Endo')).toBeInTheDocument();
    expect(screen.getByText(/rött kort/)).toBeInTheDocument();
    expect(screen.getByText('Weghorst')).toBeInTheDocument();
    expect(screen.getByText(/in för Memphis/)).toBeInTheDocument();
  });
});

describe('LiveMatchCard, status-styrd klocka (vattenpaus-säker)', () => {
  it('LIVE tickar mjukt: elapsed 29 + 5 min sedan sync -> "34\'" + tickande punkt', () => {
    renderCard({ status: 'live', elapsedMinute: 29 }, SYNC_MS + min(5));
    const card = screen.getByRole('region');
    expect(within(card).getByText("34'")).toBeInTheDocument();
    expect(card).toHaveAttribute('data-live-ticking', '');
    expect(card.querySelector('[data-live-dot].vm-live-card-dot-ticking')).not.toBeNull();
  });

  it('PAUS FRYSER: 20 min sedan sync visar "Paus", klockan står still (inte 65)', () => {
    renderCard({ status: 'paused', elapsedMinute: 45 }, SYNC_MS + min(20));
    const card = screen.getByRole('region');
    expect(within(card).getByText('Paus')).toBeInTheDocument();
    expect(card).not.toHaveAttribute('data-live-ticking');
    // Pausad punkt finns men pulsar inte.
    expect(card.querySelector('[data-live-dot].vm-live-card-dot-ticking')).toBeNull();
  });

  it('1H elapsed 44 + 5 min -> "45+\'" (hittar aldrig på tilläggstid), slutar ticka', () => {
    renderCard({ status: 'live', elapsedMinute: 44 }, SYNC_MS + min(5));
    expect(screen.getByText("45+'")).toBeInTheDocument();
    expect(screen.getByRole('region')).not.toHaveAttribute('data-live-ticking');
  });

  it('SLUT (finished, frozen): klocka + badge säger "Slut", ingen tick', () => {
    renderCard(
      { status: 'finished', frozen: true, homeGoals: 2, awayGoals: 1 },
      SYNC_MS + min(120)
    );
    const card = screen.getByRole('region');
    expect(card).toHaveAttribute('data-live-status', 'finished');
    // Klockans label (chippet) säger "Slut".
    expect(card.querySelector('[data-live-clock]')?.textContent).toContain('Slut');
    // Badgen markeras som finished.
    expect(card.querySelector('[data-live-badge="finished"]')?.textContent).toBe('Slut');
    expect(card).not.toHaveAttribute('data-live-ticking');
  });
});

describe('LiveMatchCard, "Visa mer" fäller ut statistik + laguppställning', () => {
  it('detaljerna är DOLDA default, "Visa mer"-knappen syns (aria-expanded=false)', () => {
    renderCard();
    const toggle = screen.getByRole('button', { name: /Visa mer/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Statistik')).not.toBeInTheDocument();
    expect(screen.queryByText('Laguppställning')).not.toBeInTheDocument();
  });

  it('klick fäller ut statistik (med värden) + laguppställning (formation)', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    expect(screen.getByText('Statistik')).toBeInTheDocument();
    expect(screen.getByText('Bollinnehav')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Laguppställning')).toBeInTheDocument();
    expect(screen.getByText('4-3-3')).toBeInTheDocument();
    // aria-expanded flippar + panelen är knuten via aria-controls.
    const toggle = screen.getByRole('button', { name: /Visa mindre/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).not.toBeNull();
  });

  it('klick igen fäller ihop (collapse)', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    expect(screen.getByText('Statistik')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Visa mindre/i }));
    expect(screen.queryByText('Statistik')).not.toBeInTheDocument();
  });

  it('ingen "Visa mer" när det inte finns detaljer (tom statistik + lineup)', () => {
    renderCard({ statistics: [], lineups: [] });
    expect(screen.queryByRole('button', { name: /Visa mer/i })).not.toBeInTheDocument();
  });
});

describe('LiveMatchCard, hemma/borta-paring i utfällt läge', () => {
  it('id-matchning ger rätt sida: hemma-statistik = hemmalagets block', () => {
    // Blocken i OMVÄND ordning (away först), id-matchning ska ändå sätta hemma rätt.
    renderCard({
      statistics: [statBlock(AWAY, '40%', 5), statBlock(HOME, '60%', 8)],
    });
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    const possRow = screen.getByText('Bollinnehav').closest('[data-live-stat-row]');
    expect(possRow).not.toBeNull();
    // Hemma-värdet (vänster) ska vara hemmalagets 60%, inte borta-blockets 40%.
    expect(possRow?.querySelector('[data-live-stat-home]')?.textContent).toBe('60%');
    expect(possRow?.querySelector('[data-live-stat-away]')?.textContent).toBe('40%');
  });
});
