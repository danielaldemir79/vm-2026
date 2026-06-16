// Tester för de EVENTS-härledda turneringsstatistik-aggregaten (T88, #180; T100, #207). Bevisar de
// KÄLLHÄNVISADE reglerna med DISKRIMINERANDE fixtures (varje regel testas med data där FEL tolkning
// ger ett ANNAT svar), plus edge (tom data, inga mål/kort). Vi bygger LiveEvent-fixtures direkt
// (parsern är redan testad i parse-live.test), samma idiom som scorer-table.test.
//
// NOTERA (T100, #207): "flest mål per lag" + turneringens mål-total/snitt har FLYTTATS till
// tournament-stats-tables.ts (`aggregateTeamScoreGoals`, source:at ur officiellt facit), eftersom
// events-lagret bara täcker en delmängd matcher. Testerna för den stat:en bor nu i
// tournament-stats-tables.test.ts. Det som är kvar HÄR är de stats som per natur bara kan se de
// event-täckta matcherna (kort-liga, snabbaste mål, mål-tidning).

import { describe, expect, it } from 'vitest';
import {
  aggregateCardLeague,
  aggregateGoalTiming,
  GOAL_TIMING_BUCKETS,
} from './tournament-stats-events';
import type { LiveEvent, LiveMatchEvents } from '../../data/livescore';

/** Bygg ett mål-event med rimliga default; detail styr straff/egenmål (ur API-Football). */
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
    playerName: 'Spelare 100',
    assistId: null,
    assistName: null,
    cardColor: null,
    ...over,
  };
}

/** Bygg ett kort-event; cardColor styr gult/rött (redan normaliserat av parse-live). */
function card(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 30,
    extra: null,
    kind: 'card',
    rawType: 'Card',
    detail: 'Yellow Card',
    teamApiId: 6,
    teamName: 'Brasilien',
    playerId: 100,
    playerName: 'Spelare 100',
    assistId: null,
    assistName: null,
    cardColor: 'yellow',
    ...over,
  };
}

function match(matchId: string, events: LiveEvent[]): LiveMatchEvents {
  return { matchId, events };
}

describe('aggregateCardLeague , kort-liga (extractCards)', () => {
  it('rankar SPELARE på flest kort över flera matcher (gult + rött räknas)', () => {
    const league = aggregateCardLeague([
      match('m1', [
        card({ playerId: 1, playerName: 'A', cardColor: 'yellow' }),
        card({ playerId: 2, playerName: 'B', cardColor: 'yellow' }),
      ]),
      match('m2', [
        card({ playerId: 1, playerName: 'A', cardColor: 'red' }),
        card({ playerId: 1, playerName: 'A', cardColor: 'yellow' }),
      ]),
    ]);
    const a = league.players[0];
    expect(a?.playerId).toBe(1);
    expect(a?.total).toBe(3); // 2 gula + 1 rött
    expect(a?.yellow).toBe(2);
    expect(a?.red).toBe(1);
    expect(a?.matches).toBe(2);
  });

  it('rankar LAG på flest kort (lag-tally separat från spelar-tally)', () => {
    const league = aggregateCardLeague([
      match('m1', [
        card({ teamApiId: 6, teamName: 'Brasilien', playerId: 1 }),
        card({ teamApiId: 5, teamName: 'Sverige', playerId: 9 }),
      ]),
      match('m2', [card({ teamApiId: 6, teamName: 'Brasilien', playerId: 2 })]),
    ]);
    const top = league.teams[0];
    expect(top?.teamApiId).toBe(6);
    expect(top?.total).toBe(2);
  });

  it('en spelare UTAN känt id hoppas (gissa aldrig att två okända är samma)', () => {
    const league = aggregateCardLeague([match('m1', [card({ playerId: null, playerName: null })])]);
    expect(league.players).toHaveLength(0);
    // Laget räknas ändå (lag-id finns även när spelar-id saknas).
    expect(league.teams[0]?.total).toBe(1);
  });

  it('tom data -> tomma listor, ingen krasch', () => {
    const league = aggregateCardLeague([]);
    expect(league.players).toEqual([]);
    expect(league.teams).toEqual([]);
  });

  it('inga kort (bara mål) -> tomma kort-listor', () => {
    const league = aggregateCardLeague([match('m1', [goal()])]);
    expect(league.players).toEqual([]);
    expect(league.teams).toEqual([]);
  });
});

describe('aggregateGoalTiming , snabbaste mål + 15-min-fördelning', () => {
  it('hittar det TIDIGASTE målet (minut, sedan tillägg) med skytt + match', () => {
    const timing = aggregateGoalTiming([
      match('m1', [goal({ minute: 23, playerId: 1, playerName: 'Sen' })]),
      match('m2', [goal({ minute: 2, playerId: 2, playerName: 'Snabb' })]),
      match('m3', [goal({ minute: 2, extra: 1, playerId: 3, playerName: 'Strax efter' })]),
    ]);
    expect(timing.fastest?.minute).toBe(2);
    expect(timing.fastest?.extra).toBeNull();
    expect(timing.fastest?.scorerName).toBe('Snabb');
    expect(timing.fastest?.matchId).toBe('m2');
  });

  it('fördelar mål på 15-min-hinkar (0-15, 16-30, ..., 90+)', () => {
    const timing = aggregateGoalTiming([
      match('m1', [
        goal({ minute: 1 }), // 0-15
        goal({ minute: 15 }), // 0-15 (gräns inkluderad)
        goal({ minute: 16 }), // 16-30
        goal({ minute: 90 }), // 76-90
        goal({ minute: 90, extra: 3 }), // 90+ (tillägg)
      ]),
    ]);
    const byLabel = Object.fromEntries(timing.buckets.map((b) => [b.label, b.count]));
    expect(byLabel['0-15']).toBe(2);
    expect(byLabel['16-30']).toBe(1);
    expect(byLabel['76-90']).toBe(1);
    expect(byLabel['90+']).toBe(1);
    // Hinkarna täcker alla mål (summan = antal mål).
    expect(timing.buckets.reduce((s, b) => s + b.count, 0)).toBe(5);
  });

  it('exponerar alla hinkar i ordning även när tomma (stabil stapel)', () => {
    const timing = aggregateGoalTiming([]);
    expect(timing.fastest).toBeNull();
    expect(timing.buckets.map((b) => b.label)).toEqual([...GOAL_TIMING_BUCKETS]);
    expect(timing.buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('ett mål utan känd skytt räknas i fördelningen men har ingen skytt-text', () => {
    const timing = aggregateGoalTiming([
      match('m1', [goal({ minute: 5, playerId: null, playerName: null })]),
    ]);
    expect(timing.fastest?.minute).toBe(5);
    expect(timing.fastest?.scorerName).toBeNull();
    expect(timing.buckets.find((b) => b.label === '0-15')?.count).toBe(1);
  });
});
