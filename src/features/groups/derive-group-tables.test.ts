import { describe, expect, it } from 'vitest';
import { deriveGroupTables } from './derive-group-tables';
import { fixtureGroups, fixtureMatches } from '../../data/fixtures';
import { GROUP_IDS } from '../../domain/types';
import type { Group, Match } from '../../domain/types';

// Hjälpare: bygg en färdigspelad gruppmatch kort och typkorrekt.
function fin(
  id: string,
  groupId: Group['id'],
  home: string,
  away: string,
  hg: number,
  ag: number
): Match {
  return {
    id,
    stage: 'group',
    groupId,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-12T19:00:00Z',
    venue: 'Testarena',
    result: { homeGoals: hg, awayGoals: ag },
    status: 'finished',
  };
}

describe('deriveGroupTables, härleder tabeller per grupp', () => {
  it('ger en tabell per grupp i datakällan (fixtures = 12 grupper A-L)', () => {
    const tables = deriveGroupTables(fixtureGroups, fixtureMatches);

    // Fixtures bär nu den verifierade datan: alla 12 grupper.
    expect(tables).toHaveLength(12);
    expect(tables.map((t) => t.groupId)).toEqual([...GROUP_IDS]);
  });

  it('varje tabell har en rad per lag i gruppen (4 lag i VM 2026-formatet)', () => {
    const tables = deriveGroupTables(fixtureGroups, fixtureMatches);
    for (const table of tables) {
      expect(table.standings).toHaveLength(4);
    }
  });

  it('returnerar grupperna i kanonisk A-L-ordning oavsett inkommande ordning', () => {
    // Skicka in grupperna i omvänd ordning, resultatet ska ändå vara A-L.
    const reversed = [...fixtureGroups].reverse();
    const tables = deriveGroupTables(reversed, fixtureMatches);
    expect(tables.map((t) => t.groupId)).toEqual([...GROUP_IDS]);
  });

  it('en grupp utan spelade matcher får en nollställd tabell (inte tom)', () => {
    // En enda grupp, inga matcher: tabellen ska ha 4 noll-rader, inte saknas.
    const oneGroup: Group[] = [{ id: 'A', teamIds: ['t1', 't2', 't3', 't4'] }];
    const tables = deriveGroupTables(oneGroup, []);

    expect(tables).toHaveLength(1);
    expect(tables[0].standings).toHaveLength(4);
    for (const row of tables[0].standings) {
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
    }
  });

  it('ignorerar slutspelsmatcher (groupId null) och förorenar inte grupptabellen', () => {
    const oneGroup: Group[] = [{ id: 'A', teamIds: ['t1', 't2', 't3', 't4'] }];
    const knockout: Match = {
      id: 'r32',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: 't1',
      awayTeamId: 't2',
      kickoff: '2026-07-01T19:00:00Z',
      venue: 'Slutspelsarena',
      result: { homeGoals: 5, awayGoals: 0 },
      status: 'finished',
    };

    const tables = deriveGroupTables(oneGroup, [knockout]);
    // Slutspelsmålen får inte räknas in i grupptabellen.
    for (const row of tables[0].standings) {
      expect(row.played).toBe(0);
      expect(row.goalsFor).toBe(0);
    }
  });

  it('sorterar enligt FIFA-ordningen (vinnaren först, rank 1-baserad)', () => {
    // t1 vinner båda, t4 förlorar båda: t1 ska ligga först (rank 1), t4 sist.
    const oneGroup: Group[] = [{ id: 'A', teamIds: ['t1', 't2', 't3', 't4'] }];
    const matches: Match[] = [
      fin('m1', 'A', 't1', 't2', 2, 0),
      fin('m2', 'A', 't1', 't3', 3, 0),
      fin('m3', 'A', 't4', 't2', 0, 1),
    ];

    const table = deriveGroupTables(oneGroup, matches)[0];

    expect(table.standings[0].teamId).toBe('t1');
    expect(table.standings[0].rank).toBe(1);
    // Rank är sammanhängande 1..4.
    expect(table.standings.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe('deriveGroupTables, edge-fall: helt lika lag (FIFA-tiebreak, T4 F1-motor)', () => {
  // Verifierar att gruppspelsvyns härledning följer hela computeStandings
  // tiebreak-kedjan (inbördes a-c -> steg 2 re-iteration/fallback -> total MS),
  // inte en naiv sortering. Scenariot nedan konstruerar en inbördes-CYKEL mellan
  // tre lika lag (a-c kan INTE skilja dem, just det läge resolveTiedGroup måste
  // hantera), så ordningen mellan dem måste komma ur de övergripande kriterierna
  // (total målskillnad), inte ur inbördes. Den uttömmande re-iterations-logiken i
  // sig är hårt enhetstestad i compute-standings.test.ts ("STEG 2: RE-ITERATION");
  // här bevisar vi att UI-datalagret ärver exakt den ordningen.
  it('ordnar en inbördes-lika delmängd via total målskillnad, inte en gissning', () => {
    const group: Group[] = [{ id: 'A', teamIds: ['a', 'b', 'c', 'd'] }];

    // a, b, c slår d olika tungt (total MS skiljer dem), men inbördes (a>b, b>c,
    // c>a en cykel) ger lika inbördes a-c för alla tre, så a-c är uttömt och
    // ordningen faller till total MS (d-e).
    const matches: Match[] = [
      // Inbördes cykel mellan a, b, c: var och en vinner en och förlorar en med
      // samma marginal, så inbördes poäng + MS + mål blir lika för alla tre.
      fin('ab', 'A', 'a', 'b', 1, 0),
      fin('bc', 'A', 'b', 'c', 1, 0),
      fin('ca', 'A', 'c', 'a', 1, 0),
      // Alla tre slår d, men med OLIKA marginal -> total MS skiljer dem.
      fin('ad', 'A', 'a', 'd', 1, 0),
      fin('bd', 'A', 'b', 'd', 3, 0),
      fin('cd', 'A', 'c', 'd', 5, 0),
    ];

    const table = deriveGroupTables(group, matches)[0];
    const order = table.standings.map((r) => r.teamId);

    // d är sist (förlorade allt), det är otvetydigt.
    expect(order[3]).toBe('d');
    // a, b, c står HELT lika på inbördes a-c (cykeln), så ordningen mellan dem
    // avgörs av total MS (d-e): c (+5 mot d, +1/-1 cykel = +5) > b (+3) > a (+1).
    // Bevisar att härledningen följer computeStandings exakta tiebreak-kedja.
    expect(order.slice(0, 3)).toEqual(['c', 'b', 'a']);
    expect(table.standings.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('är deterministisk för fullständigt lika lag (samma indata -> samma ordning)', () => {
    // Inga matcher alls: alla 4 lag står exakt lika (0 överallt). FIFA skulle gå
    // till fair play/ranking (utanför scope), computeStandings faller till stabil
    // teamId-ordning. Vi verifierar bara DETERMINISMEN (inte en specifik FIFA-
    // ordning som datan inte tillåter), så vyn aldrig "flaxar" mellan körningar.
    const group: Group[] = [{ id: 'A', teamIds: ['delta', 'alfa', 'charlie', 'bravo'] }];

    const first = deriveGroupTables(group, [])[0].standings.map((r) => r.teamId);
    const second = deriveGroupTables(group, [])[0].standings.map((r) => r.teamId);

    expect(first).toEqual(second);
    // Stabil teamId-fallback = alfabetisk på id.
    expect(first).toEqual(['alfa', 'bravo', 'charlie', 'delta']);
  });
});
