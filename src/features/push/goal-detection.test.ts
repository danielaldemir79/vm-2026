// Tester för mål-detekteringen (T89, #182). Fokus på de gissningskänsliga grenarna med
// DISKRIMINERANDE data (lessons "lattgissad-domanregel" + "invariant-test"):
//  - NY-mål-diff via STABIL signatur (G1): re-poll som SKRIVER OM hela blobben re-detekterar
//    INGET känt mål (den dyraste bugg-klassen , negativ-kontroll på dedupen),
//  - scoring-sidan ur ställnings-deltat (G2) , egenmåls-SÄKER (event-laget pekar fel, deltat rätt),
//  - notis-formuleringen (G3): "Spanien 2-1", lag-neutral fallback, minimal fallback,
//  - fel-/edge-vägar: tomma listor, snabba på-varandra-mål, ett BORTTAGET mål (korrigering/VAR)
//    notifierar ALDRIG negativt.

import { describe, expect, it } from 'vitest';
import {
  diffNewGoals,
  formatGoalNotification,
  goalSignature,
  resolveCelebratedTeamName,
  scoringSideFromScoreDelta,
  type DetectedGoal,
} from './goal-detection';
import type { LiveEvent } from '../../data/livescore';
import type { MatchGoal } from '../../data/match-stats';

const HOME = 9; // Spanien (hemma i exemplen)
const AWAY = 14; // Kroatien (borta)

/** Bygg ett LiveEvent (mål default), override per test , samma form parse-live/extractGoals tar. */
function ev(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 10,
    extra: null,
    kind: 'goal',
    rawType: 'Goal',
    detail: 'Normal Goal',
    teamApiId: HOME,
    teamName: 'Spanien',
    playerId: 100,
    playerName: 'A. Skytt',
    assistId: null,
    assistName: null,
    cardColor: null,
    comments: null,
    ...over,
  };
}

/** Bygg ett MatchGoal direkt (för goalSignature-tester som inte behöver hela event-formen). */
function goal(over: Partial<MatchGoal> = {}): MatchGoal {
  return {
    minute: 10,
    extra: null,
    teamApiId: HOME,
    teamName: 'Spanien',
    scorerId: 100,
    scorerName: 'A. Skytt',
    assistId: null,
    assistName: null,
    isPenalty: false,
    isOwnGoal: false,
    ...over,
  };
}

describe('goalSignature (G1: stabil dedup-nyckel)', () => {
  it('är identisk för samma mål oavsett surrounding events (re-poll-stabil)', () => {
    const g = goal();
    expect(goalSignature(g, 'g-A-1')).toBe(goalSignature({ ...g }, 'g-A-1'));
  });

  it('skiljer två mål i SAMMA minut på straff-flaggan (straff vs vanligt) , annars krock', () => {
    const normal = goalSignature(goal({ minute: 50, isPenalty: false }), 'g-A-1');
    const penalty = goalSignature(goal({ minute: 50, isPenalty: true }), 'g-A-1');
    expect(normal).not.toBe(penalty);
  });

  it('skiljer ett egenmål från ett vanligt i samma minut (egenmåls-flaggan)', () => {
    const normal = goalSignature(goal({ minute: 50, isOwnGoal: false }), 'g-A-1');
    const own = goalSignature(goal({ minute: 50, isOwnGoal: true }), 'g-A-1');
    expect(normal).not.toBe(own);
  });

  it('skiljer samma minut/skytt i OLIKA matcher (matchId scopar signaturen)', () => {
    const g = goal();
    expect(goalSignature(g, 'g-A-1')).not.toBe(goalSignature(g, 'g-B-2'));
  });

  it('är deterministisk med null-fält (skytt-id null skrivs som tom sträng, ingen "undefined")', () => {
    const sig = goalSignature(goal({ scorerId: null, scorerName: null }), 'g-A-1');
    expect(sig).not.toContain('undefined');
    // Fält: matchId|minut|tillägg|lag-id|skytt-id|skytt-namn|straff|egenmål. extra/scorerId/
    // scorerName är null + ej straff/egenmål -> tomma segment (deterministisk, ingen "undefined").
    expect(sig).toBe('g-A-1|10||9|||' + '|');
  });
});

describe('diffNewGoals (G1: nya mål mot redan kända)', () => {
  it('detekterar BARA mål som saknas i den gamla listan', () => {
    const first = ev({ minute: 10, playerId: 1, playerName: 'Ett' });
    const second = ev({
      minute: 25,
      playerId: 2,
      playerName: 'Två',
      teamApiId: AWAY,
      teamName: 'Kroatien',
    });
    const detected = diffNewGoals([first], [first, second], 'g-A-1');
    expect(detected).toHaveLength(1);
    expect(detected[0].goal.scorerName).toBe('Två');
  });

  it('NEGATIV KONTROLL (re-poll skriver OM hela blobben): inga KÄNDA mål re-detekteras', () => {
    // Den dyraste bugg-klassen: en re-poll levererar en NY lista som innehåller samma mål
    // (kanske kompletterad med assist/namn-städning) , ett index-baserat diff skulle
    // re-notifiera. Signatur-mängd-diffen ger [] eftersom signaturerna är identiska.
    const g1 = ev({ minute: 10, playerId: 1, playerName: 'Ett' });
    const g2 = ev({ minute: 25, playerId: 2, playerName: 'Två' });
    const rewritten = [
      ev({ minute: 10, playerId: 1, playerName: 'Ett' }), // samma signatur
      ev({ minute: 25, playerId: 2, playerName: 'Två' }),
    ];
    expect(diffNewGoals([g1, g2], rewritten, 'g-A-1')).toEqual([]);
  });

  it('identiska listor ger inga nya mål (idempotent re-poll utan ny händelse)', () => {
    const list = [ev({ minute: 10 }), ev({ minute: 70, playerId: 5 })];
    expect(diffNewGoals(list, list, 'g-A-1')).toEqual([]);
  });

  it('ett BORTTAGET mål (VAR-annullering/korrigering) notifierar ALDRIG negativt', () => {
    // NYA listan är KORTARE (ett mål togs bort). Inga NYA signaturer -> [].
    const before = [ev({ minute: 10, playerId: 1 }), ev({ minute: 30, playerId: 2 })];
    const after = [ev({ minute: 10, playerId: 1 })]; // 30-minutersmålet annullerat
    expect(diffNewGoals(before, after, 'g-A-1')).toEqual([]);
  });

  it('snabba på-varandra-mål: två nya i samma poll detekteras BÅDA (kronologiskt)', () => {
    const old = [ev({ minute: 10, playerId: 1, playerName: 'Ett' })];
    const next = [
      ev({ minute: 10, playerId: 1, playerName: 'Ett' }),
      ev({ minute: 11, playerId: 2, playerName: 'Två' }),
      ev({ minute: 12, playerId: 3, playerName: 'Tre' }),
    ];
    const detected = diffNewGoals(old, next, 'g-A-1');
    expect(detected.map((d) => d.goal.scorerName)).toEqual(['Två', 'Tre']);
  });

  it('ignorerar icke-mål-events (kort/byte) , bara mål diffas', () => {
    const old: LiveEvent[] = [];
    const next: LiveEvent[] = [
      ev({ kind: 'card', cardColor: 'yellow', detail: 'Yellow Card', minute: 5 }),
      ev({ kind: 'subst', rawType: 'subst', minute: 46 }),
      ev({ minute: 60, playerId: 9, playerName: 'Skytt' }),
    ];
    const detected = diffNewGoals(old, next, 'g-A-1');
    expect(detected).toHaveLength(1);
    expect(detected[0].goal.scorerName).toBe('Skytt');
  });

  it('tom NYA lista ger inga mål (matchen hade inga events än)', () => {
    expect(diffNewGoals([ev()], [], 'g-A-1')).toEqual([]);
  });
});

describe('scoringSideFromScoreDelta (G2: egenmåls-säker sida ur ställnings-deltat)', () => {
  it('home ökade -> "home"', () => {
    expect(scoringSideFromScoreDelta({ home: 1, away: 1 }, { home: 2, away: 1 })).toBe('home');
  });

  it('away ökade -> "away"', () => {
    expect(scoringSideFromScoreDelta({ home: 1, away: 0 }, { home: 1, away: 1 })).toBe('away');
  });

  it('första målet (OLD null = 0) -> rätt sida', () => {
    expect(scoringSideFromScoreDelta({ home: null, away: null }, { home: 1, away: 0 })).toBe(
      'home'
    );
  });

  it('EGENMÅL-SÄKERT (DISKRIMINERANDE): event-laget vore fel, deltat rätt', () => {
    // Bortalaget gör ett egenmål -> API krediterar HEMMALAGET (goals.home ökar). Ett naivt
    // "läs event-lagets id" skulle fira bortalaget (fel). Deltat ger 'home' (rätt). Detta är
    // testet som RÖDNAR om någon byter till event-lag-baserad sida.
    expect(scoringSideFromScoreDelta({ home: 0, away: 0 }, { home: 1, away: 0 })).toBe('home');
  });

  it('ett NEW-värde saknas -> null (kan inte räkna delta)', () => {
    expect(scoringSideFromScoreDelta({ home: 1, away: 0 }, { home: null, away: 1 })).toBeNull();
  });

  it('ingen ökning (oförändrad ställning) -> null', () => {
    expect(scoringSideFromScoreDelta({ home: 2, away: 1 }, { home: 2, away: 1 })).toBeNull();
  });

  it('en MINSKNING (korrigering) -> null (inget mål att fira)', () => {
    expect(scoringSideFromScoreDelta({ home: 2, away: 1 }, { home: 1, away: 1 })).toBeNull();
  });

  it('båda ökade (ihopslagna poll-steg) -> null (ej entydigt)', () => {
    expect(scoringSideFromScoreDelta({ home: 0, away: 0 }, { home: 1, away: 1 })).toBeNull();
  });
});

describe('formatGoalNotification (G3: "MÅL!" + "<lag> <firade>-<motståndare>", scoring-team-först)', () => {
  it('home gjorde mål: "Spanien 2-1" (hemma-siffran leder)', () => {
    const n = formatGoalNotification('home', { home: 2, away: 1 }, 'Spanien');
    expect(n.title).toBe('MÅL!');
    expect(n.body).toBe('Spanien 2-1');
  });

  it('away gjorde mål: ORIENTERAS scoring-team-först "Kroatien 2-1" (borta-siffran leder)', () => {
    // Ställningen är hemma 1, borta 2. Kroatien (borta) gjorde målet -> dess 2 leder: "Kroatien 2-1".
    // Detta är det DISKRIMINERANDE fallet: en naiv hemma-borta-ordning skulle ge "Kroatien 1-2".
    const n = formatGoalNotification('away', { home: 1, away: 2 }, 'Kroatien');
    expect(n.body).toBe('Kroatien 2-1');
  });

  it('EGENMÅL: gynnat lag firas (sidan ur deltat), scoring-team-först', () => {
    // Bortalag gör egenmål -> home gynnas (side='home' ur deltat), firat lag = Spanien.
    const n = formatGoalNotification('home', { home: 1, away: 0 }, 'Spanien');
    expect(n.body).toBe('Spanien 1-0');
  });

  it('okänd sida (null) men känd ställning -> lag-neutral "Mål! 2-1" (hemma-borta)', () => {
    const n = formatGoalNotification(null, { home: 2, away: 1 }, 'Spanien');
    expect(n.body).toBe('Mål! 2-1');
  });

  it('känd sida men okänt lagnamn (null) -> lag-neutral', () => {
    const n = formatGoalNotification('home', { home: 2, away: 1 }, null);
    expect(n.body).toBe('Mål! 2-1');
  });

  it('saknad ställning (något null) -> minimal "Mål i matchen!"', () => {
    expect(formatGoalNotification('home', { home: null, away: null }, 'Spanien').body).toBe(
      'Mål i matchen!'
    );
    expect(formatGoalNotification('away', { home: 1, away: null }, 'Spanien').body).toBe(
      'Mål i matchen!'
    );
  });

  it('default-url är "/", kan överstyras (djuplänk)', () => {
    expect(formatGoalNotification('home', { home: 1, away: 0 }, 'Spanien').url).toBe('/');
    expect(
      formatGoalNotification('home', { home: 1, away: 0 }, 'Spanien', '/?match=g-A-1').url
    ).toBe('/?match=g-A-1');
  });

  it('ingen em-dash i notis-texten (voice-regel) , bara siffer-bindestreck', () => {
    const n = formatGoalNotification('home', { home: 3, away: 2 }, 'Spanien');
    expect(n.body).not.toContain('—'); // em-dash
    expect(n.body).not.toContain('–'); // en-dash
    expect(n.body).toContain('-'); // vanligt bindestreck i ställningen
  });
});

describe('resolveCelebratedTeamName (G2: firat lag utan home/away-ordning, egenmåls-säkert)', () => {
  function detected(over: Partial<MatchGoal> = {}): DetectedGoal {
    const g = goal(over);
    return { signature: goalSignature(g, 'g-A-1'), goal: g };
  }

  it('vanligt mål: firat lag = mål-eventets lag (direkt)', () => {
    const d = detected({ teamApiId: HOME, teamName: 'Spanien', isOwnGoal: false });
    expect(resolveCelebratedTeamName(d, [ev({ teamApiId: HOME, teamName: 'Spanien' })])).toBe(
      'Spanien'
    );
  });

  it('EGENMÅL: firat lag = MOTSTÅNDAREN (annat teamApiId i matchens events)', () => {
    // Egenmålet är attribuerat till AWAY (Kroatien, konceder). Det gynnade laget är HOME
    // (Spanien) , vi hittar dess namn ur ett HOME-event. En naiv "eventets lag" vore fel.
    const d = detected({ teamApiId: AWAY, teamName: 'Kroatien', isOwnGoal: true });
    const allEvents: LiveEvent[] = [
      ev({ teamApiId: AWAY, teamName: 'Kroatien', detail: 'Own Goal' }),
      ev({ teamApiId: HOME, teamName: 'Spanien', minute: 5 }),
    ];
    expect(resolveCelebratedTeamName(d, allEvents)).toBe('Spanien');
  });

  it('EGENMÅL utan annat lags event i matchen -> null (gissa aldrig)', () => {
    const d = detected({ teamApiId: AWAY, teamName: 'Kroatien', isOwnGoal: true });
    expect(
      resolveCelebratedTeamName(d, [ev({ teamApiId: AWAY, teamName: 'Kroatien' })])
    ).toBeNull();
  });
});
