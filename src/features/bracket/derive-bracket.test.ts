import { describe, expect, it } from 'vitest';
import type { GroupId, GroupStanding, GroupTable, Match } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { BRACKET_MATCHES, ROUND_OF_32 } from '../../domain/bracket/bracket-structure';
import {
  deriveBracket,
  groupByRound,
  isGroupStageComplete,
  type BracketMatchState,
} from './derive-bracket';

// ============================================================================
// Härledning av det LEVANDE slutspelsträdet (T9, SPEC §5 + §6). Tre lägen:
// gruppspel pågår (möjliga lag), grupperna klara (låst till riktiga lag via
// FIFA-seedningen), slutspelsresultat (vinnar-propagering, inkl. straffar).
// Trädet är STRUKTURELLT (positioner), så vi testar oberoende av 2026-lottningen.
// ============================================================================

/** Bygg en standing-rad (bara fälten härledningen läser spelar roll). */
function row(
  teamId: string,
  rank: number,
  played: number,
  points = 0,
  gd = 0,
  gf = 0
): GroupStanding {
  return {
    teamId,
    played,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: gf,
    goalsAgainst: gf - gd,
    goalDifference: gd,
    points,
    rank,
  };
}

/**
 * En FÄRDIGSPELAD grupptabell för grupp `g`: 4 lag, alla spelat 3 matcher, med
 * distinkta poäng (12,9,6,3) så rank 1-4 är entydig. Lag-id = "<g>1".."<g>4".
 * Trean (rank 3) får parametriserbar poäng/MS/GM så treplats-rankningen kan styras.
 */
function completeTable(g: GroupId, thirdPoints = 4, thirdGD = 0, thirdGF = 3): GroupTable {
  return {
    groupId: g,
    standings: [
      row(`${g}1`, 1, 3, 9, 6, 8),
      row(`${g}2`, 2, 3, 6, 2, 5),
      row(`${g}3`, 3, 3, thirdPoints, thirdGD, thirdGF),
      row(`${g}4`, 4, 3, 0, -6, 1),
    ],
  };
}

/** En IGÅNG (ofullständig) grupptabell: lagen har bara spelat 1 match. */
function inProgressTable(g: GroupId): GroupTable {
  return {
    groupId: g,
    standings: [
      row(`${g}1`, 1, 1, 3, 1, 1),
      row(`${g}2`, 2, 1, 1, 0, 1),
      row(`${g}3`, 3, 1, 1, 0, 1),
      row(`${g}4`, 4, 1, 0, -1, 0),
    ],
  };
}

/** Alla 12 grupper, färdigspelade. Treornas poäng styr vilka 8 som kvalificerar. */
function allComplete(thirdPointsByGroup?: Partial<Record<GroupId, number>>): GroupTable[] {
  return GROUP_IDS.map((g) => completeTable(g, thirdPointsByGroup?.[g] ?? 4));
}

/** En scheduled slutspelsmatch (lagen seedas av härledningen, inte här). */
function knockoutMatch(id: string): Match {
  return {
    id,
    stage: 'round-of-32',
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: '2026-07-01T19:00:00Z',
    venue: 'Arena',
    result: null,
    status: 'scheduled',
  };
}

describe('isGroupStageComplete', () => {
  it('är false med färre än 12 grupper', () => {
    expect(isGroupStageComplete([completeTable('A')])).toBe(false);
  });

  it('är false om någon grupp har ospelade matcher', () => {
    const tables = allComplete();
    tables[5] = inProgressTable('F');
    expect(isGroupStageComplete(tables)).toBe(false);
  });

  it('är true när alla 12 grupper är färdigspelade', () => {
    expect(isGroupStageComplete(allComplete())).toBe(true);
  });

  // C3 (Copilot runda 1): låsningen får INTE ske bara för att ANTALET tabeller är
  // 12, om de inte täcker alla 12 UNIKA grupperna. En dubblett (två A) + en saknad
  // grupp (ingen L) ger 12 tabeller men 11 unika groupId:n. En ren längd-koll
  // (`tables.length >= 12`) skulle låsa felaktigt och seedningen skulle slå upp den
  // saknade gruppen -> undefined -> en resolved slot med teamId null.
  it('är false med 12 FÄRDIGSPELADE tabeller om en grupp är dubblerad och en saknas (11 unika)', () => {
    // Alla 12 färdigspelade, men byt ut L mot ett andra A: 12 tabeller, 11 unika.
    const tables = allComplete();
    const indexOfL = GROUP_IDS.indexOf('L');
    tables[indexOfL] = completeTable('A');
    expect(tables).toHaveLength(GROUP_IDS.length);
    expect(new Set(tables.map((t) => t.groupId)).size).toBe(GROUP_IDS.length - 1);
    // Måste fortfarande vara "pågår" (false), annars låses ett ofullständigt
    // gruppspel och L:s slotar resolvas till null.
    expect(isGroupStageComplete(tables)).toBe(false);
  });

  it('är false med FLER än 12 tabeller om en kanonisk grupp saknas (antalet räcker ändå inte)', () => {
    // 13 tabeller: alla utom L (11) + två extra A. Antalet (13) >= 12, men L saknas
    // -> får inte låsa. Bevisar att en ren antals-koll (length >= 12) inte räcker.
    const withoutL = allComplete().filter((t) => t.groupId !== 'L');
    const tables = [...withoutL, completeTable('A'), completeTable('A')];
    expect(tables.length).toBeGreaterThan(GROUP_IDS.length);
    expect(new Set(tables.map((t) => t.groupId)).has('L')).toBe(false);
    expect(isGroupStageComplete(tables)).toBe(false);
  });
});

describe('deriveBracket, GRUPPSPEL PÅGÅR, PRELIMINÄRT levande läge (T56, #100)', () => {
  // Alla 12 grupper har spelat 1 match (inProgressTable: rank 1-4 finns, men INTE
  // färdigspelat). Trädet ska visa det NUVARANDE läget levande: nuvarande 1:a/2:a
  // i slotarna + de 8 nuvarande bästa treorna seedade (Annexe C), allt 'preliminary'.
  const tables = GROUP_IDS.map(inProgressTable);
  const state = deriveBracket(
    tables,
    ROUND_OF_32.map((m) => knockoutMatch(m.id))
  );

  it('är INTE låst men ÄR preliminärt (driver UI:ts ärliga "Nuvarande ställning"-märkning)', () => {
    expect(state.locked).toBe(false);
    expect(state.preliminary).toBe(true);
  });

  it('en gruppvinnar-slot fylls PRELIMINÄRT med gruppens nuvarande 1:a + bär möjliga lag', () => {
    // M74 home = Winner E (bracket-structure). Grupp E:s nuvarande 1:a = E1.
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    expect(m74.home.label).toBe('1:a grupp E');
    expect(m74.home.resolution).toBe('preliminary');
    // Det preliminära laget är gruppens NUVARANDE etta (rör sig vid nästa resultat).
    expect(m74.home.teamId).toBe('E1');
    // Möjliga lag finns kvar parallellt (alla i gruppen kan ännu ta platsen).
    expect(m74.home.candidateTeamIds).toContain('E1');
    expect(m74.home.candidateTeamIds).toContain('E4');
  });

  it('en grupptvåa-slot fylls PRELIMINÄRT med gruppens nuvarande 2:a', () => {
    // M73 home = Runner-up A. Grupp A:s nuvarande 2:a = A2.
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.home.label).toBe('2:a grupp A');
    expect(m73.home.resolution).toBe('preliminary');
    expect(m73.home.teamId).toBe('A2');
  });

  it('en bästa-trea-slot seedas PRELIMINÄRT (Annexe C) men bär ändå sin behörighets-etikett + möjliga lag', () => {
    // M74 away = Best 3rd of A,B,C,D,F (bracket-structure).
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    expect(m74.away.label).toBe('3:a A/B/C/D/F');
    expect(m74.away.resolution).toBe('preliminary');
    // Den preliminärt seedade trean MÅSTE vara en av de behöriga gruppernas trea
    // (Annexe C ger en av eligibleGroups, gissas aldrig fram en otillåten).
    expect(['A3', 'B3', 'C3', 'D3', 'F3']).toContain(m74.away.teamId);
    // Möjliga lag = de NUVARANDE treorna i de behöriga grupperna (kvar parallellt).
    expect(m74.away.candidateTeamIds).toEqual(['A3', 'B3', 'C3', 'D3', 'F3']);
  });

  it('de 8 preliminärt seedade treorna är KOLLISIONSFRIA (samma Annexe C-garanti som skarpa läget)', () => {
    const prelimThirds = state.matches
      .flatMap((m) => [m.home, m.away])
      .filter((s) => s.label.startsWith('3:a') && s.resolution === 'preliminary')
      .map((s) => s.teamId);
    expect(prelimThirds).toHaveLength(8);
    expect(prelimThirds.every((t) => t !== null)).toBe(true);
    // 8 distinkta treor (ingen grupp seedas till två matcher).
    expect(new Set(prelimThirds).size).toBe(8);
  });

  it('en senare runda (åttondel) visar de två preliminära föregångar-lagen som möjliga (levande framåt)', () => {
    // M89 home = Winner M74. M74:s två slots är nu preliminärt fyllda (E1 + en trea),
    // så åttondels-sloten visar dem som möjliga lag (vägen framåt känns levande),
    // utan att GISSA en vinnare (teamId null, resolution 'possible' inte 'resolved').
    const m89 = state.matches.find((m) => m.matchId === 'M89')!;
    expect(m89.home.label).toBe('Vinnare M74');
    expect(m89.home.resolution).toBe('possible');
    expect(m89.home.teamId).toBeNull();
    expect(m89.home.candidateTeamIds.length).toBe(2);
  });

  // Avsparkstiden (Daniels önskemål, #1): varje härledd match bär matchplanens kickoff,
  // så UI:t kan visa "spelas <dag>" på en KOMMANDE nod i stället för en tvetydig markör.
  it('varje match bär matchplanens AVSPARKSTID (kickoff) ur Match-listan', () => {
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    // knockoutMatch sätter kickoff 2026-07-01T19:00:00Z för alla R32-matcher här.
    expect(m73.kickoff).toBe('2026-07-01T19:00:00Z');
  });

  it('kickoff är null när matchen saknas i Match-listan (robust, ingen gissad tid)', () => {
    // Härled med en TOM match-lista: slotarna fylls ur tabellerna, men ingen match
    // finns att hämta kickoff ur, så fältet är null (gissar aldrig en avsparkstid).
    const stateNoMatches = deriveBracket(GROUP_IDS.map(inProgressTable), []);
    const m73 = stateNoMatches.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.kickoff).toBeNull();
  });
});

describe('deriveBracket, GRUPPSPEL PÅGÅR, ÄRLIG GRÄNS (ingen preliminär seedning på ofullständig data)', () => {
  // Bara 2 grupper har spelat (A, B). Då kan de 12 treorna INTE rangordnas
  // övergripande (Article 13 kräver alla 12 jämförbara), så bästa-trea-slotarna
  // får INTE en preliminär trea, de stannar i 'possible' (bara möjliga lag).
  const tables = [inProgressTable('A'), inProgressTable('B')];
  const state = deriveBracket(
    tables,
    ROUND_OF_32.map((m) => knockoutMatch(m.id))
  );

  it('en grupp MED en nuvarande tabell fylls ändå preliminärt (1:a/2:a är ärligt)', () => {
    // M73 home = Runner-up A; grupp A har en tabell, så dess 2:a (A2) är preliminär.
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.home.resolution).toBe('preliminary');
    expect(m73.home.teamId).toBe('A2');
  });

  it('en grupp UTAN tabell faller tillbaka till possible (ingen gissning)', () => {
    // M74 home = Winner E; grupp E saknar tabell här, alltså inget preliminärt lag.
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    expect(m74.home.resolution).toBe('possible');
    expect(m74.home.teamId).toBeNull();
    expect(m74.home.candidateTeamIds).toHaveLength(0);
  });

  it('bästa-trea-slotarna stannar i possible (treorna kan inte rangordnas ärligt)', () => {
    // M74 away = Best 3rd of A,B,C,D,F. Inte alla 12 grupper har en trea, så ingen
    // preliminär seedning, bara de nuvarande treor som RÅKAR finnas som möjliga lag.
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    expect(m74.away.resolution).toBe('possible');
    expect(m74.away.teamId).toBeNull();
    // Bara A3/B3 finns (grupp A+B har en trea), C/D/F saknar tabell.
    expect(m74.away.candidateTeamIds).toEqual(['A3', 'B3']);
  });
});

describe('deriveBracket, GRUPPERNA KLARA (låst till riktiga lag via FIFA-seedningen)', () => {
  // Treornas poäng: A-H höga (kvalificerar), I-L låga (faller utanför).
  const tables = allComplete({
    A: 6,
    B: 6,
    C: 6,
    D: 6,
    E: 6,
    F: 6,
    G: 6,
    H: 6,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
  });
  const state = deriveBracket(
    tables,
    ROUND_OF_32.map((m) => knockoutMatch(m.id))
  );

  it('är LÅST när alla grupper är klara, och INTE preliminärt (skarpt läge, facit rörs ej)', () => {
    expect(state.locked).toBe(true);
    // locked och preliminary är ömsesidigt uteslutande: en låst seedning är facit,
    // aldrig märkt "Nuvarande ställning" (T56). Inga slots är 'preliminary' när låst.
    expect(state.preliminary).toBe(false);
    const anyPreliminary = state.matches
      .flatMap((m) => [m.home, m.away])
      .some((s) => s.resolution === 'preliminary');
    expect(anyPreliminary).toBe(false);
  });

  it('gruppvinnar-/tvåa-slots är resolved till rätt lag (rank 1/2)', () => {
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    // M73 home = Runner-up A, away = Runner-up B.
    expect(m73.home.resolution).toBe('resolved');
    expect(m73.home.teamId).toBe('A2');
    expect(m73.away.teamId).toBe('B2');
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    // M74 home = Winner E.
    expect(m74.home.teamId).toBe('E1');
  });

  it('bästa-trea-slotarna är seedade till EXAKT en behörig grupps trea (Annexe C)', () => {
    const m74 = state.matches.find((m) => m.matchId === 'M74')!;
    // M74 away = Best 3rd of A,B,C,D,F. Den seedade trean MÅSTE vara en av dem.
    expect(m74.away.resolution).toBe('resolved');
    expect(m74.away.teamId).not.toBeNull();
    const eligible = ['A3', 'B3', 'C3', 'D3', 'F3'];
    expect(eligible).toContain(m74.away.teamId);
  });

  it('alla 8 bästa-trea-slots är resolved och KOLLISIONSFRIA (varje trea en gång)', () => {
    const thirdTeams = state.matches
      .flatMap((m) => [m.home, m.away])
      .filter((s) => s.label.startsWith('3:a'))
      .map((s) => s.teamId);
    expect(thirdTeams).toHaveLength(8);
    expect(thirdTeams.every((t) => t !== null)).toBe(true);
    // Inga dubbletter: 8 distinkta treor seedade.
    expect(new Set(thirdTeams).size).toBe(8);
    // Alla 8 kommer från de kvalificerade grupperna A-H (treans id slutar på "3").
    for (const t of thirdTeams) {
      expect(['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3']).toContain(t);
    }
  });
});

describe('deriveBracket, SLUTSPELSRESULTAT propagerar vinnaren', () => {
  const tables = allComplete({
    A: 6,
    B: 6,
    C: 6,
    D: 6,
    E: 6,
    F: 6,
    G: 6,
    H: 6,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
  });

  /** Bygg slutspelsmatcherna och sätt ett finished-resultat på M73. */
  function matchesWithM73Result(
    homeGoals: number,
    awayGoals: number,
    penalties?: { homeGoals: number; awayGoals: number }
  ): Match[] {
    return ROUND_OF_32.map((m) => {
      if (m.id === 'M73') {
        const finished: Match = {
          id: 'M73',
          stage: 'round-of-32',
          groupId: null,
          homeTeamId: null,
          awayTeamId: null,
          kickoff: '2026-07-01T19:00:00Z',
          venue: 'Arena',
          status: 'finished',
          result: penalties ? { homeGoals, awayGoals, penalties } : { homeGoals, awayGoals },
        };
        return finished;
      }
      return knockoutMatch(m.id);
    });
  }

  it('en avgjord sextondelsfinal pekar ut winnerSlotId och propagerar laget till åttondelen', () => {
    // M73: Runner-up A (A2) mot Runner-up B (B2). 2-0 -> A2 vidare.
    const state = deriveBracket(tables, matchesWithM73Result(2, 0));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.winnerSlotId).toBe(m73.home.id); // hemma (A2) vann
    // M73:s vinnare matar M90-home (bracket-structure: M90 home = Winner M73).
    const m90 = state.matches.find((m) => m.matchId === 'M90')!;
    expect(m90.home.resolution).toBe('resolved');
    expect(m90.home.teamId).toBe('A2');
    expect(m90.home.label).toBe('Vinnare M73');
  });

  it('STRAFFAR avgör en lika sextondelsfinal (FIFA Art. 14), vinnaren propagerar', () => {
    // M73 1-1, straffar 2-4 -> bortalaget (B2) vidare.
    const state = deriveBracket(tables, matchesWithM73Result(1, 1, { homeGoals: 2, awayGoals: 4 }));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.winnerSlotId).toBe(m73.away.id); // borta (B2) vann på straffar
    const m90 = state.matches.find((m) => m.matchId === 'M90')!;
    expect(m90.home.teamId).toBe('B2');
  });

  it('en LIKA match UTAN avgörande straffar propagerar INGEN vinnare (fail-safe)', () => {
    // 1-1 utan penalties: kan inte avgöras, ingen gissning propageras.
    const state = deriveBracket(tables, matchesWithM73Result(1, 1));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.winnerSlotId).toBeNull();
    const m90 = state.matches.find((m) => m.matchId === 'M90')!;
    expect(m90.home.teamId).toBeNull();
  });

  // RESULTATET PÅ NODEN (2026-06-29, Daniels turnering-lyft, del A1): en avgjord
  // slutspelsmatch ska bära sitt FAKTISKA resultat (slutställning + ev. straffar),
  // så vyn kan visa det på matchkortet. Hemma-/borta-målen följer trädets
  // home-/away-slot (samma kontrakt som outcomeOf läser match.result mot).
  it('en avgjord match bär sitt resultat (slutställning) på match-noden', () => {
    const state = deriveBracket(tables, matchesWithM73Result(2, 0));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.result).toEqual({ homeGoals: 2, awayGoals: 0, penalties: null });
  });

  it('ett straff-avgjort resultat bär ÄVEN straffsiffrorna på noden', () => {
    const state = deriveBracket(tables, matchesWithM73Result(1, 1, { homeGoals: 2, awayGoals: 4 }));
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    expect(m73.result).toEqual({
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 2, awayGoals: 4 },
    });
  });

  it('en ICKE-spelad match har inget resultat på noden (result === null)', () => {
    const state = deriveBracket(tables, matchesWithM73Result(2, 0));
    // M90 är schemalagd (inget resultat inmatat) -> result null, gissas aldrig.
    const m90 = state.matches.find((m) => m.matchId === 'M90')!;
    expect(m90.result).toBeNull();
  });
});

describe('deriveBracket, struktur + bronsmatch/final', () => {
  const state = deriveBracket(GROUP_IDS.map(inProgressTable), []);

  it('innehåller alla 32 slutspelsmatcher (M73-M104)', () => {
    expect(state.matches).toHaveLength(32);
  });

  it('bronsmatchen (M103) matas av semifinal-FÖRLORARNA (match-loser-etikett)', () => {
    const m103 = state.matches.find((m) => m.matchId === 'M103')!;
    expect(m103.home.label).toBe('Förlorare M101');
    expect(m103.away.label).toBe('Förlorare M102');
  });

  it('finalen (M104) matas av semifinal-vinnarna och har ingen nästa slot', () => {
    const m104 = state.matches.find((m) => m.matchId === 'M104')!;
    expect(m104.home.label).toBe('Vinnare M101');
    expect(m104.away.label).toBe('Vinnare M102');
    expect(m104.home.nextSlotId).toBeNull();
  });
});

describe('deriveBracket, BRONS-/FINAL-propagering spelar HELA trädet (F2)', () => {
  // F2 (lokal panel): brons-/final-matningen var bara ETIKETT-testad ("Förlorare
  // M101"). Ett etikett-test rör aldrig den gren som propagerar de RIKTIGA lagen,
  // så ett fel där förlorare/vinnare förväxlades (eller fel feeder-match lästes)
  // hade passerat tyst. Här spelas hela trädet (alla 104-slutspelsmatcher med
  // hemmavinst) så att M101/M102 har riktiga lag, och vi assertar att bronsmatchen
  // (M103) får FÖRLORARNA och finalen (M104) VINNARNA, fyra distinkta lag.

  const tables = allComplete({
    A: 6,
    B: 6,
    C: 6,
    D: 6,
    E: 6,
    F: 6,
    G: 6,
    H: 6,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
  });

  /** Sätt hemmavinst (1-0) på VARJE slutspelsmatch, så hemmalaget propagerar hela vägen. */
  function homeWinsEverywhere(): Match[] {
    // Varje match får sin RIKTIGA runda ur strukturen (bm.stage), inte en
    // hårdkodad 'round-of-32' på allt (C5): testdatan ska vara semantiskt korrekt
    // (M103 är third-place, M104 final osv.). Härledningen läser stage ur
    // strukturen, så detta påverkar inte utfallet, men datan ska inte ljuga om
    // vilken runda en match tillhör.
    return BRACKET_MATCHES.map((bm) => ({
      id: bm.id,
      stage: bm.stage,
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
      kickoff: '2026-07-01T19:00:00Z',
      venue: 'Arena',
      status: 'finished',
      result: { homeGoals: 1, awayGoals: 0 },
    }));
  }

  const state = deriveBracket(tables, homeWinsEverywhere());
  const match = (id: string): BracketMatchState => state.matches.find((m) => m.matchId === id)!;

  /** Vinnar-/förlorar-lag ur en avgjord match (slot-id -> teamId). */
  function winnerTeam(m: BracketMatchState): string | null {
    return m.winnerSlotId === m.home.id ? m.home.teamId : m.away.teamId;
  }
  function loserTeam(m: BracketMatchState): string | null {
    return m.winnerSlotId === m.home.id ? m.away.teamId : m.home.teamId;
  }

  it('semifinalerna M101/M102 är avgjorda med riktiga lag (förutsättning för bronsen)', () => {
    const m101 = match('M101');
    const m102 = match('M102');
    expect(m101.winnerSlotId).not.toBeNull();
    expect(m102.winnerSlotId).not.toBeNull();
    expect(m101.home.teamId).not.toBeNull();
    expect(m102.home.teamId).not.toBeNull();
  });

  it('bronsmatchen (M103) får FÖRLORARNA av M101 och M102 (inte vinnarna, inte fel feeder)', () => {
    const m101 = match('M101');
    const m102 = match('M102');
    const m103 = match('M103');
    expect(m103.home.resolution).toBe('resolved');
    expect(m103.away.resolution).toBe('resolved');
    // KÄRNAN: home = förloraren av M101, away = förloraren av M102.
    expect(m103.home.teamId).toBe(loserTeam(m101));
    expect(m103.away.teamId).toBe(loserTeam(m102));
    // ...och uttryckligen INTE vinnarna (negativ kontroll mot vinnare/förlorare-förväxling).
    expect(m103.home.teamId).not.toBe(winnerTeam(m101));
    expect(m103.away.teamId).not.toBe(winnerTeam(m102));
  });

  it('finalen (M104) får VINNARNA av M101 och M102', () => {
    const m101 = match('M101');
    const m102 = match('M102');
    const m104 = match('M104');
    expect(m104.home.teamId).toBe(winnerTeam(m101));
    expect(m104.away.teamId).toBe(winnerTeam(m102));
  });

  it('de fyra medalj-lagen (final 2 + brons 2) är DISTINKTA lag', () => {
    const m103 = match('M103');
    const m104 = match('M104');
    const four = [m104.home.teamId, m104.away.teamId, m103.home.teamId, m103.away.teamId];
    expect(four.every((t) => t !== null)).toBe(true);
    expect(new Set(four).size).toBe(4);
  });
});

describe('deriveBracket, RE-propagering: byt M73-utfall -> nedströms-laget byter (F3)', () => {
  // F3 (lokal panel): att vinnaren propagerar var testat, men inte att en NY
  // härledning med ett ANNAT utfall ger ett ANNAT nedströms-lag. Eftersom trädet
  // är en REN funktion av matchlistan ska samma struktur härledd om med bortavinst
  // i stället för hemmavinst flytta laget i nedströms-sloten. Detta vaktar att
  // härledningen verkligen LÄSER resultatet varje gång, inte cachar/fryser ett
  // tidigare utfall.

  const tables = allComplete({
    A: 6,
    B: 6,
    C: 6,
    D: 6,
    E: 6,
    F: 6,
    G: 6,
    H: 6,
    I: 1,
    J: 1,
    K: 1,
    L: 1,
  });

  /** Bygg trädets matcher och sätt ETT resultat på M73 (övriga schemalagda). */
  function matchesWithM73(homeGoals: number, awayGoals: number): Match[] {
    return ROUND_OF_32.map((m) =>
      m.id === 'M73'
        ? ({
            id: 'M73',
            stage: 'round-of-32',
            groupId: null,
            homeTeamId: null,
            awayTeamId: null,
            kickoff: '2026-07-01T19:00:00Z',
            venue: 'Arena',
            status: 'finished',
            result: { homeGoals, awayGoals },
          } as Match)
        : knockoutMatch(m.id)
    );
  }

  it('M73 hemmavinst -> M90-home = A2; härled om med bortavinst -> M90-home byter till B2', () => {
    // M73 = Runner-up A (A2) mot Runner-up B (B2); M73:s vinnare matar M90-home.
    const homeWin = deriveBracket(tables, matchesWithM73(2, 0));
    const m90HomeWin = homeWin.matches.find((m) => m.matchId === 'M90')!;
    expect(m90HomeWin.home.resolution).toBe('resolved');
    expect(m90HomeWin.home.teamId).toBe('A2');

    // RE-derivering med motsatt utfall: nedströms-laget MÅSTE byta.
    const awayWin = deriveBracket(tables, matchesWithM73(0, 2));
    const m90AwayWin = awayWin.matches.find((m) => m.matchId === 'M90')!;
    expect(m90AwayWin.home.resolution).toBe('resolved');
    expect(m90AwayWin.home.teamId).toBe('B2');

    // Kärnan i F3: teamId bytte mellan de två härledningarna (inte fruset).
    expect(m90AwayWin.home.teamId).not.toBe(m90HomeWin.home.teamId);
  });
});

describe('groupByRound', () => {
  const state = deriveBracket(GROUP_IDS.map(inProgressTable), []);
  const rounds = groupByRound(state);

  it('delar upp trädet i rundor i officiell progressions-ordning (brons FÖRE final, C4)', () => {
    // Bronsmatchen (M103) SPELAS före finalen (M104) i FIFA:s schema (verifierat
    // mot T4:s tablå: brons 18 juli, final 19 juli), så third-place står före final.
    expect(rounds.map((r) => r.stage)).toEqual([
      'round-of-32',
      'round-of-16',
      'quarter-final',
      'semi-final',
      'third-place',
      'final',
    ]);
  });

  it('har rätt antal matcher per runda (16/8/4/2/1/1)', () => {
    expect(rounds.map((r) => r.matches.length)).toEqual([16, 8, 4, 2, 1, 1]);
  });

  it('har svenska rundrubriker', () => {
    expect(rounds[0].label).toBe('Sextondelsfinaler');
    expect(rounds.find((r) => r.stage === 'final')!.label).toBe('Final');
  });
});
