// Tester för facit-härledningen (T17, #17). FOKUS: den KRITISKA code-vs-id-seamen
// (T16 F1) bevisas med RIKTIGT härlett facit (computeStandings/deriveBracket körda
// på en produktions-grupp-fixture) mot code-lagrade tips, + edge-/fel-vägar.

import { describe, expect, it } from 'vitest';
import type { Group, GroupId, Match, Team } from '../../domain/types';
import { WC2026_GROUPS, WC2026_TEAM_BASES, teamId } from '../../data/wc2026/team-refs';
import { computeStandings } from '../../domain/standings/compute-standings';
import {
  scoreGroupPrediction,
  scoreBracketAdvance,
  type GroupOutcome,
} from '../../data/predictions';
import { derivePoolFacit } from './derive-facit';

/* ------------------------------------------------------------------ *
 * Test-data: produktions-lagen + en RIKTIG grupp gjord färdigspelad.
 * ------------------------------------------------------------------ */

/** Produktions-lagen som Team[] (id/code/grupp räcker för facit-mappningen). */
const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

/** En färdigspelad gruppmatch mellan två gemena lag-id i grupp `g`. */
function groupMatch(g: GroupId, homeId: string, awayId: string, hg: number, ag: number): Match {
  return {
    id: `${g}-${homeId}-${awayId}`,
    stage: 'group',
    groupId: g,
    homeTeamId: homeId,
    awayTeamId: awayId,
    kickoff: '2026-06-12T18:00:00Z',
    venue: 'Arena',
    status: 'finished',
    result: { homeGoals: hg, awayGoals: ag },
  };
}

/**
 * Alla 6 färdigspelade matcher i en 4-lagsgrupp så lagen får distinkta poäng
 * (lag1 1:a, lag2 2:a, lag3 3:a, lag4 4:a). teamIds i POSITIONS-ordning.
 */
function finishedGroupMatches(g: GroupId, teamIds: readonly string[]): Match[] {
  const [t1, t2, t3, t4] = teamIds;
  return [
    groupMatch(g, t1, t2, 1, 0), // t1 slår t2
    groupMatch(g, t1, t3, 2, 0),
    groupMatch(g, t1, t4, 3, 0),
    groupMatch(g, t2, t3, 2, 0), // t2 näst bäst
    groupMatch(g, t2, t4, 2, 0),
    groupMatch(g, t3, t4, 1, 0), // t3 slår t4
  ];
}

describe('derivePoolFacit, matchfacit (avgjorda matcher, grupp OCH slutspel)', () => {
  it('tar bara FÄRDIGSPELADE gruppmatcher (scheduled/live ger inget facit)', () => {
    const matches: Match[] = [
      groupMatch('A', teamId('MEX'), teamId('RSA'), 2, 1),
      {
        ...groupMatch('A', teamId('KOR'), teamId('CZE'), 0, 0),
        status: 'scheduled',
        result: null,
      } as Match,
    ];
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, matches);
    expect(facit.matches).toHaveLength(1);
    expect(facit.matches[0]).toEqual({
      matchId: `A-${teamId('MEX')}-${teamId('RSA')}`,
      actual: { homeGoals: 2, awayGoals: 1 },
    });
  });

  // KORREKTHETS-REGRESSION (Copilot C1): matchtipset poängsätts på ORDINARIE mål i
  // ALLA tippbara matcher, grupp SOM slutspel (docs/decisions.md T15 §2). Ett
  // färdigspelat slutspel MÅSTE därför ge ett matchfacit, annars missar topplistan
  // + reveal slutspelets matchpoäng. (Tidigare bugg: deriveMatchFacit filtrerade på
  // stage === 'group' och tappade alla slutspelsmatcher.)
  it('INKLUDERAR färdigspelade SLUTSPELS-matcher i matchfacit (ordinarie mål, T15 §2)', () => {
    const matches: Match[] = [
      {
        id: 'M73',
        stage: 'round-of-32',
        groupId: null,
        homeTeamId: teamId('BRA'),
        awayTeamId: teamId('ARG'),
        kickoff: '2026-07-01T19:00:00Z',
        venue: 'Arena',
        status: 'finished',
        result: { homeGoals: 1, awayGoals: 0 },
      },
    ];
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, matches);
    expect(facit.matches).toHaveLength(1);
    expect(facit.matches[0]).toEqual({
      matchId: 'M73',
      actual: { homeGoals: 1, awayGoals: 0 },
    });
  });

  // STRAFF-AVGJORT SLUTSPEL: matchfacit bär ORDINARIE ställning (1-1 = 'draw'),
  // straffarna styr bara slutspelsTRÄDET (bracket-facit), inte matchpoängen. Bevisar
  // att match- och bracket-facit är skilda plan (ingen dubbelräkning), T15 §2 + §4.
  it('straff-avgjort slutspel: matchfacit är ORDINARIE ställning, straffar ignoreras', () => {
    const matches: Match[] = [
      {
        id: 'M73',
        stage: 'round-of-32',
        groupId: null,
        homeTeamId: teamId('BRA'),
        awayTeamId: teamId('ARG'),
        kickoff: '2026-07-01T19:00:00Z',
        venue: 'Arena',
        status: 'finished',
        result: { homeGoals: 1, awayGoals: 1, penalties: { homeGoals: 4, awayGoals: 3 } },
      },
    ];
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, matches);
    expect(facit.matches).toHaveLength(1);
    // Ordinarie mål 1-1, INTE straffarna. scorePrediction läser detta som 'draw'.
    expect(facit.matches[0].actual).toEqual({ homeGoals: 1, awayGoals: 1 });
  });
});

describe('derivePoolFacit, grupp-facit (1:a/2:a ur klar grupp)', () => {
  it('ger facit FÖRST när gruppen är färdigspelad (alla lag 3 matcher)', () => {
    const groupC = WC2026_GROUPS.find((g) => g.id === 'C')!;
    // Bara EN match spelad: gruppen är inte klar -> inget grupp-facit.
    const partial = [groupMatch('C', groupC.teamIds[0], groupC.teamIds[1], 1, 0)];
    expect(derivePoolFacit(TEAMS, WC2026_GROUPS, partial).groups).toHaveLength(0);
  });

  // KRITISKT SEAM-TEST (T16 F1): RIKTIGT härlett facit (id) mot code-lagrat tips.
  it('CODE-VS-ID-SEAM: grupp-facit är CODE (versal), så code-lagrat tips ger full poäng (5), inte tyst 0', () => {
    const groupC = WC2026_GROUPS.find((g) => g.id === 'C')!;
    const matches = finishedGroupMatches('C', groupC.teamIds);

    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, matches);
    const groupFacit = facit.groups.find((f) => f.groupId === 'C')!;

    // Facit MÅSTE vara i CODE-rymden (versal), inte gemen id. Grupp C = bra/mar/...
    // Härlett 1:a är teamIds[0] (gemen "bra"), mappat till code "BRA".
    expect(groupFacit.actual.winnerTeamId).toBe('BRA');
    expect(groupFacit.actual.runnerUpTeamId).toBe('MAR');

    // Tipset lagras som versal FIFA-code. Full poäng (3 + 2 = 5) bevisar att
    // facit-sidan mappades till code (annars 'BRA' === 'bra' = false -> tyst 0).
    const predicted = { winnerTeamId: 'BRA', runnerUpTeamId: 'MAR' };
    expect(scoreGroupPrediction(predicted, groupFacit.actual)).toBe(5);
  });

  // NEGATIV KONTROLL (att seam-testet NÅR grenen): bevisa att om facit INTE
  // mappades (lämnades i gemen id), skulle samma code-lagrade tips ge TYST 0 mot
  // en NORMALISERINGS-FRI jämförelse. Detta visar att grenen är vad som skyddar.
  it('negativ kontroll: ett RÅTT id-facit (omappat) mot code-tips ger 0 vid ren strängjämförelse (seamen NÅS)', () => {
    const groupC = WC2026_GROUPS.find((g) => g.id === 'C')!;
    const matches = finishedGroupMatches('C', groupC.teamIds);
    const standings = computeStandings(groupC.teamIds, matches);
    const rawIdFacit: GroupOutcome = {
      winnerTeamId: standings.find((r) => r.rank === 1)!.teamId, // "bra" (gemen)
      runnerUpTeamId: standings.find((r) => r.rank === 2)!.teamId, // "mar"
    };
    // Sanity: det RÅA facit är i id-rymden (gemen), så seamen testas på riktigt.
    expect(rawIdFacit.winnerTeamId).toBe('bra');
    // En REN strängjämförelse (utan normalisering) mot code-tipset ger 0 -> det
    // är exakt den tysta-noll-fällan som facit-mappningen (CODE) eliminerar.
    const naivePoints =
      (rawIdFacit.winnerTeamId === 'BRA' ? 3 : 0) + (rawIdFacit.runnerUpTeamId === 'MAR' ? 2 : 0);
    expect(naivePoints).toBe(0);
    // Och det MAPPADE facit (derivePoolFacit) ger däremot full poäng (kontrasten).
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, matches);
    const mapped = facit.groups.find((f) => f.groupId === 'C')!.actual;
    expect(scoreGroupPrediction({ winnerTeamId: 'BRA', runnerUpTeamId: 'MAR' }, mapped)).toBe(5);
  });

  it('FAIL LOUD om ett härlett facit-id saknar code i lag-listan (brutet referens-kontrakt)', () => {
    // En grupp vars lag-id INTE finns i den medskickade (tomma) lag-listan.
    const groupC = WC2026_GROUPS.find((g) => g.id === 'C')!;
    const matches = finishedGroupMatches('C', groupC.teamIds);
    // Tom lag-lista -> id -> code-uppslaget saknar varje lag.
    expect(() => derivePoolFacit([], WC2026_GROUPS, matches)).toThrow(/saknar en code/);
  });
});

describe('derivePoolFacit, bracket-facit + mästaren (avgjorda slots)', () => {
  /** Bygg matcher som gör ALLA 12 grupper färdigspelade (för bracket-låsningen). */
  function allGroupsFinished(): Match[] {
    const groups: Group[] = WC2026_GROUPS;
    return groups.flatMap((g) => finishedGroupMatches(g.id, g.teamIds));
  }

  it('inget bracket-facit förrän en slutspelsmatch är avgjord', () => {
    // Alla grupper klara, men ingen slutspelsmatch spelad -> inga avgjorda slots.
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, allGroupsFinished());
    expect(facit.bracketSlots).toHaveLength(0);
    expect(facit.champion).toBeNull();
  });

  // KRITISKT SEAM-TEST (T16 F1) för bracket: deriveBracket-härlett winnerTeamId (id)
  // mappat till CODE, mot code-lagrat tips -> rundans poäng, inte tyst 0.
  it('CODE-VS-ID-SEAM: bracket-facit är CODE, så code-lagrat slot-tips ger rundans poäng (1), inte tyst 0', () => {
    const matches = allGroupsFinished();
    // Avgör M73: hemma vinner 2-0. M73 = Tvåa A mot Tvåa B (per bracket-strukturen),
    // så hemma-laget är grupp A:s tvåa = teamId("RSA") (A2, gemen "rsa").
    const groupA = WC2026_GROUPS.find((g) => g.id === 'A')!;
    const standingsA = computeStandings(groupA.teamIds, matches);
    const runnerUpAId = standingsA.find((r) => r.rank === 2)!.teamId; // gemen id

    const withM73: Match[] = [
      ...matches,
      {
        id: 'M73',
        stage: 'round-of-32',
        groupId: null,
        homeTeamId: null,
        awayTeamId: null,
        kickoff: '2026-07-01T19:00:00Z',
        venue: 'Arena',
        status: 'finished',
        result: { homeGoals: 2, awayGoals: 0 },
      },
    ];

    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, withM73);
    const m73 = facit.bracketSlots.find((s) => s.slotId === 'M73')!;

    // Facit MÅSTE vara CODE (versal), mappat ur det gemena härledda id:t.
    const expectedCode = TEAMS.find((t) => t.id === runnerUpAId)!.code;
    expect(m73.advancingTeam).toBe(expectedCode);
    expect(m73.advancingTeam).toMatch(/^[A-Z]{3}$/);

    // Ett code-lagrat tips på samma lag ger rundans poäng (R32 = 1), inte 0.
    expect(scoreBracketAdvance(m73.stage, expectedCode, m73.advancingTeam)).toBe(1);
  });
});
