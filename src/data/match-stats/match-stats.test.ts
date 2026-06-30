// Tester för den DELADE match-statistik-projektionen (T86, #178). Fokus på:
//  - SKARVEN normaliserad -> domän-projektion (kör mot de RIKTIGA fångade fixtures-
//    blobbarna parsade via parse-live, inte mot handgjord konsument-form, lessons
//    "bevisa skarven"),
//  - de gissningskänsliga grenarna (egenmål-flagga, straff-flagga) med DISKRIMINERANDE
//    data (en fixtur där fel tolkning skulle ge ett annat svar, lessons "invariant-test"),
//  - edge/fel-vägar (tomma events, saknat tal i statistik, saknad coach, saknat id).
//
// Återanvändnings-kontraktet (G5): dessa funktioner matar T87 (skytteliga, grupperar på
// scorerId, filtrerar isOwnGoal) + T88 (turneringsstatistik, aggregerar per teamApiId), så
// testerna bevisar just det de behöver: stabila id:n bevaras, egenmål flaggas men tolkas
// inte om, saknad stat blir null (inte 0, så ett medel inte dras mot noll).

import { describe, expect, it } from 'vitest';
import {
  extractCards,
  extractGoals,
  extractLineup,
  extractOtherEvents,
  extractShootout,
  extractSubs,
  normalizeMatchStats,
  normalizeTeamStats,
} from './match-stats';
import {
  fixtureLiveEvents,
  fixtureLiveLineups,
  fixtureLiveStatistics,
  parseEvents,
} from '../livescore';
import type { LiveEvent, LiveLineup, LiveTeamStatistics } from '../livescore';
import type { RawApiResponse, RawEvent } from '../livescore/api-football-types';

const HOME = 10; // England (de rika 2022-blobbarna)
const AWAY = 22; // Iran

/** Bygg ett LiveEvent med rimliga default, override per test (samma form parse-live ger). */
function ev(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 10,
    extra: null,
    kind: 'goal',
    rawType: 'Goal',
    detail: 'Normal Goal',
    teamApiId: HOME,
    teamName: 'England',
    playerId: 100,
    playerName: 'A. Player',
    assistId: null,
    assistName: null,
    cardColor: null,
    comments: null,
    ...over,
  };
}

describe('extractGoals', () => {
  it('plockar bara mål, kronologiskt (minut, sedan tillägg), bevarar team-/spelar-id', () => {
    const events: LiveEvent[] = [
      ev({ minute: 45, extra: 1, playerId: 3, playerName: 'Sen' }),
      ev({ minute: 12, playerId: 1, playerName: 'Tidig', teamApiId: AWAY, teamName: 'Iran' }),
      ev({ kind: 'card', cardColor: 'yellow', detail: 'Yellow Card', minute: 5 }),
      ev({ minute: 45, extra: null, playerId: 2, playerName: 'Mitt' }),
    ];
    const goals = extractGoals(events);
    expect(goals.map((g) => g.scorerName)).toEqual(['Tidig', 'Mitt', 'Sen']);
    // Team-id bevarat EXAKT (ingen home/away-omtolkning): Tidig var Iran.
    expect(goals[0]).toMatchObject({ teamApiId: AWAY, scorerId: 1 });
    expect(goals[2]).toMatchObject({ scorerId: 3 });
  });

  it('FLAGGAR straff (detail "Penalty") men räknar det fortfarande som mål', () => {
    const goals = extractGoals([ev({ detail: 'Penalty', playerName: 'Str' })]);
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ isPenalty: true, isOwnGoal: false, scorerName: 'Str' });
  });

  it('FLAGGAR egenmål (detail "Own Goal") men tolkar INTE om team-id (provider-oberoende)', () => {
    // DISKRIMINERANDE fixtur: egenmålets event-team är AWAY. Vi BEVARAR teamApiId === AWAY
    // exakt som API:t gav det , vi vänder det ALDRIG till motståndaren (den konventionen är
    // overifierad, se decisions.md). En framtida "kreditera om till motståndaren"-bugg
    // skulle ändra teamApiId till HOME och RÖDNA detta test.
    const goals = extractGoals([
      ev({ detail: 'Own Goal', playerId: 7, playerName: 'Sjm', teamApiId: AWAY, teamName: 'Iran' }),
    ]);
    expect(goals[0]).toMatchObject({
      isOwnGoal: true,
      isPenalty: false,
      teamApiId: AWAY,
      scorerId: 7,
    });
  });

  it('bär assist (id + namn) och tål saknat skytt-namn (gissa aldrig en spelare)', () => {
    const goals = extractGoals([
      ev({ playerId: null, playerName: null, assistId: 55, assistName: 'Hjälte' }),
    ]);
    expect(goals[0]).toMatchObject({
      scorerId: null,
      scorerName: null,
      assistId: 55,
      assistName: 'Hjälte',
    });
  });

  it('tom events-lista -> inga mål', () => {
    expect(extractGoals([])).toEqual([]);
  });

  it('EXKLUDERAR straffläggnings-sparkar (comments "Penalty Shootout") , de är inte mål', () => {
    // En straffserie-spark anländer som type "Goal" (kind 'goal') men avgör BARA vinnaren,
    // den ska aldrig räknas som mål (ställning/skytteliga/notis). Markören är comments.
    const goals = extractGoals([
      ev({ minute: 23, detail: 'Penalty', playerName: 'Riktig straff', comments: null }),
      ev({
        minute: 120,
        extra: 1,
        detail: 'Penalty',
        playerName: 'Seriestraff',
        comments: 'Penalty Shootout',
      }),
    ]);
    expect(goals.map((g) => g.scorerName)).toEqual(['Riktig straff']);
    expect(goals[0].isPenalty).toBe(true); // den riktiga straffen är fortfarande ett (straff)mål
  });

  it('EXKLUDERAR en missad straff (detail "Missed Penalty") , en miss är aldrig ett mål', () => {
    // En missad straffserie-spark är ÄVEN den type "Goal" i API:t. Utan detta filter räknades
    // en MISS som ett mål (buggen Daniel såg: alla straffar såg satta ut).
    const goals = extractGoals([
      ev({
        minute: 120,
        extra: 3,
        detail: 'Missed Penalty',
        playerName: 'Missade',
        comments: 'Penalty Shootout',
      }),
    ]);
    expect(goals).toEqual([]);
  });

  it('kör mot den RIKTIGA fångade events-blobben (skarven): hittar mål med stabila id', () => {
    const goals = extractGoals(fixtureLiveEvents);
    expect(goals.length).toBeGreaterThan(0);
    // Det första målet i samplen (J. Bellingham, id 129718) , bevisar att id:t bärs hela
    // vägen genom den RIKTIGA parsade formen, inte bara handgjorda literaler.
    expect(goals.some((g) => g.scorerId === 129718)).toBe(true);
    // Straffmålet (M. Taremi) ska vara flaggat isPenalty i den riktiga datan.
    const penalty = goals.find((g) => g.isPenalty);
    expect(penalty?.scorerName).toBe('M. Taremi');
  });
});

describe('extractShootout', () => {
  /** Bygg en straffläggnings-spark (comments-markören + ordning + satt/missad ur detail). */
  function kick(order: number, scored: boolean, over: Partial<LiveEvent> = {}): LiveEvent {
    return ev({
      minute: 120,
      extra: order,
      kind: 'goal',
      rawType: 'Goal',
      detail: scored ? 'Penalty' : 'Missed Penalty',
      comments: 'Penalty Shootout',
      ...over,
    });
  }

  it('plockar bara straffserie-sparkar, i sparkordning, med satt/missad ur detail', () => {
    const shootout = extractShootout([
      ev({ minute: 23, detail: 'Penalty', comments: null }), // riktig straff i matchen, EJ med
      ev({ minute: 70, detail: 'Normal Goal' }), // vanligt mål, EJ med
      kick(2, false, { playerId: 9, playerName: 'Miss', teamApiId: AWAY, teamName: 'Iran' }),
      kick(1, true, { playerId: 8, playerName: 'Satt' }),
    ]);
    expect(shootout.map((k) => k.playerName)).toEqual(['Satt', 'Miss']); // sorterat på ordning
    expect(shootout[0]).toMatchObject({ order: 1, scored: true, teamApiId: HOME, playerId: 8 });
    expect(shootout[1]).toMatchObject({ order: 2, scored: false, teamApiId: AWAY, playerId: 9 });
  });

  it('ingen straffläggning -> tom lista', () => {
    expect(
      extractShootout([ev({ detail: 'Penalty', comments: null }), ev({ detail: 'Normal Goal' })])
    ).toEqual([]);
  });

  it('tom events-lista -> tom lista', () => {
    expect(extractShootout([])).toEqual([]);
  });
});

describe('extractCards', () => {
  it('plockar bara kort, bär färg + team-id + spelar-id, kronologiskt', () => {
    const events: LiveEvent[] = [
      ev({
        kind: 'card',
        cardColor: 'red',
        detail: 'Red Card',
        minute: 80,
        playerId: 9,
        playerName: 'R',
      }),
      ev({
        kind: 'card',
        cardColor: 'yellow',
        detail: 'Yellow Card',
        minute: 20,
        playerId: 8,
        playerName: 'Y',
        teamApiId: AWAY,
      }),
      ev({ minute: 30 }), // ett mål, ska inte med
    ];
    const cards = extractCards(events);
    expect(cards.map((c) => c.playerName)).toEqual(['Y', 'R']);
    expect(cards[0]).toMatchObject({ color: 'yellow', teamApiId: AWAY, playerId: 8 });
    expect(cards[1]).toMatchObject({ color: 'red', teamApiId: HOME, playerId: 9 });
  });

  it('tom -> inga kort', () => {
    expect(extractCards([])).toEqual([]);
  });

  // SKARV-test (F1) genom den RIKTIGA parsern, inte en bekväm fixtur: en andra-gult-utvisning
  // anländer som detail "Yellow-Red Card" från API-Football. Vi kör den EXAKTA strängen via
  // parseEvents -> extractCards och kräver att kortet räknas som RÖTT (utvisning), inte gult.
  // De övriga testerna sätter cardColor direkt och hoppar därför över readCardColor-seam:en
  // där buggen bodde , den här bevisar hela vägen råsträng -> 'red'.
  it('räknar "Yellow-Red Card" (andra-gult-utvisning) som ETT rött kort via parseEvents-seam (F1)', () => {
    const parsed = parseEvents({
      get: 'fixtures/events',
      results: 1,
      errors: [],
      response: [
        {
          time: { elapsed: 70, extra: null },
          team: { id: HOME, name: 'England' },
          player: { id: 7, name: 'Utvisad' },
          assist: { id: null, name: null },
          type: 'Card',
          detail: 'Yellow-Red Card',
          comments: null,
        },
      ],
    } as unknown as RawApiResponse<RawEvent>);
    const cards = extractCards(parsed);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ color: 'red', playerId: 7, teamApiId: HOME });
  });
});

describe('extractSubs', () => {
  it('läser in = player, ut = assist (API-formen), bär bägge id:n', () => {
    const subs = extractSubs([
      ev({
        kind: 'subst',
        detail: 'Substitution 1',
        minute: 60,
        playerId: 1,
        playerName: 'In',
        assistId: 2,
        assistName: 'Ut',
      }),
    ]);
    expect(subs[0]).toMatchObject({
      playerInId: 1,
      playerInName: 'In',
      playerOutId: 2,
      playerOutName: 'Ut',
      minute: 60,
    });
  });

  it('tål saknad utbytt spelare (assist null) -> playerOut* null', () => {
    const subs = extractSubs([
      ev({ kind: 'subst', playerId: 1, playerName: 'In', assistId: null, assistName: null }),
    ]);
    expect(subs[0]).toMatchObject({ playerOutId: null, playerOutName: null });
  });
});

describe('extractOtherEvents', () => {
  it('plockar VAR + okända typer (för en uttömmande tidslinje), inte mål/kort/byten', () => {
    const events: LiveEvent[] = [
      ev({ kind: 'var', rawType: 'Var', detail: 'Penalty confirmed', minute: 50 }),
      ev({ kind: 'other', rawType: 'Mystery', detail: 'Något', minute: 10 }),
      ev({ kind: 'goal', minute: 30 }), // ska INTE med
      ev({ kind: 'card', cardColor: 'yellow', minute: 40 }), // ska INTE med
    ];
    const others = extractOtherEvents(events);
    expect(others.map((o) => o.detail)).toEqual(['Något', 'Penalty confirmed']);
    expect(others[0].kind).toBe('other');
    expect(others[1].kind).toBe('var');
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

describe('normalizeTeamStats', () => {
  it('mappar API-typer till kanoniska nycklar med text + tal, i kanonisk ordning', () => {
    const team = normalizeTeamStats(
      stats(HOME, { 'Ball Possession': '78%', 'Total Shots': 13, 'Corner Kicks': 6 })
    );
    expect(team.metrics.map((m) => m.key)).toEqual(['possession', 'shotsTotal', 'corners']);
    const poss = team.metrics.find((m) => m.key === 'possession');
    expect(poss).toMatchObject({ text: '78%', value: 78 });
    const shots = team.metrics.find((m) => m.key === 'shotsTotal');
    expect(shots).toMatchObject({ text: '13', value: 13 });
  });

  it('hoppar nyckeltal API:t inte levererade (ingen tom metric)', () => {
    const team = normalizeTeamStats(stats(HOME, { 'Total Shots': 9 }));
    expect(team.metrics).toHaveLength(1);
    expect(team.metrics[0].key).toBe('shotsTotal');
  });

  it('saknat tal -> value null (INTE 0): ett medel ska kunna hoppa posten, inte dras mot noll', () => {
    // DISKRIMINERANDE mot live-card-model (som 0:ar för stapel-bredd): här ska en saknad
    // stat ge null, så T88:s cross-match-medel inte räknar in en falsk nolla. Vore värdet 0
    // skulle detta test rödna.
    const team = normalizeTeamStats(stats(HOME, { 'Total Shots': null }));
    expect(team.metrics[0]).toMatchObject({ text: null, value: null });
  });

  it('icke-numerisk text -> value null, text bevarad', () => {
    const team = normalizeTeamStats(stats(HOME, { 'Ball Possession': 'okänt' }));
    expect(team.metrics[0]).toMatchObject({ text: 'okänt', value: null });
  });

  it('kör mot den RIKTIGA fångade statistik-blobben (skarven)', () => {
    const teams = normalizeMatchStats(fixtureLiveStatistics);
    expect(teams.length).toBeGreaterThan(0);
    // Den fångade samplen har bollinnehav , bevisar mappningen mot källans riktiga etiketter.
    const someTeam = teams[0];
    expect(someTeam.metrics.some((m) => m.key === 'possession')).toBe(true);
  });
});

/** Bygg en laguppställning. */
function lineup(over: Partial<LiveLineup> = {}): LiveLineup {
  return {
    teamApiId: HOME,
    teamName: 'England',
    formation: '4-2-3-1',
    startXI: [{ apiPlayerId: 1, name: 'GK', number: 1, position: 'G', grid: '1:1' }],
    substitutes: [{ apiPlayerId: 12, name: 'Sub', number: 12, position: 'M', grid: null }],
    coachName: 'Tränaren',
    ...over,
  };
}

describe('extractLineup', () => {
  it('projicerar formation, startelva, avbytare och tränare', () => {
    const info = extractLineup(lineup());
    expect(info).toMatchObject({
      teamApiId: HOME,
      formation: '4-2-3-1',
      coachName: 'Tränaren',
    });
    expect(info.startXI[0]).toMatchObject({ name: 'GK', number: 1, position: 'G', grid: '1:1' });
    expect(info.substitutes[0].grid).toBeNull();
  });

  it('tål saknad tränare (coachName null) utan att gissa', () => {
    expect(extractLineup(lineup({ coachName: null })).coachName).toBeNull();
  });

  it('kör mot den RIKTIGA fångade lineups-blobben (skarven): bär tränare + 11 startspelare', () => {
    const info = extractLineup(fixtureLiveLineups[0]);
    expect(info.startXI).toHaveLength(11);
    expect(info.formation).toBe('4-2-3-1');
    // Den fångade samplen är England (G. Southgate) , bevisar coach hela vägen genom parsern.
    expect(info.coachName).toBe('G. Southgate');
  });
});
