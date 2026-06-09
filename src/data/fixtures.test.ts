import { describe, expect, it } from 'vitest';
import { fixtureGroups, fixtureMatches, fixtureTeams } from './fixtures';
import { computeStandings } from '../domain/standings/compute-standings';
import { GROUP_IDS, type Match } from '../domain/types';

// Två lager av skydd för fixtures:
//   1. Typ-nivå: filen importeras och annoteras mot domäntyperna, så TS-bygget
//      (tsc -b i `npm run build`) failar om formen avviker. Dessa runtime-tester
//      kompletterar med form-/integritets-kontroller TS inte kan uttrycka.
//   2. Integritet: fixtures ska vara internt konsistenta (referenser pekar på
//      lag/grupper som faktiskt finns), annars är de en dålig stand-in för
//      live-datan och göms en bugg i konsumenterna som testar mot dem.

describe('fixtures, form och fält uppfyller domäntyperna', () => {
  it('varje Team har de obligatoriska fälten med rätt typ', () => {
    expect(fixtureTeams.length).toBeGreaterThan(0);
    for (const team of fixtureTeams) {
      expect(typeof team.id).toBe('string');
      expect(team.id.length).toBeGreaterThan(0);
      expect(typeof team.name).toBe('string');
      expect(typeof team.code).toBe('string');
      // code är FIFA:s trebokstavskod: exakt 3 versaler, inga siffror, även som
      // platshållare (kontrakts-konsistens, så UI/flagg-formattering byggs mot
      // rätt form). Vaktar mot drift tillbaka till t.ex. "AA1".
      expect(team.code).toMatch(/^[A-Z]{3}$/);
      // Gruppen måste vara ett giltigt grupp-id (A till L).
      expect(GROUP_IDS).toContain(team.group);
    }
  });

  it('lag-koderna är unika (ingen kollision mellan platshållarna)', () => {
    const codes = fixtureTeams.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('varje Match har giltig stage, status och resultat-form', () => {
    expect(fixtureMatches.length).toBeGreaterThan(0);
    for (const match of fixtureMatches) {
      expect(typeof match.id).toBe('string');
      expect(['scheduled', 'live', 'finished']).toContain(match.status);
      // En kickoff ska vara ett parsbart ISO-datum.
      expect(Number.isNaN(Date.parse(match.kickoff))).toBe(false);
      // Resultatet är antingen null eller ett par med numeriska mål.
      if (match.result !== null) {
        expect(typeof match.result.homeGoals).toBe('number');
        expect(typeof match.result.awayGoals).toBe('number');
      }
    }
  });

  it('en färdigspelad match har ett resultat (fail-loud konsistens)', () => {
    // status 'finished' utan resultat vore en tyst inkonsistens som skulle ge
    // fel i tabellberäkningen, fånga den i fixtures redan här.
    for (const match of fixtureMatches) {
      if (match.status === 'finished') {
        expect(match.result).not.toBeNull();
      }
    }
  });
});

describe('fixtures, referentiell integritet', () => {
  const teamIds = new Set(fixtureTeams.map((t) => t.id));

  it('varje grupps teamIds pekar på lag som faktiskt finns', () => {
    for (const group of fixtureGroups) {
      for (const teamId of group.teamIds) {
        expect(teamIds.has(teamId)).toBe(true);
      }
    }
  });

  it('varje lags group matchar gruppen det listas i', () => {
    for (const group of fixtureGroups) {
      for (const teamId of group.teamIds) {
        const team = fixtureTeams.find((t) => t.id === teamId);
        expect(team?.group).toBe(group.id);
      }
    }
  });

  it('varje grupp-match refererar lag som finns (inga föräldralösa referenser)', () => {
    const groupMatches = fixtureMatches.filter((m: Match) => m.stage === 'group');
    for (const match of groupMatches) {
      expect(match.homeTeamId).not.toBeNull();
      expect(match.awayTeamId).not.toBeNull();
      expect(teamIds.has(match.homeTeamId as string)).toBe(true);
      expect(teamIds.has(match.awayTeamId as string)).toBe(true);
    }
  });
});

describe('fixtures, fungerar mot härledd-state-motorn (ekvivalens fixtures <-> beräkning)', () => {
  it('en grupps fixtures-matcher går att beräkna till en tabell utan fel', () => {
    // Bevisar att fixtures är en GILTIG stand-in för live-data: den rena
    // tabellfunktionen accepterar formen och ger ett rimligt resultat.
    const groupA = fixtureGroups.find((g) => g.id === 'A');
    expect(groupA).toBeDefined();
    const groupAMatches = fixtureMatches.filter((m) => m.groupId === 'A');

    const table = computeStandings(groupA!.teamIds, groupAMatches);

    // En rad per lag i gruppen.
    expect(table).toHaveLength(groupA!.teamIds.length);
    // Summan av spelade matcher (lagvis) = 2x antal räknade matcher i gruppen.
    const countedGroupA = groupAMatches.filter((m) => m.result !== null).length;
    const totalPlayed = table.reduce((sum, r) => sum + r.played, 0);
    expect(totalPlayed).toBe(countedGroupA * 2);
  });
});
