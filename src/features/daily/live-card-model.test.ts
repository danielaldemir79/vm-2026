// Tester för livekortets RENA visnings-modell. Fokus på SKARVEN (hemma/borta-paring
// via API-id ELLER positions-fallback) + sortering + urval + edge-fall (saknat namn,
// straff/självmål, statistik utan tal), inte bara happy-path (lessons "bevisa skarven").

import { describe, expect, it } from 'vitest';
import {
  buildStatRows,
  formatEventMinute,
  pairLineups,
  pairStatistics,
  selectCards,
  selectGoals,
  selectSubs,
} from './live-card-model';
import type { LiveEvent, LiveLineup, LiveTeamStatistics } from '../../data/livescore';

const HOME = 10; // England (rika 2022-blobbarna)
const AWAY = 22; // Iran

/** Bygg ett LiveEvent med rimliga default, override per test. */
function ev(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 10,
    extra: null,
    kind: 'goal',
    rawType: 'Goal',
    detail: 'Normal Goal',
    teamApiId: HOME,
    teamName: 'England',
    playerName: 'A. Player',
    assistName: null,
    cardColor: null,
    ...overrides,
  };
}

describe('selectGoals', () => {
  it('plockar bara mål, sorterar kronologiskt (minut, sedan tillägg)', () => {
    const events: LiveEvent[] = [
      ev({ minute: 45, extra: 1, playerName: 'Sen' }),
      ev({ minute: 12, playerName: 'Tidig' }),
      ev({ kind: 'card', cardColor: 'yellow', detail: 'Yellow Card', minute: 5 }),
      ev({ minute: 45, extra: null, playerName: 'Mitt' }),
    ];
    const goals = selectGoals(events, HOME);
    expect(goals.map((g) => g.scorer)).toEqual(['Tidig', 'Mitt', 'Sen']);
  });

  it('härleder SIDA ur API-id (hemma-id -> home, annat -> away)', () => {
    const events: LiveEvent[] = [
      ev({ teamApiId: HOME, playerName: 'H' }),
      ev({ teamApiId: AWAY, playerName: 'B' }),
    ];
    const goals = selectGoals(events, HOME);
    expect(goals.find((g) => g.scorer === 'H')?.side).toBe('home');
    expect(goals.find((g) => g.scorer === 'B')?.side).toBe('away');
  });

  it('markerar straff + självmål ur detail, bär assist, tål saknat skytt-namn', () => {
    const events: LiveEvent[] = [
      ev({ detail: 'Penalty', playerName: 'Str', minute: 30 }),
      ev({ detail: 'Own Goal', playerName: 'Sjm', minute: 40 }),
      ev({ playerName: null, assistName: 'Hjälte', minute: 50 }),
    ];
    const goals = selectGoals(events, HOME);
    expect(goals[0]).toMatchObject({ penalty: true, scorer: 'Str' });
    expect(goals[1]).toMatchObject({ ownGoal: true, scorer: 'Sjm' });
    expect(goals[2]).toMatchObject({ scorer: 'Okänd spelare', assist: 'Hjälte' });
  });

  it('homeApiId null -> allt blir away (ingen falsk hemma-roll utan känt id)', () => {
    const goals = selectGoals([ev({ teamApiId: HOME })], null);
    expect(goals[0].side).toBe('away');
  });
});

describe('selectCards', () => {
  it('plockar bara kort-events, bär färg + sida, sorterar kronologiskt', () => {
    const events: LiveEvent[] = [
      ev({
        kind: 'card',
        cardColor: 'red',
        detail: 'Red Card',
        minute: 80,
        teamApiId: AWAY,
        playerName: 'R',
      }),
      ev({ kind: 'card', cardColor: 'yellow', detail: 'Yellow Card', minute: 20, playerName: 'Y' }),
      ev({ minute: 30 }), // ett mål, ska inte med
    ];
    const cards = selectCards(events, HOME);
    expect(cards.map((c) => c.player)).toEqual(['Y', 'R']);
    expect(cards[0]).toMatchObject({ color: 'yellow', side: 'home' });
    expect(cards[1]).toMatchObject({ color: 'red', side: 'away' });
  });
});

describe('selectSubs', () => {
  it('läser in = player, ut = assist (API-formen vid subst)', () => {
    const events: LiveEvent[] = [
      ev({
        kind: 'subst',
        detail: 'Substitution 1',
        minute: 60,
        playerName: 'In',
        assistName: 'Ut',
      }),
    ];
    const subs = selectSubs(events, HOME);
    expect(subs[0]).toMatchObject({ playerIn: 'In', playerOut: 'Ut', minute: 60 });
  });

  it('tål saknad utbytt spelare (assist null) -> playerOut null', () => {
    const subs = selectSubs([ev({ kind: 'subst', playerName: 'In', assistName: null })], HOME);
    expect(subs[0].playerOut).toBeNull();
  });
});

/** Bygg ett statistik-block för ett lag. */
function stats(
  teamApiId: number,
  entries: Record<string, number | string | null>
): LiveTeamStatistics {
  return {
    teamApiId,
    teamName: teamApiId === HOME ? 'England' : 'Iran',
    statistics: Object.entries(entries).map(([type, value]) => ({ type, value })),
  };
}

describe('pairStatistics', () => {
  it('matchar på API-id när det går (live: korrekt roll oavsett ordning)', () => {
    const list = [stats(AWAY, { 'Total Shots': 8 }), stats(HOME, { 'Total Shots': 13 })];
    const { home, away } = pairStatistics(list, HOME);
    expect(home?.teamApiId).toBe(HOME);
    expect(away?.teamApiId).toBe(AWAY);
  });

  it('positions-fallback när id inte matchar (fixtures-läge), block 0 = hemma', () => {
    const list = [stats(HOME, { 'Total Shots': 13 }), stats(AWAY, { 'Total Shots': 8 })];
    // homeApiId 999 finns inte i blocken -> fallback på position.
    const { home, away } = pairStatistics(list, 999);
    expect(home?.teamApiId).toBe(HOME);
    expect(away?.teamApiId).toBe(AWAY);
  });

  it('tom lista -> båda null', () => {
    expect(pairStatistics([], HOME)).toEqual({ home: null, away: null });
  });
});

describe('buildStatRows', () => {
  it('bygger rader med text + andelar, hoppar typer som saknas helt', () => {
    const list = [
      stats(HOME, { 'Ball Possession': '78%', 'Total Shots': 13 }),
      stats(AWAY, { 'Ball Possession': '22%', 'Total Shots': 8 }),
    ];
    const rows = buildStatRows(list, HOME);
    const poss = rows.find((r) => r.label === 'Bollinnehav');
    expect(poss).toMatchObject({ homeText: '78%', awayText: '22%' });
    expect(poss?.homeShare).toBeCloseTo(0.78, 2);
    expect(poss?.awayShare).toBeCloseTo(0.22, 2);
    // En typ som ingen sida har (t.ex. "Offside") ger ingen rad.
    expect(rows.find((r) => r.label === 'Offside')).toBeUndefined();
  });

  it('saknat tal -> "-" och 0.5/0.5-andel (ingen NaN, ljuger inte om skillnad)', () => {
    const list = [stats(HOME, { 'Yellow Cards': null }), stats(AWAY, { 'Yellow Cards': null })];
    const rows = buildStatRows(list, HOME);
    const yc = rows.find((r) => r.label === 'Gula kort');
    expect(yc).toMatchObject({ homeText: '-', awayText: '-' });
    expect(yc?.homeShare).toBe(0.5);
  });

  it('tom statistik -> inga rader', () => {
    expect(buildStatRows([], HOME)).toEqual([]);
  });
});

/** Bygg en laguppställning. */
function lineup(teamApiId: number, formation: string): LiveLineup {
  return {
    teamApiId,
    teamName: teamApiId === HOME ? 'England' : 'Iran',
    formation,
    startXI: [{ apiPlayerId: 1, name: 'GK', number: 1, position: 'G', grid: '1:1' }],
    substitutes: [{ apiPlayerId: 2, name: 'Sub', number: 12, position: 'M', grid: null }],
  };
}

describe('pairLineups', () => {
  it('matchar på API-id, annars positions-fallback (samma regel som statistik)', () => {
    const list = [lineup(AWAY, '5-4-1'), lineup(HOME, '4-2-3-1')];
    expect(pairLineups(list, HOME).home?.formation).toBe('4-2-3-1');
    // Fallback: id matchar inte -> block 0 = hemma.
    expect(pairLineups([lineup(HOME, '4-3-3'), lineup(AWAY, '4-4-2')], 999).home?.formation).toBe(
      '4-3-3'
    );
  });
});

describe('formatEventMinute', () => {
  it('45 -> "45\'", 45+1 -> "45+1\'", extra 0 behandlas som inget tillägg', () => {
    expect(formatEventMinute(45, null)).toBe("45'");
    expect(formatEventMinute(45, 1)).toBe("45+1'");
    expect(formatEventMinute(90, 0)).toBe("90'");
  });
});
