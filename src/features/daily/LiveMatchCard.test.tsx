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
    playerId: null,
    playerName: 'Memphis',
    assistId: null,
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
    coachName: null,
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
      homeCode="NED"
      awayCode="JPN"
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

  it('lägger ASSISTEN på en EGEN rad under skytten (Daniels spec, hierarki)', () => {
    renderCard();
    const goal = screen.getByRole('region').querySelector('[data-live-goal]');
    expect(goal).not.toBeNull();
    // Skytten finns; assisten ligger i ett SEPARAT element (data-live-goal-assist),
    // inte inline på skytte-raden, så de aldrig trängs ihop.
    const assist = goal?.querySelector('[data-live-goal-assist]');
    expect(assist).not.toBeNull();
    expect(assist?.textContent).toMatch(/assist: Gakpo/);
  });

  it('bär lag-tillhörighet via SIDAN på mål-raden (vänster = hemma), inte en kod-bricka', () => {
    renderCard();
    const goal = screen.getByRole('region').querySelector('[data-live-goal]');
    expect(goal).not.toBeNull();
    // Lag-tillhörigheten bärs nu av POSITIONEN (sidan), inte en NED/JPN-bricka på raden.
    // Hemma-målet ligger i HEMMA-cellen (vänster) och har data-live-goal-side="home".
    expect(goal?.getAttribute('data-live-goal-side')).toBe('home');
    expect(goal?.querySelector('[data-live-event-cell="home"]')).not.toBeNull();
    expect(goal?.querySelector('[data-live-event-cell="away"]')).toBeNull();
    // Ingen kod-bricka på själva mål-/kort-raden längre (den lever kvar i byten-blocket).
    expect(goal?.querySelector('[data-live-event-team]')).toBeNull();
  });

  it('visar gult OCH rött kort i kärnan: FÄRG bär betydelsen, ingen kort-TEXT', () => {
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
      ],
    });
    const card = screen.getByRole('region');
    // Spelarna + korten syns i kärnan (utan att fälla ut).
    expect(within(card).getByText('De Jong')).toBeInTheDocument();
    expect(within(card).getByText('Endo')).toBeInTheDocument();
    const yellow = card.querySelector('[data-live-card-color="yellow"]');
    const red = card.querySelector('[data-live-card-color="red"]');
    expect(yellow).not.toBeNull();
    expect(red).not.toBeNull();
    // Färgad kort-ikon finns per kort (gul/röd), den BÄR betydelsen.
    expect(yellow?.querySelector('.vm-live-card-pip-yellow')).not.toBeNull();
    expect(red?.querySelector('.vm-live-card-pip-red')).not.toBeNull();
  });

  it('kort: ingen synlig "gult/rött kort"-text, men a11y-etikett finns (sr-only)', () => {
    renderCard({
      events: [
        goalEvent({
          kind: 'card',
          rawType: 'Card',
          detail: 'Yellow Card',
          cardColor: 'yellow',
          minute: 40,
          playerName: 'De Jong',
        }),
      ],
    });
    const card = screen.getByRole('region');
    const pip = card.querySelector('[data-live-card-color="yellow"] .vm-live-card-pip');
    // A11y: en dold etikett inne i ikonen säger "gult kort" för skärmläsare.
    const srLabel = pip?.querySelector('.sr-only');
    expect(srLabel?.textContent).toBe('gult kort');
    // Men kort-RADEN bär ingen synlig "gult kort"-löptext bredvid spelaren.
    const row = card.querySelector('[data-live-card-color="yellow"]') as HTMLElement;
    // textContent rymmer sr-only (den finns i DOM), så vi kollar att den SYNLIGA
    // spelar-cellen inte upprepar "gult kort".
    const playerCell = within(row).getByText('De Jong');
    expect(playerCell.textContent).toBe('De Jong');
  });

  it('byten ligger INTE i kärnan utan längst ned i "Visa mer" (Daniels ordning)', () => {
    renderCard({
      events: [
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
    // Innan utfällning: bytet syns inte (det är detalj, inte kärna).
    expect(screen.queryByText('Weghorst')).not.toBeInTheDocument();
    expect(screen.queryByText('Byten')).not.toBeInTheDocument();
    // Fäll ut -> bytet visas, med in-spelaren (Weghorst) och ut-spelaren (Memphis) STAPLADE.
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    expect(screen.getByText('Byten')).toBeInTheDocument();
    const sub = screen.getByText('Weghorst').closest('[data-live-sub]');
    expect(sub).not.toBeNull();
    expect(sub?.querySelector('[data-live-sub-in]')?.textContent).toMatch(/Weghorst/);
    expect(sub?.querySelector('[data-live-sub-out]')?.textContent).toMatch(/Memphis/);
  });
});

describe('LiveMatchCard, SPEGLAT förlopp (hemma vänster | borta höger)', () => {
  it('mål: hemmalagets mål hamnar i VÄNSTER cell, bortalagets i HÖGER (Daniels feedback)', () => {
    renderCard({
      events: [
        goalEvent({ teamApiId: HOME, playerName: 'Memphis', minute: 23 }),
        goalEvent({ teamApiId: AWAY, playerName: 'Mitoma', minute: 55 }),
      ],
    });
    const card = screen.getByRole('region');
    const homeGoal = card.querySelector('[data-live-goal][data-live-goal-side="home"]');
    const awayGoal = card.querySelector('[data-live-goal][data-live-goal-side="away"]');
    expect(homeGoal).not.toBeNull();
    expect(awayGoal).not.toBeNull();
    // Hemma-målet ligger i HEMMA-cellen (vänster kolumn), inte borta-cellen.
    const homeCell = homeGoal?.querySelector('[data-live-event-cell="home"]');
    expect(homeCell).not.toBeNull();
    expect(homeGoal?.querySelector('[data-live-event-cell="away"]')).toBeNull();
    expect(homeCell?.textContent).toContain('Memphis');
    // Borta-målet ligger i BORTA-cellen (höger kolumn), inte hemma-cellen.
    const awayCell = awayGoal?.querySelector('[data-live-event-cell="away"]');
    expect(awayCell).not.toBeNull();
    expect(awayGoal?.querySelector('[data-live-event-cell="home"]')).toBeNull();
    expect(awayCell?.textContent).toContain('Mitoma');
  });

  it('kort: hemmalagets kort i VÄNSTER cell, bortalagets i HÖGER (spegel, som statistiken)', () => {
    renderCard({
      events: [
        goalEvent({
          kind: 'card',
          rawType: 'Card',
          detail: 'Yellow Card',
          cardColor: 'yellow',
          minute: 40,
          teamApiId: HOME,
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
      ],
    });
    const card = screen.getByRole('region');
    const yellow = card.querySelector('[data-live-card-color="yellow"]');
    const red = card.querySelector('[data-live-card-color="red"]');
    // Hemmalagets gula kort -> vänster (hemma-cellen).
    expect(yellow?.getAttribute('data-live-event-side')).toBe('home');
    expect(yellow?.querySelector('[data-live-event-cell="home"]')?.textContent).toContain(
      'De Jong'
    );
    expect(yellow?.querySelector('[data-live-event-cell="away"]')).toBeNull();
    // Bortalagets röda kort -> höger (borta-cellen).
    expect(red?.getAttribute('data-live-event-side')).toBe('away');
    expect(red?.querySelector('[data-live-event-cell="away"]')?.textContent).toContain('Endo');
    expect(red?.querySelector('[data-live-event-cell="home"]')).toBeNull();
  });

  it('assist hamnar på SAMMA sida som skytten (hemma -> vänster, borta -> höger)', () => {
    renderCard({
      events: [
        goalEvent({ teamApiId: AWAY, playerName: 'Mitoma', assistName: 'Kubo', minute: 55 }),
      ],
    });
    const awayGoal = screen
      .getByRole('region')
      .querySelector('[data-live-goal][data-live-goal-side="away"]');
    const assist = awayGoal?.querySelector('[data-live-goal-assist]') as HTMLElement | null;
    expect(assist).not.toBeNull();
    expect(assist?.textContent).toMatch(/assist: Kubo/);
    // Finlinjering: assisten ligger i samma text-block som skytten, INNE i borta-cellen
    // (höger), så den linjerar exakt under namnet på samma sida (ingen egen grid längre).
    expect(awayGoal?.querySelector('[data-live-event-cell="away"]')?.contains(assist!)).toBe(true);
    expect(awayGoal?.querySelector('[data-live-event-cell="home"]')).toBeNull();
  });

  it('minuten står i en central spine, tydlig per rad', () => {
    renderCard({
      events: [goalEvent({ teamApiId: HOME, playerName: 'Memphis', minute: 23, extra: null })],
    });
    const homeGoal = screen
      .getByRole('region')
      .querySelector('[data-live-goal][data-live-goal-side="home"]');
    // Minuten finns på raden (spine), tydligt formaterad ("23'").
    expect(homeGoal?.textContent).toContain("23'");
  });

  it('byten: hemmalagets byte i VÄNSTER cell, bortalagets i HÖGER (samma spegel som mål/kort)', () => {
    renderCard({
      events: [
        goalEvent({
          kind: 'subst',
          rawType: 'subst',
          detail: 'Substitution 1',
          minute: 60,
          teamApiId: HOME,
          playerName: 'Weghorst',
          assistName: 'Memphis',
        }),
        goalEvent({
          kind: 'subst',
          rawType: 'subst',
          detail: 'Substitution 2',
          minute: 75,
          teamApiId: AWAY,
          playerName: 'Asano',
          assistName: 'Mitoma',
        }),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    const homeSub = screen
      .getByRole('region')
      .querySelector('[data-live-sub][data-live-sub-side="home"]');
    const awaySub = screen
      .getByRole('region')
      .querySelector('[data-live-sub][data-live-sub-side="away"]');
    expect(homeSub).not.toBeNull();
    expect(awaySub).not.toBeNull();
    // Hemma-bytet ligger i HEMMA-cellen (vänster kolumn), inte borta-cellen, och bär både
    // in- (Weghorst) och ut-spelaren (Memphis) STAPLADE på sin sida.
    const homeCell = homeSub?.querySelector('[data-live-event-cell="home"]');
    expect(homeCell).not.toBeNull();
    expect(homeSub?.querySelector('[data-live-event-cell="away"]')).toBeNull();
    expect(homeCell?.querySelector('[data-live-sub-in]')?.textContent).toMatch(/Weghorst/);
    expect(homeCell?.querySelector('[data-live-sub-out]')?.textContent).toMatch(/Memphis/);
    // Borta-bytet ligger i BORTA-cellen (höger kolumn), inte hemma-cellen.
    const awayCell = awaySub?.querySelector('[data-live-event-cell="away"]');
    expect(awayCell).not.toBeNull();
    expect(awaySub?.querySelector('[data-live-event-cell="home"]')).toBeNull();
    expect(awayCell?.querySelector('[data-live-sub-in]')?.textContent).toMatch(/Asano/);
    expect(awayCell?.querySelector('[data-live-sub-out]')?.textContent).toMatch(/Mitoma/);
    // Ingen lag-kod-bricka på byte-raderna längre (sidan bär laget, som på mål/kort).
    expect(homeSub?.querySelector('[data-live-event-team]')).toBeNull();
    expect(awaySub?.querySelector('[data-live-event-team]')).toBeNull();
    // Minuten ligger i den centrala spinen på varje byte-rad (tydlig per rad).
    expect(homeSub?.textContent).toContain("60'");
    expect(awaySub?.textContent).toContain("75'");
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

describe('LiveMatchCard, a11y: artig live-region annonserar mål/slut', () => {
  const announceOf = () => screen.getByRole('region').querySelector('[data-live-announce]');

  it('speglar ställningen i en aria-live="polite"-region medan matchen är live', () => {
    renderCard({ status: 'live', homeGoals: 1, awayGoals: 0 });
    const announce = announceOf();
    expect(announce).not.toBeNull();
    expect(announce).toHaveAttribute('aria-live', 'polite');
    expect(announce).toHaveAttribute('aria-atomic', 'true');
    expect(announce?.textContent).toMatch(/Nederländerna 1-0 Japan/);
  });

  it('uppdaterar annonsen när ett mål faller (ställningen ändras 1-0 -> 1-1)', () => {
    const { rerender } = renderCard({ status: 'live', homeGoals: 1, awayGoals: 0 });
    expect(announceOf()?.textContent).toMatch(/1-0/);
    rerender(
      <LiveMatchCard
        data={live({ status: 'live', homeGoals: 1, awayGoals: 1 })}
        homeName="Nederländerna"
        awayName="Japan"
        homeApiId={HOME}
        homeCode="NED"
        awayCode="JPN"
        now={SYNC_MS}
      />
    );
    expect(announceOf()?.textContent).toMatch(/1-1/);
  });

  it('EXKLUDERAR den tickande klockan (minuten får inte spamma uppläsningar)', () => {
    // Klockan visar "34'" på kortet, men annonsen bär BARA ställningen (ingen minut),
    // så en minut-tick var 60:e sekund inte triggar en ny uppläsning.
    renderCard({ status: 'live', elapsedMinute: 29 }, SYNC_MS + min(5));
    expect(within(screen.getByRole('region')).getByText("34'")).toBeInTheDocument();
    expect(announceOf()?.textContent).not.toMatch(/\d+\+?'/);
  });

  it('annonserar SLUTRESULTAT när matchen är slut', () => {
    renderCard(
      { status: 'finished', frozen: true, homeGoals: 2, awayGoals: 1 },
      SYNC_MS + min(120)
    );
    expect(announceOf()?.textContent).toMatch(/Slutresultat: Nederländerna 2-1 Japan/);
  });

  it('är TOM före avspark (scheduled): inget pågående skeende att annonsera', () => {
    renderCard({ status: 'scheduled', homeGoals: 0, awayGoals: 0 });
    const announce = announceOf();
    expect(announce).not.toBeNull();
    expect(announce?.textContent).toBe('');
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

  it('ordningen i panelen är statistik -> laguppställning -> byten (Daniels spec)', () => {
    renderCard({
      events: [
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
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    const panel = screen.getByRole('region').querySelector('[data-live-detail]') as HTMLElement;
    const stats = panel.querySelector('[data-live-stats]');
    const lineups = panel.querySelector('[data-live-lineups]');
    const subs = panel.querySelector('[data-live-subs]');
    expect(stats).not.toBeNull();
    expect(lineups).not.toBeNull();
    expect(subs).not.toBeNull();
    // DOM-ordning = visuell ordning: statistik före laguppställning före byten.
    expect(
      stats!.compareDocumentPosition(lineups!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(lineups!.compareDocumentPosition(subs!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('statistiken visar ALDRIG en kort-räkning (korten syns i förloppet)', () => {
    renderCard({
      statistics: [
        {
          teamApiId: HOME,
          teamName: 'Netherlands',
          statistics: [
            { type: 'Ball Possession', value: '60%' },
            { type: 'Yellow Cards', value: 3 },
            { type: 'Red Cards', value: 1 },
          ],
        },
        {
          teamApiId: AWAY,
          teamName: 'Japan',
          statistics: [
            { type: 'Ball Possession', value: '40%' },
            { type: 'Yellow Cards', value: 2 },
            { type: 'Red Cards', value: 0 },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    const stats = screen.getByRole('region').querySelector('[data-live-stats]') as HTMLElement;
    expect(within(stats).getByText('Bollinnehav')).toBeInTheDocument();
    // Ingen kort-rad i statistiken (varken gula eller röda).
    expect(within(stats).queryByText(/kort/i)).not.toBeInTheDocument();
  });

  it('ingen "Visa mer" när det inte finns detaljer (tom statistik + lineup + inga byten)', () => {
    renderCard({ statistics: [], lineups: [], events: [] });
    expect(screen.queryByRole('button', { name: /Visa mer/i })).not.toBeInTheDocument();
  });

  it('STRUKTUR enhetlig: 0 händelser ger samma sektions-ramverk (bara tomt), inte trasigt', () => {
    // En match med 0 events + ingen statistik/lineup: kärnan visar ställning + klocka,
    // inga tomma mål-/kort-listor, ingen "Visa mer" (ärligt löfte). Inget "trasigt".
    const { container } = renderCard({ statistics: [], lineups: [], events: [] });
    expect(container.querySelector('[data-live-score]')).not.toBeNull();
    expect(container.querySelector('[data-live-clock]')).not.toBeNull();
    expect(container.querySelector('[data-live-goals]')).toBeNull();
    expect(container.querySelector('[data-live-cards]')).toBeNull();
    expect(container.querySelector('[data-live-detail-wrap]')).toBeNull();
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

describe('LiveMatchCard, finlinjerat förlopp (namn-block, ellipsis, centrerad knapp)', () => {
  it('hemma-blocket: namnet är höger-ställt mot mitten, ikonen INNERST (vid spinen)', () => {
    // Geometri-kontrakt för hemma-sidan: cellen trycker blocket mot mitten (justify-end)
    // och höger-ställer texten (text-right), så namnet ligger tätt intill den centrala
    // minut-spinen och text-blockets inre kant bildar en ren vertikal linje.
    renderCard({ events: [goalEvent({ teamApiId: HOME, playerName: 'Memphis', minute: 23 })] });
    const homeCell = screen
      .getByRole('region')
      .querySelector('[data-live-goal-side="home"] [data-live-event-cell="home"]') as HTMLElement;
    expect(homeCell).not.toBeNull();
    expect(homeCell.className).toContain('justify-end');
    expect(homeCell.className).toContain('text-right');
  });

  it('borta-blocket: namnet är vänster-ställt mot mitten, ikonen INNERST (vid spinen)', () => {
    renderCard({ events: [goalEvent({ teamApiId: AWAY, playerName: 'Mitoma', minute: 55 })] });
    const awayCell = screen
      .getByRole('region')
      .querySelector('[data-live-goal-side="away"] [data-live-event-cell="away"]') as HTMLElement;
    expect(awayCell).not.toBeNull();
    expect(awayCell.className).toContain('justify-start');
    expect(awayCell.className).toContain('text-left');
  });

  it('långt namn ("Memphis Depay") kapas med ellipsis (truncate), radbryter inte', () => {
    renderCard({
      events: [goalEvent({ teamApiId: HOME, playerName: 'Memphis Depay', minute: 23 })],
    });
    const name = screen.getByText('Memphis Depay');
    // truncate = whitespace-nowrap + overflow-hidden + text-ellipsis (en ren rad, ingen
    // rörig radbrytning), så radhöjden hålls konsekvent oavsett namnlängd.
    expect(name.className).toContain('truncate');
  });

  it('assist-underraden kapas också med ellipsis (konsekvent radhöjd)', () => {
    renderCard({
      events: [
        goalEvent({ teamApiId: HOME, playerName: 'Memphis', assistName: 'Frenkie de Jong' }),
      ],
    });
    const assist = screen.getByText(/assist: Frenkie de Jong/);
    expect(assist.className).toContain('truncate');
  });

  it('kort-spelarnamn kapas med ellipsis (samma radstruktur som mål)', () => {
    renderCard({
      events: [
        goalEvent({
          kind: 'card',
          rawType: 'Card',
          detail: 'Yellow Card',
          cardColor: 'yellow',
          minute: 40,
          playerName: 'Nathan Aké',
        }),
      ],
    });
    const name = screen.getByText('Nathan Aké');
    expect(name.className).toContain('truncate');
  });

  it('"Visa mer"-knappen är centrerad horisontellt (wrappern har justify-center)', () => {
    renderCard();
    const toggle = screen.getByRole('button', { name: /Visa mer/i });
    // Knappens direkta wrapper ska centrera den (flex justify-center), inte vänster-ställa.
    const wrapper = toggle.parentElement as HTMLElement;
    expect(wrapper.className).toContain('justify-center');
  });

  it('byten ärver samma speglade radstruktur (ikon innerst, namn-block, ellipsis-rader)', () => {
    renderCard({
      events: [
        goalEvent({
          kind: 'subst',
          rawType: 'subst',
          detail: 'Substitution 1',
          minute: 60,
          teamApiId: AWAY,
          playerName: 'Takefusa Kubo',
          assistName: 'Kaoru Mitoma',
        }),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /Visa mer/i }));
    const sub = screen.getByText(/Takefusa Kubo/).closest('[data-live-sub]') as HTMLElement;
    expect(sub).not.toBeNull();
    // Borta-bytet ligger i höger cell (samma MirroredEventRow-geometri som mål/kort).
    const awayCell = sub.querySelector('[data-live-event-cell="away"]') as HTMLElement;
    expect(awayCell).not.toBeNull();
    expect(awayCell.className).toContain('justify-start');
    // Både in- och ut-raden kapas med ellipsis (konsekvent radhöjd).
    expect(sub.querySelector('[data-live-sub-in]')?.className).toContain('truncate');
    expect(sub.querySelector('[data-live-sub-out]')?.className).toContain('truncate');
  });
});
