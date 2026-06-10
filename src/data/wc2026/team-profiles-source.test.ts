import { describe, expect, it } from 'vitest';
// Källfilerna läses som rå text via Vites `?raw` (typad av vite/client), så testet
// behöver inga Node-beroenden och typkollas av app-bygget.
import sourceText from './team-profiles-source.txt?raw';
import committedProfiles from './team-profiles.ts?raw';
// Återanvänd EXAKT generatorns parsnings-/emit-/validerings-logik (ingen duplicerad
// parser): testet bevisar att DEN HÄR koden, körd på den committade källan, ger den
// committade team-profiles.ts. Se src/data/wc2026/team-profiles-parser.ts.
import {
  buildProfilesFile,
  buildProfileTable,
  parseProfiles,
  parseProfileRow,
  MAX_STAR_PLAYERS,
  type TeamRef,
} from './team-profiles-parser';
import { WC2026_TEAM_PROFILES } from './team-profiles';
import { WC2026_TEAMS } from './teams';
// Bas-listan importeras ur den PROFIL-OBEROENDE team-refs.ts (samma källa
// generatorn använder), inte ur teams.ts, så testet speglar generatorns bootstrap.
import { WC2026_TEAM_REFS } from './team-refs';

// ============================================================================
// KÄLLÅNKRING av VM 2026:s lag-profiler (T10, #10, SPEC §6).
//
// Profildatan (FIFA-ranking + stjärnspelare + kuriosa) är gissningskänslig och
// kommer ur committade källor (se preambeln i team-profiles-source.txt). Tre lager
// gör datan trovärdig och spårbar, samma mönster som T4:s Annexe C och T4b:s tablå:
//   1. KÄLLÅNKRING: regenerera team-profiles.ts ur det committade källutdraget och
//      kräv VÄRDE-likhet (fail loud vid minsta skillnad). Mutationstestet bevisar
//      att låset fångar ett bytt värde (annars vet vi inte att låset funkar).
//   2. TÄCKNING: exakt 48 lag, en profil per lag i teams.ts, varken mer eller mindre
//      (drift-vakt åt BÅDA håll).
//   3. INVÄVNING: Team-objekten i teams.ts bär profilfälten (fifaRanking/starPlayers/
//      trivia) ur tabellen, och bestPlay förblir UTELÄMNAD (decisions.md T10).
// ============================================================================

// Lag-listan parsern/generatorn behöver: teams.ts PROFIL-OBEROENDE bas-export
// (id/kod/grupp, A-L-ordning). Avsiktligt INTE härledd ur WC2026_TEAMS, som
// berikas med den GENERERADE team-profiles.ts , det vore samma cirkulära
// bootstrap-beroende generatorn nu undviker (källankrings-testet ska kunna
// regenerera profilerna även om team-profiles.ts saknas/är trasig).
const teamRefs: readonly TeamRef[] = WC2026_TEAM_REFS;

/**
 * Radslut-normalisering före jämförelse. Den committade .ts:en kan vara CRLF på
 * Windows (git autocrlf) medan generatorn emittar LF; en RÅ byte-jämförelse skulle
 * annars faila på enbart radslut, inte på innehåll (känd fallgrop:
 * idempotent-synk-verifierad-med-radslut-känslig-hash). Vi jämför INNEHÅLL.
 */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('Lag-profiler: låst mot källutdraget (regenerera och diffa)', () => {
  it('regenererad team-profiles.ts ur källutdraget är värde-identisk med team-profiles.ts', () => {
    // Detta är låset. Skiljer en enda profil sig (fel rank, fel/extra spelare, fel
    // kuriosa, tappad rad, hand-edit, drift generator<->fil) failar testet. String-
    // jämförelse ger en exakt diff vid fel (fail loud).
    const regenerated = buildProfilesFile(sourceText, teamRefs);
    expect(normalizeEol(regenerated)).toBe(normalizeEol(committedProfiles));
  });

  it('källan ger exakt 48 profilrader', () => {
    const rows = parseProfiles(sourceText);
    expect(rows).toHaveLength(48);
  });
});

describe('Lag-profiler: MUTATIONSTEST (beviset att låset fångar ett bytt värde)', () => {
  // Acceptanskriterium: ändra ETT värde i källan och bevisa att regenerera-och-diffa
  // FAILAR. Källan har många oberoende värden, så en enkel byt-ETT-värde-mutation
  // räcker (samma som T4b:s kanal-mutation), ingen behörighets-bevarande swap krävs.

  it('en FIFA-ranking-mutation gör profilerna skilda från den committade (låset fångar felet)', () => {
    // Byt Frankrikes "rank=1" till "rank=9". En transkriptions-/faktafel-klass på
    // den mest gissningskänsliga datan (rankingen).
    const mutated = sourceText.replace('rank=1 |', 'rank=9 |');
    expect(mutated).not.toBe(sourceText); // mutationen tog effekt
    const regenerated = buildProfilesFile(mutated, teamRefs);
    expect(normalizeEol(regenerated)).not.toBe(normalizeEol(committedProfiles));
  });

  it('en stjärnspelar-mutation gör profilerna skilda från den committade', () => {
    // Byt ut en bekräftad spelare mot en annan: en profil med en spelare som INTE
    // tillhör truppen skulle slinka igenom om låset inte fångade värdet.
    const mutated = sourceText.replace('Lionel Messi', 'Diego Maradona');
    expect(mutated).not.toBe(sourceText);
    const regenerated = buildProfilesFile(mutated, teamRefs);
    expect(normalizeEol(regenerated)).not.toBe(normalizeEol(committedProfiles));
  });
});

describe('Lag-profiler: 48/48-täckning och drift-vakt mot teams.ts', () => {
  const profileIds = Object.keys(WC2026_TEAM_PROFILES);

  it('har exakt 48 profiler', () => {
    expect(profileIds).toHaveLength(48);
  });

  it('varje lag i teams.ts har EXAKT en profil (ingen saknas)', () => {
    for (const team of WC2026_TEAMS) {
      expect(WC2026_TEAM_PROFILES[team.id], `profil för ${team.code}`).toBeDefined();
    }
  });

  it('ingen profil saknar ett lag i teams.ts (ingen extra/föräldralös profil)', () => {
    const teamIds = new Set(WC2026_TEAMS.map((t) => t.id));
    for (const id of profileIds) {
      expect(teamIds.has(id), `profil-id ${id} saknar lag i teams.ts`).toBe(true);
    }
  });

  it('buildProfileTable fail-loud:ar om ett lag saknar profilrad', () => {
    // Ta bort Sveriges rad ur källan: byggsteget ska KASTA (hellre stopp än ett lag
    // utan profil), inte tyst ge 47 profiler.
    const withoutSweden = sourceText
      .split('\n')
      .filter((l) => !l.startsWith('SWE |'))
      .join('\n');
    expect(() => buildProfileTable(parseProfiles(withoutSweden), teamRefs)).toThrow(/SWE/);
  });

  it('buildProfileTable fail-loud:ar på en dubblerad profil', () => {
    const rows = parseProfiles(sourceText);
    const duplicated = [...rows, rows[0]]; // samma lag två gånger
    expect(() => buildProfileTable(duplicated, teamRefs)).toThrow(/[Dd]ubbler/);
  });

  it('buildProfileTable fail-loud:ar på en okänd lag-kod', () => {
    const rows = parseProfiles(sourceText);
    const withUnknown = [...rows, { code: 'XXX', fifaRanking: 1, starPlayers: [], trivia: 'x' }];
    expect(() => buildProfileTable(withUnknown, teamRefs)).toThrow(/XXX/);
  });
});

describe('Lag-profiler: värde-integritet (varje rad välformad)', () => {
  const profiles = Object.values(WC2026_TEAM_PROFILES);

  it('varje FIFA-ranking är ett positivt heltal', () => {
    for (const p of profiles) {
      expect(Number.isInteger(p.fifaRanking)).toBe(true);
      expect(p.fifaRanking).toBeGreaterThanOrEqual(1);
    }
  });

  it('inga två lag delar FIFA-ranking (rankingen är en unik position)', () => {
    // En FIFA-position är unik per lag i en given utgåva; två lag på samma rank vore
    // ett transkriptions-fel. (48 lag, alla med olika position i aprilutgåvan.)
    const ranks = profiles.map((p) => p.fifaRanking);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('varje lag har 0-3 stjärnspelare, alla icke-tomma namn', () => {
    for (const p of profiles) {
      expect(p.starPlayers.length).toBeLessThanOrEqual(MAX_STAR_PLAYERS);
      for (const name of p.starPlayers) {
        expect(name.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('varje lag har en icke-tom kuriosa-rad', () => {
    for (const p of profiles) {
      expect(p.trivia.trim().length).toBeGreaterThan(0);
    }
  });

  it('svensk text bevarar diakriter (å/ä/ö) i kuriosan, inga ASCII-substitut', () => {
    // EN smoke-koll mot ASCII-svenska (lessons: ascii-substitut-for-diakriter): minst
    // en kuriosa-rad innehåller ett svenskt diakrit-tecken (slutspel/på/första), så
    // en UTF-8-regression i källan/genereringen skulle synas.
    const allTrivia = profiles.map((p) => p.trivia).join(' ');
    expect(allTrivia).toMatch(/[åäö]/);
  });
});

describe('Lag-profiler: parsern är strikt (fail loud på trasig rad)', () => {
  it('avvisar en rad med fel antal fält', () => {
    expect(() => parseProfileRow('SWE | rank=38 | star=Isak')).toThrow();
  });

  it('avvisar en ogiltig FIFA-ranking (icke-heltal)', () => {
    expect(() => parseProfileRow('SWE | rank=topp | star=Isak | kuriosa=test')).toThrow(/ranking/);
  });

  it('avvisar fler än tre stjärnspelare', () => {
    expect(() => parseProfileRow('SWE | rank=38 | star=A; B; C; D | kuriosa=test')).toThrow(
      /[Ff]ör många/
    );
  });

  it('avvisar en tom kuriosa-rad', () => {
    expect(() => parseProfileRow('SWE | rank=38 | star=Isak | kuriosa=')).toThrow(/[Kk]uriosa/);
  });

  it('tillåter en tom star-lista (inga källbelagda spelare = giltigt, hellre tomt än gissat)', () => {
    const row = parseProfileRow('SWE | rank=38 | star= | kuriosa=test');
    expect(row.starPlayers).toEqual([]);
  });
});

describe('Lag-profiler: invävning i Team (teams.ts bär profil-fälten, utom bestPlay)', () => {
  it('varje Team bär fifaRanking, starPlayers och trivia ur profilen', () => {
    for (const team of WC2026_TEAMS) {
      const profile = WC2026_TEAM_PROFILES[team.id];
      expect(team.fifaRanking).toBe(profile.fifaRanking);
      expect(team.starPlayers).toEqual(profile.starPlayers);
      expect(team.trivia).toBe(profile.trivia);
    }
  });

  it('inget Team har bestPlay satt (utelämnat med flit, decisions.md T10)', () => {
    for (const team of WC2026_TEAMS) {
      expect(team.bestPlay).toBeUndefined();
    }
  });

  it('spot-check mot källan (Frankrike #1, debutanten Uzbekistan utan placerings-kuriosa)', () => {
    const france = WC2026_TEAMS.find((t) => t.code === 'FRA')!;
    expect(france.fifaRanking).toBe(1);
    expect(france.starPlayers).toContain('Kylian Mbappé');

    const uzbekistan = WC2026_TEAMS.find((t) => t.code === 'UZB')!;
    expect(uzbekistan.fifaRanking).toBe(50);
    expect(uzbekistan.trivia).toMatch(/debut/i);
  });
});
