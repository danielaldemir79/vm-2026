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
  selectShootout,
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
    playerId: null,
    playerName: 'A. Player',
    assistId: null,
    assistName: null,
    cardColor: null,
    comments: null,
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

  it('EXKLUDERAR straffläggning + missade straffar (de är inte mål i ställningen)', () => {
    const goals = selectGoals(
      [
        ev({ minute: 70, playerName: 'Riktigt mål' }),
        ev({
          minute: 120,
          extra: 1,
          detail: 'Penalty',
          playerName: 'Seriestraff satt',
          comments: 'Penalty Shootout',
        }),
        ev({
          minute: 120,
          extra: 2,
          detail: 'Missed Penalty',
          playerName: 'Seriestraff missad',
          comments: 'Penalty Shootout',
        }),
      ],
      HOME
    );
    expect(goals.map((g) => g.scorer)).toEqual(['Riktigt mål']);
  });
});

describe('selectShootout', () => {
  /** Bygg en straffläggnings-spark (comments-markör + ordning + satt/missad ur detail). */
  function kick(order: number, scored: boolean, over: Partial<LiveEvent> = {}): LiveEvent {
    return ev({
      minute: 120,
      extra: order,
      detail: scored ? 'Penalty' : 'Missed Penalty',
      comments: 'Penalty Shootout',
      ...over,
    });
  }

  it('sidar sparkarna, räknar satta per sida och utser vinnaren', () => {
    // Hemma sätter 1, missar 1 (1 satt). Borta sätter 2 (2 satta). Borta vinner.
    const model = selectShootout(
      [
        // GLOBAL sparkordning (extra 1..4 unika, alternerande lag), precis som API:t (inte
        // per-runda dubbletter): hemma sätter 1, missar 1; borta sätter 2 -> borta vinner.
        kick(1, true, { teamApiId: HOME, playerName: 'H1' }),
        kick(2, true, { teamApiId: AWAY, playerName: 'B1' }),
        kick(3, false, { teamApiId: HOME, playerName: 'H2' }),
        kick(4, true, { teamApiId: AWAY, playerName: 'B2' }),
      ],
      HOME
    );
    expect(model).not.toBeNull();
    expect(model?.homeScore).toBe(1);
    expect(model?.awayScore).toBe(2);
    expect(model?.winner).toBe('away');
    // Sparkarna bär sida + satt/missad + namn, i sparkordning.
    expect(model?.kicks.map((k) => `${k.side}:${k.player}:${k.scored}`)).toEqual([
      'home:H1:true',
      'away:B1:true',
      'home:H2:false',
      'away:B2:true',
    ]);
  });

  it('lika satta straffar -> winner null (ledaren är inte utsedd), men sektionen finns', () => {
    // En jämn ställning mitt i serien: modellen utser INGEN vinnare (winner null). Vyn avgör
    // sedan på matchstatus om en "vann"-etikett får visas (en pågående serie ska inte det).
    const model = selectShootout(
      [
        kick(1, true, { teamApiId: HOME, playerName: 'H1' }),
        kick(2, true, { teamApiId: AWAY, playerName: 'B1' }),
      ],
      HOME
    );
    expect(model).not.toBeNull();
    expect(model?.homeScore).toBe(1);
    expect(model?.awayScore).toBe(1);
    expect(model?.winner).toBeNull();
  });

  it('homeApiId null -> alla sparkar blir away (ingen falsk hemma-roll utan känt id)', () => {
    const model = selectShootout([kick(1, true, { teamApiId: HOME })], null);
    expect(model?.kicks[0].side).toBe('away');
  });

  it('ingen straffläggning -> null (sektionen ska inte renderas)', () => {
    expect(selectShootout([ev({ minute: 70, detail: 'Normal Goal' })], HOME)).toBeNull();
  });

  it('saknat skytt-namn -> neutral platshållare (gissa aldrig en spelare)', () => {
    const model = selectShootout([kick(1, true, { playerName: null })], HOME);
    expect(model?.kicks[0].player).toBe('Okänd spelare');
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
    // En visad stat-typ (Total Shots) men utan tal på någon sida: raden finns ändå
    // (minst en sida hade typen) men visar "-" och delar 50/50, så stapeln inte ljuger.
    const list = [stats(HOME, { 'Total Shots': null }), stats(AWAY, { 'Total Shots': null })];
    const rows = buildStatRows(list, HOME);
    const shots = rows.find((r) => r.label === 'Skott totalt');
    expect(shots).toMatchObject({ homeText: '-', awayText: '-' });
    expect(shots?.homeShare).toBe(0.5);
  });

  it('visar ALDRIG en kort-räkning i statistiken (korten syns i förloppet i stället)', () => {
    // Daniels spec: gula/röda kort ska visas i matchförloppet (på kortets framsida),
    // inte som en stat-RAD , annars dubbel-visas samma sak. Även om API:t skickar en
    // kort-räkning ska ingen "Gula kort"/"Röda kort"-rad byggas.
    const list = [
      stats(HOME, { 'Yellow Cards': 3, 'Red Cards': 1, 'Total Shots': 13 }),
      stats(AWAY, { 'Yellow Cards': 2, 'Red Cards': 0, 'Total Shots': 8 }),
    ];
    const rows = buildStatRows(list, HOME);
    expect(rows.some((r) => /kort/i.test(r.label))).toBe(false);
    // Den vanliga spel-statistiken finns kvar (vakten tog inte bort allt).
    expect(rows.some((r) => r.label === 'Skott totalt')).toBe(true);
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
    coachName: null,
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
