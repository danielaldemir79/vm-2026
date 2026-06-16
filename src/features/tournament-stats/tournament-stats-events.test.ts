// Tester för de EVENTS-härledda turneringsstatistik-aggregaten (T88, #180). Bevisar de
// KÄLLHÄNVISADE reglerna med DISKRIMINERANDE fixtures (varje regel testas med data där FEL
// tolkning ger ett ANNAT svar), plus edge (tom data, inga mål/kort) och NEGATIV-KONTROLLER
// (ta bort egenmåls-skyddet i lag-mål-tally:n -> testet rödnar). Vi bygger LiveEvent-fixtures
// direkt (parsern är redan testad i parse-live.test), samma idiom som scorer-table.test.

import { describe, expect, it } from 'vitest';
import {
  aggregateCardLeague,
  aggregateGoalTiming,
  aggregateTeamGoals,
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

describe('aggregateTeamGoals , flest mål per lag (F1: egenmåls-medveten)', () => {
  it('räknar mål per lag EXKLUSIVE egenmål, och noterar egenmål separat', () => {
    const result = aggregateTeamGoals([
      match('m1', [
        goal({ teamApiId: 6, teamName: 'Brasilien' }),
        goal({ teamApiId: 6, teamName: 'Brasilien' }),
        // Ett egenmål: API attribuerar teamApiId tvetydigt (F1), så vi krediterar det
        // INTE till något lags mål-tally , noteras bara som egenmål.
        goal({ teamApiId: 5, teamName: 'Sverige', detail: 'Own Goal' }),
      ]),
    ]);
    const bra = result.teams.find((t) => t.teamApiId === 6);
    expect(bra?.goals).toBe(2);
    // Sverige fick INGET mål krediterat (egenmålet räknas inte till lag-tally:n).
    expect(result.teams.find((t) => t.teamApiId === 5)).toBeUndefined();
    expect(result.ownGoals).toBe(1);
  });

  it('NEGATIV-KONTROLL: skulle ett egenmål krediteras till teamApiId blir tally fel', () => {
    // Detta test LÅSER F1-beslutet: ett egenmål får ALDRIG öka ett lags mål-tally. Skulle
    // någon ta bort egenmåls-gardet (räkna ALLA goal-events) skulle Sverige få 1 mål här.
    const result = aggregateTeamGoals([
      match('m1', [goal({ teamApiId: 5, teamName: 'Sverige', detail: 'Own Goal' })]),
    ]);
    expect(result.teams).toHaveLength(0); // inget lag krediteras
    expect(result.ownGoals).toBe(1);
  });

  it('straffmål RÄKNAS till lagets mål (det är ett riktigt mål)', () => {
    const result = aggregateTeamGoals([match('m1', [goal({ teamApiId: 6, detail: 'Penalty' })])]);
    expect(result.teams.find((t) => t.teamApiId === 6)?.goals).toBe(1);
  });

  it('rankar lag på flest mål och summerar totalt + räknar matcher', () => {
    const result = aggregateTeamGoals([
      match('m1', [goal({ teamApiId: 6 }), goal({ teamApiId: 5, teamName: 'Sverige' })]),
      match('m2', [goal({ teamApiId: 6 }), goal({ teamApiId: 6 })]),
    ]);
    expect(result.teams[0]?.teamApiId).toBe(6);
    expect(result.teams[0]?.goals).toBe(3);
    expect(result.teams[0]?.matches).toBe(2);
    // totalGoals = ALLA mål i matcherna (inkl. ev. egenmål, FIFA:s turneringstotal), här 4.
    expect(result.totalGoals).toBe(4);
    expect(result.matchesPlayed).toBe(2);
  });

  it('målsnitt per match = ALLA mål (inkl. egenmål) / spelade matcher (edge: 0 matcher -> 0)', () => {
    const empty = aggregateTeamGoals([]);
    expect(empty.matchesPlayed).toBe(0);
    expect(empty.goalAverage).toBe(0); // ingen division med noll

    const some = aggregateTeamGoals([match('m1', [goal(), goal(), goal()]), match('m2', [goal()])]);
    expect(some.totalGoals).toBe(4);
    expect(some.matchesPlayed).toBe(2);
    expect(some.goalAverage).toBe(2);
  });

  it('egenmål INGÅR i turneringens mål-total (FIFA) men INTE i ett lags mål-tally (F1)', () => {
    // matchesPlayed = matcher med minst ETT mål-event (mål gör att matchen "räknas").
    // KÄLLHÄNVISAT skillnad: FIFA:s turnerings-måltotal RÄKNAR egenmål (det föll ett mål),
    // men ett egenmål krediteras inte SKYTTENS lag (F1, team-fältet är overifierat).
    const result = aggregateTeamGoals([match('m1', [goal(), goal({ detail: 'Own Goal' })])]);
    expect(result.matchesPlayed).toBe(1);
    expect(result.totalGoals).toBe(2); // 1 öppet mål + 1 egenmål = 2 mål i matchen
    expect(result.ownGoals).toBe(1);
    // Men bara det öppna målet krediteras ett lag (egenmålet inte).
    expect(result.teams.reduce((s, t) => s + t.goals, 0)).toBe(1);
  });
});
