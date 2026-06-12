import { describe, expect, it } from 'vitest';
// Källfilerna läses som rå text via Vites `?raw` (typad av vite/client), så
// testet behöver inga Node-beroenden och typkollas av app-bygget.
import sourceText from './tv-schedule-source.txt?raw';
import venueSource from './venue-source.txt?raw';
import committedMatches from './matches.ts?raw';
// Återanvänd EXAKT generatorns parsnings-/emit-logik (ingen duplicerad parser):
// testet bevisar att DEN HÄR koden, körd på den committade källan, ger den
// committade matches.ts. Se src/data/wc2026/match-schedule-parser.ts.
import {
  buildMatches,
  buildMatchesFile,
  parseSchedule,
  TEAM_NAME_TO_ID,
  VENUE_UNKNOWN,
  zonedWallTimeToUtcIso,
  EXPECTED_GROUP_MATCHES,
  EXPECTED_KNOCKOUT_MATCHES,
  EXPECTED_TOTAL_MATCHES,
  type ParsedKnockoutMatch,
} from './match-schedule-parser';
// Arena-injektionen (T4c #35): matches.ts bär nu verifierade arenor, så låset måste
// regenerera MED arena-tabellen (annars skulle filen få platshållare och inte matcha).
// Arena-källans EGNA korskoll (16 arenor, spelade matcher m.m.) bor i venue-source.test.ts.
import { buildVenueTable, parseVenues } from './venue-parser';
import { WC2026_MATCHES } from './matches';
import { WC2026_TEAMS } from './teams';
import { BRACKET_MATCHES } from '../../domain/bracket/bracket-structure';
import type { BracketSource, MatchStage } from '../../domain/types';

// ============================================================================
// KÄLLÅNKRING + KORSKOLL av VM 2026:s matchplan (T4b, #31, SPEC §5/§8).
//
// Matchtablån (tid + svensk TV-kanal) kommer ur en svensk sändningskälla (Daniel,
// 2026-06-09). Två oberoende kontroller gör datan trovärdig:
//   1. KÄLLÅNKRING: regenerera matches.ts ur det committade tablå-utdraget och
//      kräv VÄRDE-likhet (fail loud vid minsta skillnad). Mutationstestet bevisar
//      att låset fångar ett bytt värde. Samma mönster som T4:s Annexe C-tabell.
//   2. KORSKOLL mot den OBEROENDE FIFA-källan (teams.ts + bracket-structure.ts):
//      varje lag i tablån finns i FIFA-lottningen, och slutspels-matchnumren +
//      positions-källorna stämmer mot FIFA:s spelschema. Tablån är alltså en
//      andra källa som bekräftar T4:s motor (eller skulle flagga en avvikelse).
// ============================================================================

/** O(1)-lookup: lag-id -> grupp (en sanning, ur teams.ts). */
const groupById = new Map(WC2026_TEAMS.map((t) => [t.id, t.group]));
const groupOf = (id: string) => groupById.get(id);

/**
 * Arena-uppslag (match-id -> venue) ur den committade arena-källan (T4c #35). Måste
 * med i regenerera-och-diffa-låset, annars skulle den regenererade filen få
 * platshållare och inte matcha den committade matches.ts (som nu bär verifierade
 * arenor). Join-mängden är matchplanens id:n.
 */
const venueTable = buildVenueTable(
  parseVenues(venueSource),
  buildMatches(parseSchedule(sourceText), groupOf).map((m) => m.id)
);
const venueOf = (id: string) => venueTable.get(id);

/**
 * Radslut-normalisering före jämförelse. Den committade .ts:en kan vara CRLF på
 * Windows (git autocrlf) medan generatorn emittar LF; en RÅ byte-jämförelse
 * skulle annars faila på enbart radslut, inte på innehåll (känd fallgrop:
 * idempotent-synk-verifierad-med-radslut-känslig-hash). Vi jämför INNEHÅLL.
 */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('Matchplanen: låst mot den svenska TV-tablån (regenerera och diffa)', () => {
  it('regenererad matches.ts ur källutdraget är värde-identisk med matches.ts', () => {
    // Detta är låset. Skiljer en enda match sig (fel tid, fel lag, fel kanal, fel
    // arena, tappad match, hand-edit, drift generator<->fil) failar testet. String-
    // jämförelse ger en exakt diff vid fel (fail loud). Regenereras MED arena-tabellen
    // (T4c) så låset täcker både tablå-fälten och arenorna.
    const regenerated = buildMatchesFile(sourceText, groupOf, venueOf);
    expect(normalizeEol(regenerated)).toBe(normalizeEol(committedMatches));
  });

  it('källan ger exakt 72 gruppmatcher + 32 slutspelsmatcher = 104', () => {
    const matches = buildMatches(parseSchedule(sourceText), groupOf);
    expect(matches).toHaveLength(EXPECTED_TOTAL_MATCHES);
    expect(matches.filter((m) => m.stage === 'group')).toHaveLength(EXPECTED_GROUP_MATCHES);
    expect(matches.filter((m) => m.stage !== 'group')).toHaveLength(EXPECTED_KNOCKOUT_MATCHES);
  });
});

describe('Matchplanen: MUTATIONSTEST (beviset att låset fångar ett bytt värde)', () => {
  // Acceptanskriterium: ändra ETT värde i källan (här en kanal) och bevisa att
  // regenerera-och-diffa FAILAR. Annars vet vi inte att låset faktiskt fångar fel.
  function mutateChannel(): string {
    // Byt den FÖRSTA "(TV4)" till "(SVT)" i tablån (en kanal-transkriptionsfel-
    // klass). Bara ett tecken-spann skiljer mot källan.
    return sourceText.replace('(TV4)', '(SVT)');
  }

  it('en kanal-mutation gör matchplanen skild från den committade (låset fångar felet)', () => {
    const mutated = mutateChannel();
    expect(mutated).not.toBe(sourceText); // mutationen tog faktiskt effekt
    // Regenerera MED arena-tabellen så den ENDA skillnaden mot committen är den
    // muterade kanalen (annars skulle saknade arenor också skilja, och testet bevisade
    // inte att kanal-låset specifikt biter).
    const regenerated = buildMatchesFile(mutated, groupOf, venueOf);
    expect(normalizeEol(regenerated)).not.toBe(normalizeEol(committedMatches));
  });
});

describe('Matchplanen: KORSKOLL av lag mot FIFA-lottningen (teams.ts)', () => {
  const teamIds = new Set(WC2026_TEAMS.map((t) => t.id));

  it('varje lag-id i namn-mappningen finns i teams.ts (inget gissat/föräldralöst lag)', () => {
    for (const [name, id] of Object.entries(TEAM_NAME_TO_ID)) {
      expect(teamIds.has(id), `${name} -> ${id} saknas i teams.ts`).toBe(true);
    }
  });

  it('varje gruppmatchs lag finns i teams.ts och båda tillhör SAMMA grupp', () => {
    const groupMatches = WC2026_MATCHES.filter((m) => m.stage === 'group');
    for (const m of groupMatches) {
      expect(m.homeTeamId, `${m.id} hemmalag`).not.toBeNull();
      expect(m.awayTeamId, `${m.id} bortalag`).not.toBeNull();
      const hg = groupOf(m.homeTeamId!);
      const ag = groupOf(m.awayTeamId!);
      expect(hg, `${m.id}: okänt hemmalag ${m.homeTeamId}`).toBeDefined();
      expect(ag, `${m.id}: okänt bortalag ${m.awayTeamId}`).toBeDefined();
      expect(m.groupId).toBe(hg);
      expect(ag).toBe(hg);
    }
  });

  it('varje lag spelar exakt 3 gruppmatcher (full enkel serie i 4-lagsgrupp)', () => {
    const played = new Map<string, number>();
    for (const m of WC2026_MATCHES.filter((x) => x.stage === 'group')) {
      played.set(m.homeTeamId!, (played.get(m.homeTeamId!) ?? 0) + 1);
      played.set(m.awayTeamId!, (played.get(m.awayTeamId!) ?? 0) + 1);
    }
    expect(played.size).toBe(48); // alla 48 lag förekommer
    for (const [id, n] of played) {
      expect(n, `lag ${id} spelar ${n} gruppmatcher`).toBe(3);
    }
  });

  it('varje grupp har exakt 6 gruppmatcher (C(4,2))', () => {
    const perGroup = new Map<string, number>();
    for (const m of WC2026_MATCHES.filter((x) => x.stage === 'group')) {
      perGroup.set(m.groupId!, (perGroup.get(m.groupId!) ?? 0) + 1);
    }
    expect(perGroup.size).toBe(12);
    for (const [g, n] of perGroup) {
      expect(n, `grupp ${g}`).toBe(6);
    }
  });

  it('namn-varianterna i tablån är medvetna alias (Curacao/Curaçao, Kongo-Kinshasa/DR Kongo)', () => {
    // Tablån skriver "Curacao" (utan cedilj) och "Kongo-Kinshasa"; teams.ts har
    // "Curaçao" och "DR Kongo". Båda formerna ska peka på samma lag (annars tappas
    // en match tyst på en namn-skillnad).
    expect(TEAM_NAME_TO_ID['Curacao']).toBe('cuw');
    expect(TEAM_NAME_TO_ID['Curaçao']).toBe('cuw');
    expect(TEAM_NAME_TO_ID['Kongo-Kinshasa']).toBe('cod');
    expect(TEAM_NAME_TO_ID['DR Kongo']).toBe('cod');
  });
});

describe('Matchplanen: KORSKOLL av slutspelet mot FIFA:s spelschema (bracket-structure.ts)', () => {
  // Koda en committad BracketSource till tablåns kortform (1A/2B/3ABCDF/W73/RU101),
  // så vi kan jämföra tablåns positions-källor mot FIFA-motorn rad för rad.
  function encodeSource(s: BracketSource): string {
    switch (s.kind) {
      case 'group-winner':
        return `1${s.group}`;
      case 'group-runner-up':
        return `2${s.group}`;
      case 'best-third':
        return `3${[...s.eligibleGroups].join('')}`;
      case 'match-winner':
        return `W${s.matchId.replace('M', '')}`;
      case 'match-loser':
        return `RU${s.matchId.replace('M', '')}`;
    }
  }

  // Bygg det förväntade positions-paret OCH den förväntade FIFA-rundan (stage)
  // per matchnummer ur bracket-structure.ts (den OBEROENDE sanningskällan för
  // slutspels-strukturen). Stagen läses direkt ur BracketMatch.stage, alltså
  // härleds den INTE ur matchnummer-intervall i testet, utan jämförs mot FIFA-
  // motorns egen rund-tilldelning per match (M73-M88 = round-of-32, M89-M96 =
  // round-of-16, M97-M100 = quarter-final, M101-M102 = semi-final, M103 =
  // third-place, M104 = final, enligt ROUND_OF_32 ... FINAL i bracket-structure).
  const expectedByNumber = new Map<number, string>();
  const expectedStageByNumber = new Map<number, MatchStage>();
  for (const bm of BRACKET_MATCHES) {
    const n = Number(bm.id.replace('M', ''));
    const pair = [encodeSource(bm.home), encodeSource(bm.away)].sort().join(' | ');
    expectedByNumber.set(n, pair);
    expectedStageByNumber.set(n, bm.stage);
  }

  // Parsa slutspels-källorna ur tablån.
  const parsedKnockout = parseSchedule(sourceText).filter(
    (p): p is ParsedKnockoutMatch => p.kind === 'knockout'
  );

  it('tablån har exakt de 32 slutspelsmatcherna M73-M104', () => {
    const numbers = parsedKnockout.map((p) => p.matchNumber).sort((a, b) => a - b);
    expect(numbers).toHaveLength(32);
    expect(numbers[0]).toBe(73);
    expect(numbers[numbers.length - 1]).toBe(104);
    // Inga luckor: 73..104 = 32 distinkta nummer.
    expect(new Set(numbers).size).toBe(32);
  });

  it('varje slutspelsmatchs positions-källor (1E vs 3ABCDF m.fl.) stämmer mot FIFA-motorn', () => {
    // DETTA är korsverifieringen: en oberoende svensk TV-källa mot T4:s FIFA-
    // bygge. En avvikelse här betyder att antingen tablån eller bracket-structure
    // har fel, och det ska BRYTA bygget, inte gissas bort.
    for (const p of parsedKnockout) {
      const expected = expectedByNumber.get(p.matchNumber);
      expect(expected, `M${p.matchNumber} saknas i bracket-structure.ts`).toBeDefined();
      const actual = [p.home.raw, p.away.raw].sort().join(' | ');
      expect(actual, `M${p.matchNumber}`).toBe(expected);
    }
  });

  it('varje slutspelsmatchs FIFA-runda (stage) stämmer mot bracket-structure.ts', () => {
    // VARFÖR detta utöver positions-källorna: tablåns `stage` sätts av vilken
    // SEKTIONS-RUBRIK raden står under (SEXTONDELSFINALER ... FINAL), oberoende av
    // positions-källorna på raden. Positions-kollet ovan låser BARA paret, inte
    // rundan. En rad som hamnat under FEL rubrik i gold-source (eller en sektions-
    // rubrik som tappats/dubblerats) kan därför ge rätt positions-par men FEL stage
    // och ändå passera positions-kollet. Det vore exakt det kända lärdoms-mönstret
    // "uttömmande-test-vaktar-svagare-invariant-än-källan-fastställer": positions-
    // invarianten är svagare än vad FIFA-källan faktiskt fastställer (par + runda).
    // Här pinnar vi rundan mot bracket-structure.ts (den oberoende sanningskällan),
    // så en stage-felplacering BRYTER bygget i stället för att passera tyst.
    for (const p of parsedKnockout) {
      const expectedStage = expectedStageByNumber.get(p.matchNumber);
      expect(expectedStage, `M${p.matchNumber} saknas i bracket-structure.ts`).toBeDefined();
      expect(p.stage, `M${p.matchNumber} fel FIFA-runda`).toBe(expectedStage);
    }
  });

  it('NEGATIVT DELTEST: en stage-felplacering i källan fångas nu (svagare invariant stängd)', () => {
    // Bevis att stage-kollet biter (mutationstest i samma anda som kanal-
    // mutationen ovan): vi tar M89 (FIFA round-of-16) och förväxlar dess stage
    // till 'round-of-32', precis som om dess rad i gold-source hamnat under
    // SEXTONDELSFINALER-rubriken i stället för ÅTTONDELSFINALER. Positions-paret
    // (W74 vs W77) är HELT oförändrat, så det rena positions-kollet ovan hade
    // passerat tyst, det är just den svagare invarianten. Stage-kollet ska
    // däremot upptäcka den felplacerade rundan.
    const target = parsedKnockout.find((p) => p.matchNumber === 89);
    expect(target, 'M89 ska finnas i tablån').toBeDefined();

    const misfiled: typeof target = { ...target!, stage: 'round-of-32' };
    // Positions-paret är intakt (det gamla, svagare kollet skulle inte märka något):
    const pair = [misfiled!.home.raw, misfiled!.away.raw].sort().join(' | ');
    expect(pair, 'positions-paret ska vara oförändrat av en ren stage-förväxling').toBe(
      expectedByNumber.get(89)
    );
    // Men stage-kollet fångar den felplacerade rundan (det som annars passerat tyst):
    const expectedStage = expectedStageByNumber.get(89);
    expect(expectedStage).toBe('round-of-16');
    expect(misfiled!.stage).not.toBe(expectedStage);
  });

  it('slutspelsmatcher bär INGA lag än (seedas av T4/T9) men har FIFA-matchnummer-id', () => {
    const knockout = WC2026_MATCHES.filter((m) => m.stage !== 'group');
    expect(knockout).toHaveLength(EXPECTED_KNOCKOUT_MATCHES);
    for (const m of knockout) {
      expect(m.homeTeamId, `${m.id} ska inte ha lag än`).toBeNull();
      expect(m.awayTeamId, `${m.id} ska inte ha lag än`).toBeNull();
      expect(m.groupId).toBeNull();
      expect(m.id).toMatch(/^M(7[3-9]|8\d|9\d|10[0-4])$/);
    }
  });
});

describe('Matchplanen: avsparkstid härledd rätt i svensk tid (off-by-one-skydd)', () => {
  it('härleder svensk väggklocka till rätt UTC-instant (DST-medvetet, inte hårdkodad +2)', () => {
    // 21:00 svensk sommartid 11 juni = 19:00Z (CEST = UTC+2).
    expect(zonedWallTimeToUtcIso('Europe/Stockholm', 2026, 6, 11, 21, 0)).toBe(
      '2026-06-11T19:00:00.000Z'
    );
    // Skyddet mot off-by-one: 00:00 svensk tid 14 juni är 22:00Z 13 JUNI (dagen
    // INNAN i UTC). Att lagra "14 juni 00:00" rakt av som UTC vore off-by-one.
    expect(zonedWallTimeToUtcIso('Europe/Stockholm', 2026, 6, 14, 0, 0)).toBe(
      '2026-06-13T22:00:00.000Z'
    );
    // Vinterdatum ger +1 (bevisar att offset härleds ur zonen, inte hårdkodas).
    expect(zonedWallTimeToUtcIso('Europe/Stockholm', 2026, 1, 15, 12, 0)).toBe(
      '2026-01-15T11:00:00.000Z'
    );
  });

  it('midnatts-matchen i matches.ts har rätt UTC-datum (Brasilien vs Marocko, 00:00 14 juni)', () => {
    // Källan: "Söndag 14 juni: 00:00 Brasilien vs Marocko (SVT)". Det är gruppens
    // FÖRSTA match (g-C-1). UTC-instanten ska ligga 13 juni 22:00Z, inte 14 juni.
    const m = WC2026_MATCHES.find((x) => x.id === 'g-C-1');
    expect(m).toBeDefined();
    expect(m!.homeTeamId).toBe('bra');
    expect(m!.awayTeamId).toBe('mar');
    expect(m!.kickoff).toBe('2026-06-13T22:00:00.000Z');
    // Och formaterad tillbaka till svensk tid ska det bli 14 juni 00:00 (rundtur).
    const back = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(m!.kickoff));
    expect(back).toContain('00:00');
    expect(back).toContain('2026-06-14');
  });

  it('alla kickoff-värden är giltiga UTC ISO-strängar i kronologisk turnerings-ordning för grupp+slutspel', () => {
    for (const m of WC2026_MATCHES) {
      expect(m.kickoff, m.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Number.isNaN(Date.parse(m.kickoff)), m.id).toBe(false);
    }
    // Slutspelet börjar efter gruppspelet (sista gruppmatch före första R32).
    const lastGroup = Math.max(
      ...WC2026_MATCHES.filter((m) => m.stage === 'group').map((m) => Date.parse(m.kickoff))
    );
    const firstKo = Math.min(
      ...WC2026_MATCHES.filter((m) => m.stage !== 'group').map((m) => Date.parse(m.kickoff))
    );
    expect(firstKo).toBeGreaterThanOrEqual(lastGroup);
  });
});

describe('Matchplanen: TV-kanal och arena', () => {
  it('varje match har en svensk TV-kanal (SVT eller TV4)', () => {
    for (const m of WC2026_MATCHES) {
      expect(['SVT', 'TV4'], `${m.id}: ${m.tvChannel}`).toContain(m.tvChannel);
    }
  });

  it('varje match har en verifierad arena, INTE platshållaren (arenan fylld i T4c #35)', () => {
    // T4b bar bara tid + kanal, så venue var FÖRR VENUE_UNKNOWN för alla matcher. T4c
    // fyller arenan per match ur arena-källan (venue-source.txt), korskollad mot FIFA.
    // Här låser vi bara att ingen platshållare är kvar; de fullständiga arena-korskollen
    // (16 distinkta arenor, spelade matcher, källavvikelse) bor i venue-source.test.ts.
    for (const m of WC2026_MATCHES) {
      expect(m.venue, `${m.id}: ${m.venue}`).not.toBe(VENUE_UNKNOWN);
    }
  });

  it('utan arena-källa faller buildMatches tillbaka till platshållaren (gissa-aldrig kvar)', () => {
    // Fallbacket finns kvar: anropas buildMatches UTAN venue-lookup (en ännu-overifierad
    // framtida match) får varje match VENUE_UNKNOWN, inte en gissad arena. Det är just
    // detta T4b-fallback-beteende venue-källan ersätter när arenan ÄR verifierad.
    const fallback = buildMatches(parseSchedule(sourceText), groupOf);
    for (const m of fallback) {
      expect(m.venue, m.id).toBe(VENUE_UNKNOWN);
    }
  });

  it('alla matcher är scheduled med resultat null (turneringen har inte börjat)', () => {
    for (const m of WC2026_MATCHES) {
      expect(m.status, m.id).toBe('scheduled');
      expect(m.result, m.id).toBeNull();
    }
  });

  it('match-id:n är unika', () => {
    const ids = WC2026_MATCHES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Matchplanen: parsern fail-loud:ar på trasig källa (fel-vägar)', () => {
  it('kastar om startmarkören saknas', () => {
    expect(() => parseSchedule('ingen markör här\nbara brus')).toThrow(/startmarkören/);
  });

  it('kastar på ett okänt lagnamn (transkriptionsfel ska inte tappas tyst)', () => {
    const bad = `TV-TIDER:\nTorsdag 11 juni: 21:00 Atlantis vs Sydafrika (TV4)`;
    expect(() => parseSchedule(bad)).toThrow(/Okänt lagnamn/);
  });

  it('kastar på en okänd TV-kanal', () => {
    const bad = `TV-TIDER:\nTorsdag 11 juni: 21:00 Mexiko vs Sydafrika (HBO)`;
    // Kanalen matchar inte radmönstret (bara SVT|TV4 tillåts där), så posten
    // rapporteras som felformad, fail loud antingen via mönster eller kanal-koll.
    expect(() => parseSchedule(bad)).toThrow();
  });

  it('kastar på en okänd månad', () => {
    const bad = `TV-TIDER:\nTorsdag 11 smörgås: 21:00 Mexiko vs Sydafrika (TV4)`;
    expect(() => parseSchedule(bad)).toThrow(/månad/);
  });

  it('buildMatches kastar om en gruppmatch korsar grupper (data-defekt)', () => {
    // mex (A) vs swe (F) är ingen giltig gruppmatch. Bygg en parsad post för hand.
    const crossing = [
      {
        kind: 'group' as const,
        kickoffUtc: '2026-06-11T19:00:00.000Z',
        homeTeamId: 'mex',
        awayTeamId: 'swe',
        tvChannel: 'TV4',
      },
    ];
    expect(() => buildMatches(crossing, groupOf)).toThrow(/korsar grupper/);
  });

  it('buildMatches kastar om ett gruppmatch-lag är okänt', () => {
    const unknown = [
      {
        kind: 'group' as const,
        kickoffUtc: '2026-06-11T19:00:00.000Z',
        homeTeamId: 'xyz',
        awayTeamId: 'mex',
        tvChannel: 'TV4',
      },
    ];
    expect(() => buildMatches(unknown, groupOf)).toThrow(/okänt lag-id/);
  });
});
