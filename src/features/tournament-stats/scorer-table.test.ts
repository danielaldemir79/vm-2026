// Tester för den rena skytteliga-/assist-aggregeringen (T87, #179). Bevisar de
// KÄLLHÄNVISADE domänreglerna (R1-R4 i scorer-table.ts) med DISKRIMINERANDE fixtures
// (lessons "invariant-test-vars-fixtur-kollapsar-operatorn": varje regel testas med data där
// FEL tolkning ger ett ANNAT svar), plus edge (inga mål, tom data) och en NEGATIV-KONTROLL
// (ta bort egenmåls-filtret -> tally fel -> testet rödnar).
//
// Vi bygger LiveEvent-fixtures direkt (inte via DB/parser , parsern är redan testad i
// parse-live.test). Varje event har den minimi-form extractGoals läser: kind 'goal',
// minute/extra, teamApiId/teamName, player(Id/Name), assist(Id/Name), detail (straff/egenmål
// härleds ur detail, exakt som API-Football, källhänvisat i match-stats).

import { describe, expect, it } from 'vitest';
import { aggregateScoring } from './scorer-table';
import type { LiveMatchEvents } from '../../data/livescore';
import type { LiveEvent } from '../../data/livescore';

/** Bygg ett mål-event med rimliga default; override per fält. detail styr straff/egenmål. */
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

/** Slå ihop events till en match. */
function match(matchId: string, events: LiveEvent[]): LiveMatchEvents {
  return { matchId, events };
}

describe('aggregateScoring , skytteliga (R1, R2, R4)', () => {
  it('aggregerar mål per spelare över FLERA matcher (id-nyckel, R3)', () => {
    const { scorers } = aggregateScoring([
      match('m1', [goal({ playerId: 100, playerName: 'A' })]),
      match('m2', [
        goal({ playerId: 100, playerName: 'A' }),
        goal({ playerId: 200, playerName: 'B', teamApiId: 5, teamName: 'Sverige' }),
      ]),
    ]);
    const a = scorers.find((s) => s.playerId === 100);
    expect(a?.goals).toBe(2);
    expect(a?.matches).toBe(2); // distinkta matcher
    expect(scorers.find((s) => s.playerId === 200)?.goals).toBe(1);
  });

  it('STRAFFMÅL räknas som mål och noteras separat (R2)', () => {
    const { scorers } = aggregateScoring([
      match('m1', [
        goal({ playerId: 100, detail: 'Normal Goal' }),
        goal({ playerId: 100, detail: 'Penalty' }),
      ]),
    ]);
    const a = scorers.find((s) => s.playerId === 100);
    expect(a?.goals).toBe(2); // straffmålet INGÅR i totalen
    expect(a?.penalties).toBe(1); // men noteras som "varav straff"
  });

  it('EGENMÅL räknas INTE som skyttens mål (R1)', () => {
    const { scorers } = aggregateScoring([
      match('m1', [
        goal({ playerId: 100, detail: 'Normal Goal' }),
        // Egenmål av spelare 999 , ska EJ ge 999 ett mål, och EJ påverka 100.
        goal({ playerId: 999, playerName: 'Olycksfågel', detail: 'Own Goal' }),
      ]),
    ]);
    expect(scorers.find((s) => s.playerId === 100)?.goals).toBe(1);
    // Egenmåls-skytten finns INTE i skytteligan (ett egenmål är aldrig skyttens mål).
    expect(scorers.find((s) => s.playerId === 999)).toBeUndefined();
  });

  it('mål utan känt spelar-id HOPPAS (R3, gissa aldrig en skytt)', () => {
    const { scorers } = aggregateScoring([
      match('m1', [
        goal({ playerId: null, playerName: null }),
        goal({ playerId: 100, playerName: 'A' }),
      ]),
    ]);
    expect(scorers).toHaveLength(1);
    expect(scorers[0]?.playerId).toBe(100);
  });

  it('RANKING: flest mål först, delad ledning bryts på FÄRRE matcher (R4)', () => {
    const { scorers } = aggregateScoring([
      // Spelare 1: 2 mål på 1 match. Spelare 2: 2 mål på 2 matcher. Lika mål -> färre
      // matcher vinner, så spelare 1 rankas FÖRE spelare 2 (diskriminerande: olika matcher).
      match('m1', [
        goal({ playerId: 1, playerName: 'Ett' }),
        goal({ playerId: 1, playerName: 'Ett' }),
      ]),
      match('m2', [goal({ playerId: 2, playerName: 'Tva' })]),
      match('m3', [goal({ playerId: 2, playerName: 'Tva' })]),
    ]);
    expect(scorers.map((s) => s.playerId)).toEqual([1, 2]);
    expect(scorers[0]?.matches).toBe(1);
    expect(scorers[1]?.matches).toBe(2);
  });

  it('DELAD ledning, lika mål OCH matcher: bryts på fler assists, sedan namn (R4, deterministisk)', () => {
    const { scorers } = aggregateScoring([
      match('m1', [
        // Båda 1 mål på 1 match. "Bertil" har dessutom en assist (annat mål), så rankas före
        // "Adam". Utan assist-tie-break skulle namn (Adam < Bertil) ge omvänd ordning , just
        // det gör fixturen diskriminerande för assist-grenen.
        goal({ playerId: 10, playerName: 'Adam' }),
        goal({ playerId: 20, playerName: 'Bertil', assistId: 20, assistName: 'Bertil' }),
        goal({ playerId: 30, playerName: 'Cesar', assistId: 20, assistName: 'Bertil' }),
      ]),
    ]);
    // Adam: 1 mål 0 assist. Bertil: 1 mål 2 assist. Cesar: 1 mål 0 assist.
    // Mål lika (1), matcher lika (1) -> fler assists: Bertil först; sedan Adam vs Cesar på namn.
    expect(scorers.map((s) => s.playerId)).toEqual([20, 10, 30]);
  });
});

describe('aggregateScoring , assist-liga', () => {
  it('rankar spelare på assists; lagtillhörighet = målets lag', () => {
    const { assisters } = aggregateScoring([
      match('m1', [
        goal({
          playerId: 1,
          teamApiId: 6,
          teamName: 'Brasilien',
          assistId: 50,
          assistName: 'Passaren',
        }),
        goal({
          playerId: 2,
          teamApiId: 6,
          teamName: 'Brasilien',
          assistId: 50,
          assistName: 'Passaren',
        }),
      ]),
      match('m2', [
        goal({ playerId: 3, teamApiId: 5, teamName: 'Sverige', assistId: 60, assistName: 'Annan' }),
      ]),
    ]);
    expect(assisters[0]?.playerId).toBe(50);
    expect(assisters[0]?.assists).toBe(2);
    expect(assisters[0]?.teamName).toBe('Brasilien');
    expect(assisters.find((a) => a.playerId === 60)?.assists).toBe(1);
  });

  it('mål UTAN assist ger ingen assist-rad (vanligt fall)', () => {
    const { assisters } = aggregateScoring([
      match('m1', [goal({ playerId: 1, assistId: null, assistName: null })]),
    ]);
    expect(assisters).toHaveLength(0);
  });

  it('en målskytt som också assisterat står i BÅDA ligorna', () => {
    const { scorers, assisters } = aggregateScoring([
      match('m1', [
        goal({ playerId: 1, playerName: 'Stjarnan' }),
        goal({ playerId: 2, playerName: 'Lagkamrat', assistId: 1, assistName: 'Stjarnan' }),
      ]),
    ]);
    expect(scorers.find((s) => s.playerId === 1)?.goals).toBe(1);
    expect(assisters.find((a) => a.playerId === 1)?.assists).toBe(1);
  });
});

describe('aggregateScoring , edge', () => {
  it('tom input -> två tomma listor (ingen krasch)', () => {
    expect(aggregateScoring([])).toEqual({ scorers: [], assisters: [] });
  });

  it('matcher utan mål än (bara kort/byten/inga events) -> tomma listor', () => {
    const card: LiveEvent = {
      minute: 30,
      extra: null,
      kind: 'card',
      rawType: 'Card',
      detail: 'Yellow Card',
      teamApiId: 6,
      teamName: 'Brasilien',
      playerId: 100,
      playerName: 'A',
      assistId: null,
      assistName: null,
      cardColor: 'yellow',
    };
    const { scorers, assisters } = aggregateScoring([match('m1', [card]), match('m2', [])]);
    expect(scorers).toHaveLength(0);
    expect(assisters).toHaveLength(0);
  });

  it('BARA egenmål i hela turneringen -> tom skytteliga (R1, degenererat randfall)', () => {
    // Den gren där egenmåls-filtret är ENDA skillnaden mot fel tally: om filtret tas bort
    // skulle egenmåls-skytten få ett mål och listan bli icke-tom. Testar garantin DÄR den
    // lättast bryts (befordrad lärdom "testa garantin där den lättast bryts").
    const { scorers } = aggregateScoring([
      match('m1', [goal({ playerId: 999, playerName: 'Olycksfågel', detail: 'Own Goal' })]),
    ]);
    expect(scorers).toHaveLength(0);
  });
});

describe('aggregateScoring , NEGATIV-KONTROLL (egenmåls-filtret)', () => {
  // Bevisar att egenmåls-EXKLUDERINGEN (R1) verkligen bär resultatet: om en konsument
  // RÄKNADE egenmålet som skyttens mål (filtret borta), skulle dessa assertions FÅNGA felet.
  // Vi kan inte mutera produktionskoden i ett test, så vi verifierar mot en LOKAL felaktig
  // referens-aggregering (egenmål inräknade) och bekräftar att den ger ETT ANNAT, FEL svar ,
  // dvs filtret är diskriminerande, inte dekoration.
  it('en korrekt-vs-felaktig referens skiljer sig (filtret är diskriminerande)', () => {
    const matches: LiveMatchEvents[] = [
      match('m1', [
        goal({ playerId: 100, playerName: 'Riktig skytt', detail: 'Normal Goal' }),
        goal({ playerId: 999, playerName: 'Egenmål', detail: 'Own Goal' }),
      ]),
    ];

    // KORREKT (produktionen): egenmål exkluderat -> bara den riktiga skytten.
    const correct = aggregateScoring(matches);
    expect(correct.scorers.map((s) => s.playerId)).toEqual([100]);

    // FELAKTIG referens: räkna ALLA mål som skytt-mål (filtret borttaget). Denna SKA ge ett
    // annat svar (egenmåls-skytten 999 dyker upp), vilket bevisar att filtret faktiskt ändrar
    // utfallet , annars vore R1-testerna ovan tomma (icke-diskriminerande fixtur).
    const wrong = new Map<number, number>();
    for (const m of matches) {
      for (const ev of m.events) {
        if (ev.kind === 'goal' && ev.playerId !== null) {
          wrong.set(ev.playerId, (wrong.get(ev.playerId) ?? 0) + 1);
        }
      }
    }
    expect([...wrong.keys()].sort()).toEqual([100, 999]); // fel tally har 999 med
    // Och korrekt != fel: den extra (felaktiga) skytten finns INTE i produktionens utfall.
    expect(correct.scorers.some((s) => s.playerId === 999)).toBe(false);
  });
});
