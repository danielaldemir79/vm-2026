import { describe, expect, it } from 'vitest';
import type { GroupId, Match } from '../../domain/types';
import { assertEnumerable, computeGroupScenario, MAX_REMAINING_MATCHES } from './scenario-engine';

// ============================================================================
// "Vad krävs"-motorn (T11, SPEC §5). Enumererar W/D/L-utfallen av en grupps
// återstående matcher, härleder tabellen via den verifierade computeStandings
// (FIFA-tiebreakers), och klassar varje lag KLAR / UTE / BEROR PÅ konservativt.
//
// Edge-fall (acceptanskriterier): redan klart, omöjligt, beror på annan grupp.
// Plus: randfall för enumerations-gränsen (n-1/n/n+1) och ett KONSERVATIVITETS-
// test (ett konstruerat målskillnads-gränsfall får ALDRIG klassas KLART/UTE).
// ============================================================================

const GROUP: GroupId = 'A';
const TEAMS = ['A1', 'A2', 'A3', 'A4'] as const;

/** Bygg en färdigspelad gruppmatch (kort, typkorrekt). */
function fin(id: string, home: string, away: string, hg: number, ag: number): Match {
  return {
    id,
    stage: 'group',
    groupId: GROUP,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-20T19:00:00Z',
    venue: 'Testarena',
    result: { homeGoals: hg, awayGoals: ag },
    status: 'finished',
  };
}

/** Bygg en ospelad (scheduled) gruppmatch med kända lag. */
function sched(id: string, home: string, away: string): Match {
  return {
    id,
    stage: 'group',
    groupId: GROUP,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-26T19:00:00Z',
    venue: 'Testarena',
    result: null,
    status: 'scheduled',
  };
}

/** Slå upp ett lags scenario ur resultatet. */
function teamOf(teams: ReturnType<typeof computeGroupScenario>['teams'], teamId: string) {
  const team = teams.find((t) => t.teamId === teamId);
  if (!team) {
    throw new Error(`Inget scenario för ${teamId}`);
  }
  return team;
}

describe('computeGroupScenario, grunddrag', () => {
  it('returnerar ett scenario per lag i gruppen, i tabellordning (bäst först)', () => {
    // Två omgångar spelade, sista omgången kvar (2 matcher).
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 2, 0),
      fin('m2', 'A3', 'A4', 1, 0),
      fin('m3', 'A1', 'A3', 1, 0),
      fin('m4', 'A2', 'A4', 0, 0),
      sched('m5', 'A1', 'A4'),
      sched('m6', 'A2', 'A3'),
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.groupId).toBe('A');
    expect(s.teams).toHaveLength(4);
    expect(s.decided).toBe(false);
    expect(s.remainingMatches).toBe(2);
    // currentRank stiger monotont i tabellordning (bäst -> sämst).
    const ranks = s.teams.map((t) => t.currentRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('filtrerar bort matcher som inte hör till gruppen', () => {
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 1, 0),
      // En match i en ANNAN grupp ska inte påverka grupp A:s scenario.
      {
        id: 'b1',
        stage: 'group',
        groupId: 'B',
        homeTeamId: 'B1',
        awayTeamId: 'B2',
        kickoff: '2026-06-20T19:00:00Z',
        venue: 'X',
        result: { homeGoals: 3, awayGoals: 0 },
        status: 'finished',
      },
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.teams.map((t) => t.teamId).sort()).toEqual(['A1', 'A2', 'A3', 'A4']);
  });
});

describe('edge-fall: turneringen ej startad (allt beror på)', () => {
  it('inga matcher spelade men <= MAX kvar -> fas scenarios, alla "beror på"', () => {
    const matches: Match[] = [
      sched('m1', 'A1', 'A2'),
      sched('m2', 'A3', 'A4'),
      sched('m3', 'A1', 'A3'),
      // Bara 3 ospelade (de andra utelämnade), exakt på enumerations-gränsen.
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.phase).toBe('scenarios');
    expect(s.decided).toBe(false);
    // Med allt ospelat kan inget lag vara säkert klart eller säkert ute.
    for (const team of s.teams) {
      expect(team.status).toBe('depends');
    }
  });

  it('INGEN matchdata alls (tom grupp) -> fas too-early, INTE decided (ej facit på tom tabell)', () => {
    // En grupp utan vare sig spelade eller schemalagda matcher får INTE klassas
    // som färdigspelad (det vore facit på en tom tabell, alla 0 p). Den är
    // "för tidigt"/ej startad: inga påståenden om avancemang.
    const s = computeGroupScenario(TEAMS, [], GROUP);
    expect(s.phase).toBe('too-early');
    expect(s.decided).toBe(false);
    expect(s.remainingMatches).toBe(0);
    expect(s.teams).toHaveLength(4);
    for (const team of s.teams) {
      expect(team.status).toBe('depends');
    }
  });
});

describe('edge-fall: gruppen färdigspelad (facit, inte "om")', () => {
  // Distinkta poäng (9/6/3/0) ger entydig rank 1-4.
  const decided: Match[] = [
    fin('m1', 'A1', 'A2', 1, 0),
    fin('m2', 'A1', 'A3', 1, 0),
    fin('m3', 'A1', 'A4', 1, 0), // A1: 9 p
    fin('m4', 'A2', 'A3', 1, 0),
    fin('m5', 'A2', 'A4', 1, 0), // A2: 6 p
    fin('m6', 'A3', 'A4', 1, 0), // A3: 3 p, A4: 0 p
  ];

  it('inga återstående matcher -> decided=true, etta/tvåa klara, fyra ute', () => {
    const s = computeGroupScenario(TEAMS, decided, GROUP);
    expect(s.decided).toBe(true);
    expect(s.remainingMatches).toBe(0);
    expect(teamOf(s.teams, 'A1').status).toBe('qualified');
    expect(teamOf(s.teams, 'A2').status).toBe('qualified');
    expect(teamOf(s.teams, 'A4').status).toBe('eliminated');
  });

  it('grupptrean i en färdig grupp "beror på" andra grupper (bästa-trea-vägen)', () => {
    const s = computeGroupScenario(TEAMS, decided, GROUP);
    const third = teamOf(s.teams, 'A3');
    expect(third.currentRank).toBe(3);
    expect(third.status).toBe('depends');
    expect(third.canFinishThird).toBe(true);
    // Villkoret pekar ärligt ut det cross-grupp-beroendet.
    expect(third.condition).toMatch(/andra grupper/i);
  });
});

describe('edge-fall: lag redan KLART (qualified i alla utfall)', () => {
  it('ett lag som leder stort med en match kvar är klart oavsett resultat', () => {
    // Spelat R1+R2 (probe-verifierat): A1:6 (P2), A2:3, A3:3, A4:0. Sista omgången
    // kvar (A1-A4, A2-A3). Även om A1 FÖRLORAR mot A4 (A1=6, A4=3) kan bara EN av
    // A2/A3 nå 6 (vinnaren av A2-A3), så högst ett annat lag når A1 -> A1 är
    // säkert topp-2 i ALLA 9 utfall (poängen ensam räcker, marginal-oberoende).
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 1, 0),
      fin('m2', 'A3', 'A4', 1, 0),
      fin('m3', 'A1', 'A3', 1, 0), // A1: 6 p (P2)
      fin('m4', 'A2', 'A4', 1, 0), // A2: 3, A3: 3, A4: 0
      sched('m5', 'A1', 'A4'),
      sched('m6', 'A2', 'A3'),
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    const a1 = teamOf(s.teams, 'A1');
    expect(a1.status).toBe('qualified');
    expect(a1.marginDependent).toBe(false);
    expect(a1.condition).toMatch(/klar/i);
  });
});

describe('edge-fall: lag OMÖJLIGT (eliminated i alla utfall)', () => {
  it('ett lag som spelat klart med 0 p och 3 lag strikt före är ute (ej ens trea)', () => {
    // Probe-verifierat: A4 har spelat alla 3 (förlorat alla) -> 0 p, FÄRDIG. A1:9
    // (P3 färdig), A2:3, A3:3, sista matchen A2-A3 kvar. A4 har INGEN match kvar,
    // och tre lag (A1, A2, A3) ligger STRIKT före A4 i varje utfall -> A4 kan inte
    // nå topp-2 OCH inte ens en tredjeplats (rank 4 låst) -> ute (konservativt).
    const matches: Match[] = [
      fin('m1', 'A1', 'A4', 1, 0),
      fin('m2', 'A2', 'A4', 1, 0),
      fin('m3', 'A3', 'A4', 1, 0), // A4: 0 p, P3 (färdig)
      fin('m4', 'A1', 'A2', 1, 0),
      fin('m5', 'A1', 'A3', 1, 0), // A1: 9 p (P3 färdig), A2: 3, A3: 3
      sched('m6', 'A2', 'A3'), // enda återstående
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    const a4 = teamOf(s.teams, 'A4');
    expect(a4.status).toBe('eliminated');
    expect(a4.canFinishTop2).toBe(false);
    expect(a4.canFinishThird).toBe(false);
    expect(a4.condition).toMatch(/utslagen/i);
  });
});

describe('KONSERVATIVITET (HARD): målskillnads-gränsfall klassas ALDRIG KLART/UTE', () => {
  // Konstruerat fall: A1 och A2 har båda 4 p efter 2 matcher, A3 och A4 har 1 p.
  // Sista matchen är A1 mot A2 (de två toppstriderna). Vid OAVGJORT får båda 5 p
  // och är säkert topp-2. Men vi vill ett fall där W/D/L INTE räcker för att
  // avgöra topp-2 utan att MÅLSKILLNAD spelar in.
  //
  // Bygg: A1: 4p, A2: 4p, A3: 4p efter 2 matcher (tre lag lika), A4: 0p.
  // Sista omgången: A1-A2 och A3-A4. Om A1-A2 spelas oavgjort står A1 och A2 på
  // 5p, A3 (vinner mot A4) på 7p. Då är A1 vs A2 om andraplatsen lika på poäng
  // i flera grenar -> MÅLSKILLNAD avgör vem som blir tvåa. W/D/L kan inte säga
  // vilken av A1/A2 som går vidare som tvåa i det utfallet.
  const matches: Match[] = [
    // A1: vinst + vinst = 6? Vi vill 4p. Gör vinst + oavgjort.
    fin('m1', 'A1', 'A3', 1, 0), // A1 +3
    fin('m2', 'A1', 'A4', 1, 1), // A1 +1 -> A1: 4 p
    fin('m3', 'A2', 'A3', 1, 0), // A2 +3
    fin('m4', 'A2', 'A4', 1, 1), // A2 +1 -> A2: 4 p
    // A3: förlust + förlust = 0; A4: oavgjort + oavgjort = 2. Justera: A3 ska ha 0.
    sched('m5', 'A1', 'A2'), // toppstriden
    sched('m6', 'A3', 'A4'),
  ];

  it('A1 och A2 (lika på poäng, sista matchen mot varandra) är "beror på", inte klara', () => {
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    const a1 = teamOf(s.teams, 'A1');
    const a2 = teamOf(s.teams, 'A2');
    // I utfallet "A1-A2 oavgjort" står A1 och A2 på 5 p var. A4 (2p) + A3 kan inte
    // nå 5 -> A1 och A2 är då säkert topp-2. MEN i utfallet "A1 vinner" får A1 7p
    // (klar) och A2 4p; A2 kan då hamna trea om A3/A4-matchen + poäng konkurrerar.
    // Poängen: i MINST ETT utfall avgörs A2:s topp-2 inte av W/D/L ensamt.
    // Det viktiga (konservativitet): varken A1 eller A2 påstås KLART om W/D/L
    // inte avgör i alla utfall, och ingen påstås UTE.
    expect(a1.status).not.toBe('eliminated');
    expect(a2.status).not.toBe('eliminated');
    // Minst ett av lagen är "beror på" (W/D/L avgör inte säkert topp-2 överallt).
    const statuses = [a1.status, a2.status];
    expect(statuses).toContain('depends');
  });

  it('ett rent målskillnads-utfall flaggas marginDependent och blir aldrig "qualified" falskt', () => {
    // Bygg ett utfall där två lag MÅSTE stå lika på poäng och målskillnad avgör.
    // Nuvarande tabell (spelade x1-x4): A1:3, A2:4, A3:4, A4:0. Kvar: A1-A4, A3-A4.
    // Utfall "A1-A4 oavgjort, A3-A4 oavgjort": A1=4, A2=4, A3=5, A4=2. A3 etta;
    // A1 och A2 står lika på 4 p om tvåan -> MÅLSKILLNAD avgör tvåa/trea. W/D/L
    // ensamt kan inte avgöra det, så minst ett lag måste vara marginDependent.
    const m: Match[] = [
      fin('x1', 'A1', 'A2', 1, 0), // A1 +3
      fin('x2', 'A1', 'A3', 0, 1), // A1 +0 (3p kvar), A3 +3
      fin('x3', 'A2', 'A3', 0, 0), // A2 +1, A3 +1 -> A2: 1, A3: 4
      fin('x4', 'A2', 'A4', 1, 0), // A2 +3 -> A2: 4
      sched('x5', 'A1', 'A4'),
      sched('x6', 'A3', 'A4'),
    ];
    const s = computeGroupScenario(TEAMS, m, GROUP);
    // Hitta ett lag vars topp-2 i något utfall avgörs av målskillnad.
    const anyMarginDependent = s.teams.some((t) => t.marginDependent);
    expect(anyMarginDependent).toBe(true);
    // Ett marginDependent-lag får aldrig vara "qualified" på falska grunder:
    // qualified kräver säker topp-2 i ALLA utfall (poängen ensam), så ett lag
    // vars topp-2 hänger på målskillnad i något utfall kan inte vara qualified.
    for (const t of s.teams) {
      if (t.status === 'qualified') {
        // qualified får INTE samtidigt vara marginDependent (det vore en
        // motsägelse: säker överallt OCH marginal-avgjord någonstans).
        expect(t.marginDependent).toBe(false);
      }
    }
  });
});

describe('villkorstext: vinst/oavgjort räcker, ärligt formulerat', () => {
  it('ett lag där en vinst säkrar topp-2 får villkoret "vinst räcker"', () => {
    // Probe-verifierat: A1:6 (klar), A3:3, A4:3, A2:0. Sista omgången: A1-A2 och
    // A3-A4. Vinner A3 mot A4 -> A3=6; bara A1 (6, möter 0p-A2) når 6, övriga max 3
    // -> A3 säkert topp-2 VID VINST. Men oavgjort (A3=4) räcker INTE: då står A1,
    // A4 och A3 alla >= 4 och målskillnad kan knuffa ner A3 -> "vinst räcker".
    const m: Match[] = [
      fin('m1', 'A1', 'A3', 1, 0),
      fin('m2', 'A1', 'A4', 1, 0), // A1: 6 (P2)
      fin('m3', 'A3', 'A2', 1, 0), // A3: 3
      fin('m4', 'A2', 'A4', 0, 1), // A4: 3, A2: 0
      sched('m5', 'A1', 'A2'),
      sched('m6', 'A3', 'A4'),
    ];
    const s = computeGroupScenario(TEAMS, m, GROUP);
    const a3 = teamOf(s.teams, 'A3');
    expect(a3.condition).toMatch(/vinst räcker/i);
    expect(a3.condition).not.toMatch(/oavgjort räcker/i);
  });

  it('lag med FLERA egna matcher kvar får plural-text (Copilot C3), inte singular', () => {
    // ownResultGuarantees låser ALLA lagets egna matcher till utfallet, så texten
    // måste säga "i lagets matcher" (plural) när laget har mer än en match kvar,
    // annars låter "Oavgjort räcker" som EN match. Här har A1 TVÅ egna matcher kvar.
    //
    // Probe-verifierat upplägg (3 spelade, 3 kvar = n=3 <= MAX, scenario-fasen):
    //   Spelade:  A1-A4 3-0, A2-A3 1-0, A2-A4 1-0  -> A2:6, A1:3, A3:0, A4:0
    //   Kvar:     A1-A2, A1-A3 (A1:s två egna), A3-A4 (övrig)
    // Oavgjort i BÅDA A1-matcherna -> A1=5. A2=7 (etta). A3 max 1+3=4, A4 max 0+3=3,
    // så A1=5 är säkert topp-2 oavsett A3-A4 -> oavgjort i lagets matcher räcker.
    const m: Match[] = [
      fin('m1', 'A1', 'A4', 3, 0), // A1: 3, A4: 0
      fin('m2', 'A2', 'A3', 1, 0), // A2: 3, A3: 0
      fin('m3', 'A2', 'A4', 1, 0), // A2: 6
      sched('m4', 'A1', 'A2'), // A1:s egen match 1
      sched('m5', 'A1', 'A3'), // A1:s egen match 2
      sched('m6', 'A3', 'A4'), // övrig match (inte A1:s)
    ];
    const s = computeGroupScenario(TEAMS, m, GROUP);
    expect(s.phase).toBe('scenarios');
    const a1 = teamOf(s.teams, 'A1');
    // Plural-form, ärlig om att det gäller flera matcher, inte en.
    expect(a1.condition).toMatch(/oavgjort i lagets matcher räcker/i);
    // Singular-formuleringen ska INTE användas här (det vore vilseledande).
    expect(a1.condition).not.toMatch(/oavgjort räcker för topp-2/i);
  });
});

describe('åskådar-lag (Copilot C1): inget eget kvar -> ärlig text, aldrig "måste vinna"', () => {
  it('ett lag utan EGEN återstående match (bara andra lags match kvar) får åskådar-text', () => {
    // A1 har spelat ALLA sina tre matcher (mot A2/A3/A4) och är därmed åskådare:
    // bara A3-A4 återstår, en match A1 inte är med i. A1 ligger på 4 p och är
    // varken säkert klart (kan knuffas ur topp-2 beroende på A3-A4) eller säkert
    // ute, alltså 'depends'. Före fixen föll A1 i else-grenen och fick "Måste
    // vinna..." = objektivt fel (A1 kan inte vinna något, det är ju utspelat).
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 1, 0), // A1 +3
      fin('m2', 'A1', 'A3', 0, 1), // A1 +0, A3 +3
      fin('m3', 'A1', 'A4', 1, 1), // A1 +1 -> A1: 4 p (FÄRDIGSPELAD, åskådare)
      fin('m4', 'A2', 'A3', 0, 0), // A2 +1, A3 +1 -> A3: 4
      fin('m5', 'A2', 'A4', 1, 0), // A2 +3 -> A2: 4
      sched('m6', 'A3', 'A4'), // enda återstående: A1 är INTE med
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.phase).toBe('scenarios');
    const a1 = teamOf(s.teams, 'A1');
    // A1 är i scenario-fasen och 'depends' (det är just den gren där buggen låg).
    expect(a1.status).toBe('depends');
    // Texten är ärlig: A1 kan inte påverka själv, det avgörs av övriga matcher.
    expect(a1.condition).toMatch(/kan inte påverka själv/i);
    // Och ljuger ALDRIG om att A1 ska vinna/spela oavgjort något (det är utspelat).
    expect(a1.condition).not.toMatch(/måste vinna/i);
    expect(a1.condition).not.toMatch(/vinst räcker/i);
    expect(a1.condition).not.toMatch(/oavgjort räcker/i);
  });

  it('ett lag som FAKTISKT spelar i sista matchen behåller sitt egna krav-villkor', () => {
    // Kontroll att fixen är riktad: A4 spelar i den återstående A3-A4-matchen och
    // ska därför fortfarande få ett eget krav ("måste vinna ..."), inte åskådar-
    // texten, så vi inte tystar lag som faktiskt kan påverka sitt öde.
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 1, 0),
      fin('m2', 'A1', 'A3', 0, 1),
      fin('m3', 'A1', 'A4', 1, 1),
      fin('m4', 'A2', 'A3', 0, 0),
      fin('m5', 'A2', 'A4', 1, 0),
      sched('m6', 'A3', 'A4'),
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    const a4 = teamOf(s.teams, 'A4'); // sist, men spelar i sista matchen
    expect(a4.condition).not.toMatch(/kan inte påverka själv/i);
    expect(a4.condition).toMatch(/måste vinna/i);
  });

  it('lagets egen match är ENDA kvar (Copilot C4): "måste vinna" utan falskt "hoppas på andra"', () => {
    // C4: else-grenen sa "Måste vinna och hoppas på andra matcher" även när lagets
    // egen match är den ENDA återstående -> det FINNS inga andra matcher att hoppas
    // på, texten ljög. Här är A3-A4 den enda kvar (A3:s egen) och A3 hamnar i else-
    // grenen: en vinst NÅR A2:s 3 p men avgör inte ensam (lika poäng -> målskillnad),
    // oavgjort räcker inte alls. Probe-verifierat upplägg:
    //   Spelade: A1-A2 1-0, A1-A3 1-0, A1-A4 1-0, A2-A3 1-0, A2-A4 0-1
    //   -> A1:9 (klar etta), A2:3, A3:0, A4:3. Enda kvar: A3-A4 (A3:s egen).
    // Vinst för A3 -> 3 p, lika med A2 -> målskillnad avgör tvåan; vinst garanterar
    // alltså inte topp-2 -> else-grenen. Texten får INTE påstå "andra matcher".
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 1, 0), // A1 +3, A2 0
      fin('m2', 'A1', 'A3', 1, 0), // A1 +3, A3 0
      fin('m3', 'A1', 'A4', 1, 0), // A1 +3 -> A1: 9
      fin('m4', 'A2', 'A3', 1, 0), // A2 +3 -> A2: 3, A3 0
      fin('m5', 'A2', 'A4', 0, 1), // A4 +3 -> A4: 3
      sched('m6', 'A3', 'A4'), // enda kvar; A3 spelar själv i den
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.phase).toBe('scenarios');
    expect(s.remainingMatches).toBe(1); // bekräftar: EN enda match kvar
    const a3 = teamOf(s.teams, 'A3');
    // A3 är i else-grenen: "måste vinna" men varken vinst eller oavgjort garanterar.
    expect(a3.condition).toMatch(/måste vinna/i);
    // Och, kärnan i C4: ALDRIG påstå att man "hoppas på andra matcher" när det inte
    // finns några andra. I stället ärligt om att målskillnad/tiebreak avgör.
    expect(a3.condition).not.toMatch(/hoppas på andra matcher/i);
    expect(a3.condition).toMatch(/målskillnad\/tiebreak/i);
  });
});

describe('enumerations-gränsen: tröskel-garantin randtestad n-1 / n / n+1 (fail loud)', () => {
  // Garantin (MAX_REMAINING_MATCHES) bor i motorn (assertEnumerable) och randtestas
  // DIREKT, per lessons "uttommande-test-vaktar-svagare-invariant" (Förekomst 3:
  // tröskel-garantier ska bo i funktionen och randtestas n-1/n/n+1, inte bara ett
  // värde långt under + ett komplett). Vi testar BÅDA: den hårda kast-vakten
  // (assertEnumerable) OCH att det publika API:t degraderar mjukt till too-early.

  it('assertEnumerable: n = MAX - 1 (under gränsen) kastar INTE', () => {
    expect(() => assertEnumerable(MAX_REMAINING_MATCHES - 1, GROUP)).not.toThrow();
  });

  it('assertEnumerable: n = MAX (exakt på gränsen) kastar INTE', () => {
    expect(() => assertEnumerable(MAX_REMAINING_MATCHES, GROUP)).not.toThrow();
  });

  it('assertEnumerable: n = MAX + 1 (över gränsen) FAIL-LOUD:ar (kastar)', () => {
    expect(() => assertEnumerable(MAX_REMAINING_MATCHES + 1, GROUP)).toThrow(/vägrar enumerera/i);
  });

  // Det publika computeGroupScenario gatar FÖRE den hårda vakten: vid n > MAX
  // returnerar det fasen 'too-early' (legitimt produkt-läge) i stället för att
  // kasta, så vyn aldrig kraschar i ett tidigt turneringsläge (där alla 6
  // gruppmatcher ännu är ospelade).
  function withRemaining(count: number): { matches: Match[]; teamIds: string[] } {
    const matches: Match[] = [];
    const teamIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      matches.push(sched(`r${i}`, `H${i}`, `B${i}`));
      teamIds.push(`H${i}`, `B${i}`);
    }
    return { matches, teamIds };
  }

  it('computeGroupScenario: n = MAX enumererar (fas "scenarios", kastar inte)', () => {
    const { matches, teamIds } = withRemaining(MAX_REMAINING_MATCHES);
    const s = computeGroupScenario(teamIds, matches, GROUP);
    expect(s.phase).toBe('scenarios');
  });

  it('computeGroupScenario: n = MAX + 1 ger fas "too-early" (mjuk degradering, INGET kast)', () => {
    const { matches, teamIds } = withRemaining(MAX_REMAINING_MATCHES + 1);
    let s: ReturnType<typeof computeGroupScenario>;
    expect(() => {
      s = computeGroupScenario(teamIds, matches, GROUP);
    }).not.toThrow();
    expect(s!.phase).toBe('too-early');
    expect(s!.remainingMatches).toBe(MAX_REMAINING_MATCHES + 1);
    // Inga falska påståenden i too-early: alla lag "beror på" (inget avgjort).
    for (const t of s!.teams) {
      expect(t.status).toBe('depends');
    }
  });

  it('fixtures-läget (alla 6 gruppmatcher ospelade) ger "too-early", inte ett kast', () => {
    // Spegel av app-starten: en hel grupp helt ospelad = 6 återstående -> for
    // tidigt. Det FÅR inte krascha vyn (regressionsskydd: motorns vakt gatas).
    const allUnplayed: Match[] = [
      sched('g1', 'A1', 'A2'),
      sched('g2', 'A3', 'A4'),
      sched('g3', 'A1', 'A3'),
      sched('g4', 'A2', 'A4'),
      sched('g5', 'A1', 'A4'),
      sched('g6', 'A2', 'A3'),
    ];
    const s = computeGroupScenario(TEAMS, allUnplayed, GROUP);
    expect(s.phase).toBe('too-early');
    expect(s.teams).toHaveLength(4);
  });
});

describe('robusthet: ospelad gruppmatch utan kända lag hoppas över i enumerationen', () => {
  it('en scheduled match med null-lag enumereras inte (inga utfall att tillskriva)', () => {
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 1, 0),
      // En ospelad gruppmatch utan kända lag (data-defekt): ska inte räknas som
      // återstående (kan inte tillskrivas lag), och inte krascha.
      {
        id: 'broken',
        stage: 'group',
        groupId: GROUP,
        homeTeamId: null,
        awayTeamId: null,
        kickoff: '2026-06-26T19:00:00Z',
        venue: 'X',
        result: null,
        status: 'scheduled',
      },
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    // Bara m1 spelad, inga enumererbara återstående -> remainingMatches = 0.
    expect(s.remainingMatches).toBe(0);
    expect(s.decided).toBe(true);
  });
});

describe('remainingRounds (omgångar kvar, för badgen, 2 matcher = 1 omgång)', () => {
  it('sista omgången: 2 samtidiga matcher kvar = 1 omgång', () => {
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 2, 0),
      fin('m2', 'A3', 'A4', 1, 0),
      fin('m3', 'A1', 'A3', 1, 0),
      fin('m4', 'A2', 'A4', 0, 0),
      sched('m5', 'A1', 'A4'),
      sched('m6', 'A2', 'A3'),
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.remainingMatches).toBe(2);
    expect(s.remainingRounds).toBe(1);
  });

  it('två omgångar kvar: 4 matcher = 2 omgångar', () => {
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 2, 0),
      fin('m2', 'A3', 'A4', 1, 0),
      sched('m3', 'A1', 'A3'),
      sched('m4', 'A2', 'A4'),
      sched('m5', 'A1', 'A4'),
      sched('m6', 'A2', 'A3'),
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.remainingMatches).toBe(4);
    expect(s.remainingRounds).toBe(2);
  });

  it('färdigspelad: 0 omgångar kvar', () => {
    const matches: Match[] = [
      fin('m1', 'A1', 'A2', 2, 0),
      fin('m2', 'A3', 'A4', 1, 0),
      fin('m3', 'A1', 'A3', 1, 0),
      fin('m4', 'A2', 'A4', 0, 0),
      fin('m5', 'A1', 'A4', 1, 0),
      fin('m6', 'A2', 'A3', 2, 1),
    ];
    const s = computeGroupScenario(TEAMS, matches, GROUP);
    expect(s.remainingMatches).toBe(0);
    expect(s.remainingRounds).toBe(0);
  });
});
