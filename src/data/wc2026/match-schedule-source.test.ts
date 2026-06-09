import { describe, expect, it } from 'vitest';
// Källfilerna läses som rå text via Vites `?raw` (typad av vite/client), så
// testet behöver inga Node-beroenden och typkollas av app-bygget.
import sourceText from './tv-schedule-source.txt?raw';
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
import { WC2026_MATCHES } from './matches';
import { WC2026_TEAMS } from './teams';
import { BRACKET_MATCHES } from '../../domain/bracket/bracket-structure';
import type { BracketSource } from '../../domain/types';

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
    // Detta är låset. Skiljer en enda match sig (fel tid, fel lag, fel kanal,
    // tappad match, hand-edit, drift generator<->fil) failar testet. String-
    // jämförelse ger en exakt diff vid fel (fail loud).
    const regenerated = buildMatchesFile(sourceText, groupOf);
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
    const regenerated = buildMatchesFile(mutated, groupOf);
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

  // Bygg det förväntade positions-paret per matchnummer ur bracket-structure.ts.
  const expectedByNumber = new Map<number, string>();
  for (const bm of BRACKET_MATCHES) {
    const n = Number(bm.id.replace('M', ''));
    const pair = [encodeSource(bm.home), encodeSource(bm.away)].sort().join(' | ');
    expectedByNumber.set(n, pair);
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

describe('Matchplanen: TV-kanal och arena-lucka', () => {
  it('varje match har en svensk TV-kanal (SVT eller TV4)', () => {
    for (const m of WC2026_MATCHES) {
      expect(['SVT', 'TV4'], `${m.id}: ${m.tvChannel}`).toContain(m.tvChannel);
    }
  });

  it('varje match flaggar arena som ej verifierad (källan saknar arena, gissas aldrig)', () => {
    // Känd lucka: tablån bär tid + kanal men inte arena. venue är ett obligatoriskt
    // fält, så vi sätter en UTTRYCKLIG "ej verifierad"-text i stället för en gissad
    // arena (PRINCIPLES: gissa aldrig). Detta test låser att ingen arena smugits in.
    for (const m of WC2026_MATCHES) {
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
