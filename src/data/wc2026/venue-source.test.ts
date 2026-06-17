import { describe, expect, it } from 'vitest';
// Källfilerna läses som rå text via Vites `?raw` (typad av vite/client), så testet
// behöver inga Node-beroenden och typkollas av app-bygget.
import scheduleSource from './tv-schedule-source.txt?raw';
import venueSource from './venue-source.txt?raw';
import committedMatches from './matches.ts?raw';
// Återanvänd EXAKT generatorns parsnings-/emit-logik (ingen duplicerad parser): testet
// bevisar att DEN HÄR koden, körd på de committade källorna, ger den committade
// matches.ts. Se venue-parser.ts + match-schedule-parser.ts.
import {
  buildVenueTable,
  parseVenues,
  parseVenueRow,
  KNOWN_VENUES,
  EXPECTED_VENUE_COUNT,
  EXPECTED_MATCH_ROWS,
} from './venue-parser';
import { buildMatches, buildMatchesFile, parseSchedule } from './match-schedule-parser';
import { WC2026_MATCHES } from './matches';
import { WC2026_TEAMS } from './teams';
import { isVenuePlaceholder } from '../../features/daily/match-display';

// ============================================================================
// KÄLLÅNKRING + KORSKOLL av VM 2026:s arenor/städer/land per match (T4c #35 + T4d #147,
// SPEC §5/§8).
//
// TV-tablån (T4b) bar tid + kanal men INTE arena, så matches.ts hade en uttrycklig
// "ej verifierad"-platshållare per match. T4c fyller arenan + värdstaden per match ur
// FIFA:s spelschema (16 arenor i USA/Mexiko/Kanada), korskollad mot en andra oberoende
// källa. T4d (#147) lägger till VÄRDLANDET, så venue blir "Arena, Stad, Land" (svenskt
// landsnamn). Två kontroller gör datan trovärdig och spårbar (samma mönster som T4b/T10):
//   1. KÄLLÅNKRING: regenerera matches.ts ur de committade källorna (tablå + arena) och
//      kräv VÄRDE-likhet (fail loud vid minsta skillnad). Mutationstesterna bevisar att
//      låset fångar en bytt arena OCH ett bytt värdland.
//   2. KORSKOLL/INTEGRITET: exakt 104 arena-rader joinade på match-id, exakt 16 distinkta
//      arenor (FIFA) fördelade 3/2/11 på Mexiko/Kanada/USA, inga platshållare kvar, de
//      SPELADE matchernas arenor stämmer mot matchrapporterna (historiskt fakta), och
//      datan är diakrit-/em-dash-ren.
//
// KÄLLOR (gissas ALDRIG): se preambeln i venue-source.txt. PRIMÄR = FIFA:s spelschema
// (Wikipedia "2026 FIFA World Cup" + Al Jazeera per-match + Wikipedia knockout). KORSKOLL
// = MLSSoccer "every game by city & stadium" + ESPN (exakt kommun) + matchrapporter för
// de spelade matcherna. En källavvikelse (Belgien-Egypten) är LÖST mot 4 källor (se
// preambeln + docs/decisions.md T4c).
// ============================================================================

/** Alla match-id i den committade matchplanen (join-mängden för arena-tabellen). */
const MATCH_IDS = WC2026_MATCHES.map((m) => m.id);

/** O(1)-lookup: lag-id -> grupp (en sanning, ur teams.ts), för att bygga matchplanen. */
const groupById = new Map(WC2026_TEAMS.map((t) => [t.id, t.group]));
const groupOf = (id: string) => groupById.get(id);

/** Bygg arena-uppslaget (match-id -> venue) ur den committade källan. */
function venueLookup(source = venueSource) {
  const table = buildVenueTable(parseVenues(source), MATCH_IDS);
  return (id: string) => table.get(id);
}

/**
 * Radslut-normalisering före jämförelse. Den committade .ts:en kan vara CRLF på Windows
 * (git autocrlf) medan generatorn emittar LF; en RÅ byte-jämförelse skulle annars faila
 * på enbart radslut, inte på innehåll (känd fallgrop: idempotent-synk-verifierad-med-
 * radslut-känslig-hash). Vi jämför INNEHÅLL.
 */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('Arenor: låsta mot arena-källan (regenerera och diffa)', () => {
  it('regenererad matches.ts ur tablå + arena-källan är värde-identisk med matches.ts', () => {
    // Detta är låset. Skiljer en enda arena sig (fel arena, fel stad, tappad rad,
    // hand-edit, drift generator<->fil) failar testet. String-jämförelse ger en exakt
    // diff vid fel (fail loud). Samma lås som T4b men nu MED arena-injektionen.
    const regenerated = buildMatchesFile(scheduleSource, groupOf, venueLookup());
    expect(normalizeEol(regenerated)).toBe(normalizeEol(committedMatches));
  });

  it('arena-källan ger exakt 104 rader (en per match)', () => {
    expect(parseVenues(venueSource)).toHaveLength(EXPECTED_MATCH_ROWS);
  });
});

describe('Arenor: MUTATIONSTEST (beviset att låset fångar en bytt arena)', () => {
  it('en arena-mutation gör matchplanen skild från den committade (låset fångar felet)', () => {
    // Flytta öppningsmatchen (g-A-1) från Estadio Azteca till en ANNAN känd arena: en
    // arena-transkriptions-/faktafel-klass på den mest gissningskänsliga datan. Byter
    // BARA arenan, inget annat, och bara på EN rad (g-A-1 är enda raden med just den
    // sträng-kombinationen, g-A-6 har samma arena men annan match-etikett).
    const mutated = venueSource.replace(
      'g-A-1 | venue=Estadio Azteca, Mexico City, Mexiko',
      'g-A-1 | venue=BMO Field, Toronto, Kanada'
    );
    expect(mutated).not.toBe(venueSource); // mutationen tog effekt
    const regenerated = buildMatchesFile(scheduleSource, groupOf, venueLookup(mutated));
    expect(normalizeEol(regenerated)).not.toBe(normalizeEol(committedMatches));
  });

  it('en LAND-mutation (fel värdland) gör matchplanen skild från den committade (T4d #147)', () => {
    // T4d-specifikt: byt BARA landet på g-A-1 (Estadio Azteca ligger i Mexiko, inte USA).
    // Bevisar att låset fångar ett fel värdland, inte bara en fel arena. Den muterade
    // strängen är inte en av KNOWN_VENUES, så parsern fail-loud:ar redan vid bygget; vi
    // asserterar att regenereringen KASTAR (felaktigt land slinker aldrig igenom tyst).
    const mutated = venueSource.replace(
      'g-A-1 | venue=Estadio Azteca, Mexico City, Mexiko',
      'g-A-1 | venue=Estadio Azteca, Mexico City, USA'
    );
    expect(mutated).not.toBe(venueSource); // mutationen tog effekt
    expect(() => buildMatchesFile(scheduleSource, groupOf, venueLookup(mutated))).toThrow(
      /[Oo]känd arena/
    );
  });

  it('utan arena-källa (ingen injektion) faller alla matcher tillbaka till platshållaren', () => {
    // Bevisar att fallbacket FAKTISKT är platshållaren (gissa aldrig), inte tyst tomt:
    // buildMatches utan venueOf ger VENUE_UNKNOWN för varje match, vilket skiljer sig
    // från den committade (verifierade) filen. Detta är den gren som var hela T4b.
    const withoutVenues = buildMatchesFile(scheduleSource, groupOf);
    expect(normalizeEol(withoutVenues)).not.toBe(normalizeEol(committedMatches));
    const matches = buildMatches(parseSchedule(scheduleSource), groupOf);
    for (const m of matches) {
      expect(isVenuePlaceholder(m.venue), m.id).toBe(true);
    }
  });
});

describe('Arenor: integritet i den committade matches.ts', () => {
  it('ingen match har kvar "ej verifierad"-platshållaren (alla 104 fyllda)', () => {
    for (const m of WC2026_MATCHES) {
      expect(isVenuePlaceholder(m.venue), `${m.id}: ${m.venue}`).toBe(false);
    }
  });

  it('varje match-venue är en av de 16 kända FIFA-arenorna (ingen gissad/okänd)', () => {
    for (const m of WC2026_MATCHES) {
      expect(KNOWN_VENUES.has(m.venue), `${m.id}: ${m.venue}`).toBe(true);
    }
  });

  it('hela planen spelas i exakt 16 distinkta arenor (FIFA)', () => {
    const distinct = new Set(WC2026_MATCHES.map((m) => m.venue));
    expect(distinct.size).toBe(EXPECTED_VENUE_COUNT);
  });

  it('de 16 arenorna fördelas på värdländerna: 3 Mexiko, 2 Kanada, 11 USA (T4d #147)', () => {
    // T4d (#147): VM 2026 har tre värdländer. Räknar DISTINKTA arenor per land (inte
    // matcher), så fördelningen ska vara exakt 3 (Mexiko) + 2 (Kanada) + 11 (USA) = 16.
    // Källa: FIFA:s värdstäder-lista (Wikipedia "2026 FIFA World Cup"), se decisions.md T4d.
    // En felmappad arena (t.ex. en mexikansk arena märkt USA) skulle rubba fördelningen.
    const arenasByCountry = new Map<string, Set<string>>();
    for (const venue of new Set(WC2026_MATCHES.map((m) => m.venue))) {
      const land = venue.split(', ').at(-1) ?? '';
      const set = arenasByCountry.get(land) ?? new Set<string>();
      set.add(venue);
      arenasByCountry.set(land, set);
    }
    expect(arenasByCountry.get('Mexiko')?.size, 'Mexiko-arenor').toBe(3);
    expect(arenasByCountry.get('Kanada')?.size, 'Kanada-arenor').toBe(2);
    expect(arenasByCountry.get('USA')?.size, 'USA-arenor').toBe(11);
    // Inga andra länder än de tre värdländerna.
    expect([...arenasByCountry.keys()].sort()).toEqual(['Kanada', 'Mexiko', 'USA']);
  });

  it('arena-strängen har formen "Arena, Stad, Land" (komma + mellanslag, ingen tom del)', () => {
    // T4d (#147): venue blev "Arena, Stad, Land" (landet tillagt). Komma + mellanslag
    // mellan alla tre delar, ingen del tom. Arenanamn kan självt INTE innehålla ", "
    // (alla 16 KNOWN_VENUES är "Arena, Stad, Land"-trippler), så split(', ') ger exakt 3.
    for (const m of WC2026_MATCHES) {
      const parts = m.venue.split(', ');
      expect(parts.length, `${m.id}: ${m.venue}`).toBe(3);
      expect(parts[0].trim().length, `${m.id} arena-del`).toBeGreaterThan(0);
      expect(parts[1].trim().length, `${m.id} stad-del`).toBeGreaterThan(0);
      expect(parts[2].trim().length, `${m.id} land-del`).toBeGreaterThan(0);
    }
  });

  it('varje arena-venue slutar med ett av de tre svenska värdländerna (Mexiko/USA/Kanada)', () => {
    // T4d (#147): VM 2026 spelas i exakt tre värdländer. Landet är sista delen i venue-
    // strängen och skrivs på SVENSKA (appens språk). Gissa-aldrig: bara dessa tre tillåts.
    const HOST_COUNTRIES = new Set(['Mexiko', 'USA', 'Kanada']);
    for (const m of WC2026_MATCHES) {
      const land = m.venue.split(', ').at(-1);
      expect(HOST_COUNTRIES.has(land ?? ''), `${m.id}: ${m.venue}`).toBe(true);
    }
  });

  it('inga em-dashes eller diakrit-skador i arena-strängarna (svensk copy-regel + UTF-8)', () => {
    // Repots em-dash-regel: inga em-dashes (— / –) i datan. Arenanamnen är dessutom ASCII (inga
    // å/ä/ö), så ett mojibake-substitut (Ã¥ o.d.) skulle synas; vi låser att strängen
    // bara har väntade tecken (bokstäver, siffror, mellanslag, komma, &, apostrof,
    // bindestreck). Fångar en encoding-regression i källan/genereringen.
    for (const m of WC2026_MATCHES) {
      expect(m.venue, `${m.id} em-dash`).not.toMatch(/[—–]/);
      expect(m.venue, `${m.id} oväntade tecken`).toMatch(/^[A-Za-z0-9 ,&'.-]+$/);
    }
  });
});

describe('Arenor: SPELADE matcher (11-12 juni) stämmer mot matchrapporterna (historiskt fakta)', () => {
  // De första matcherna är redan spelade när T4c byggs (VM live sedan 11 juni), så
  // deras arenor är HISTORISKT fakta, extra lätt att korskolla mot matchrapporter.
  // Pinnar de verifierade arenorna explicit (källa: ESPN/CNN/Sky Sports/Outlook +
  // Lumen Fields egen event-sida + Seattle Sounders, se venue-source.txt + decisions T4c).
  // Venue-strängen är "Arena, Stad, Land" sedan T4d (#147); land pinnas explicit här.
  const cases: ReadonlyArray<[string, string]> = [
    ['g-A-1', 'Estadio Azteca, Mexico City, Mexiko'], // Mexiko 2-0 Sydafrika, öppningsmatchen
    ['g-A-2', 'Estadio Akron, Zapopan, Mexiko'], // Sydkorea 2-1 Tjeckien
    ['g-B-1', 'BMO Field, Toronto, Kanada'], // Kanada vs Bosnien (Kanadas öppning, 12 juni)
    ['g-D-1', 'SoFi Stadium, Inglewood, USA'], // USA vs Paraguay (USA:s öppning, 12 juni)
  ];

  it.each(cases)('%s spelades på %s', (id, expectedVenue) => {
    const match = WC2026_MATCHES.find((m) => m.id === id);
    expect(match, `${id} finns i matchplanen`).toBeDefined();
    expect(match!.venue).toBe(expectedVenue);
  });

  it('den LÖSTA källavvikelsen (Belgien-Egypten) är Lumen Field, Seattle (inte Vancouver)', () => {
    // Al Jazeera skrev "BC Place, Vancouver", men 4 källor (Lumen Fields event-sida,
    // Seattle Sounders, ESPN, MLSSoccer) säger Lumen Field, Seattle. Vald: Seattle.
    // Detta test pinnar att vi INTE tyst valde outliern. Se decisions.md (T4c).
    const belEgy = WC2026_MATCHES.find((m) => m.id === 'g-G-1');
    expect(belEgy!.venue).toBe('Lumen Field, Seattle, USA');
  });

  it('den mest använda arenan är AT&T Stadium med 9 matcher (FIFA: flest av alla venues)', () => {
    // Oberoende korskoll av JOIN-en mot en publik FIFA-fakta: AT&T Stadium (Arlington)
    // är den verifierat mest använda arenan med 9 matcher. En felaktig join (en arena-
    // rad på fel match) skulle rubba fördelningen. Verifierar att summan stämmer.
    const counts = new Map<string, number>();
    for (const m of WC2026_MATCHES) {
      counts.set(m.venue, (counts.get(m.venue) ?? 0) + 1);
    }
    const max = Math.max(...counts.values());
    expect(max).toBe(9);
    expect(counts.get('AT&T Stadium, Arlington, USA')).toBe(9);
  });
});

describe('Arenor: parsern är strikt (fail loud på trasig rad/join)', () => {
  it('avvisar en rad utan venue-fält', () => {
    expect(() => parseVenueRow('g-A-1 | match=Mexiko vs Sydafrika')).toThrow(/venue/);
  });

  it('avvisar ett ogiltigt match-id-format', () => {
    expect(() => parseVenueRow('grupp-A-1 | venue=Estadio Azteca, Mexico City, Mexiko')).toThrow(
      /match-id/
    );
  });

  it('avvisar en okänd arena (gissad/feltranskriberad arena ska inte slinka igenom)', () => {
    expect(() => parseVenueRow('g-A-1 | venue=Camp Nou, Barcelona, Spanien')).toThrow(
      /[Oo]känd arena/
    );
  });

  it('parseVenues kastar om start-markören saknas (trasig källa ger inte tyst noll rader)', () => {
    expect(() => parseVenues('ingen markör\nbara brus')).toThrow(/start-markören/);
  });

  it('buildVenueTable fail-loud:ar om en match saknar arena-rad', () => {
    // Ta bort g-A-1:s rad ur källan: byggsteget ska KASTA (hellre stopp än en match
    // utan arena som tyst faller till platshållaren), inte tyst ge 103 arenor.
    const withoutFirst = venueSource
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith('g-A-1 |'))
      .join('\n');
    expect(() => buildVenueTable(parseVenues(withoutFirst), MATCH_IDS)).toThrow(/g-A-1/);
  });

  it('buildVenueTable fail-loud:ar på en dubblerad match-rad', () => {
    const rows = parseVenues(venueSource);
    const duplicated = [...rows, rows[0]]; // samma match-id två gånger
    expect(() => buildVenueTable(duplicated, MATCH_IDS)).toThrow(/[Dd]ubbler/);
  });

  it('buildVenueTable fail-loud:ar på ett okänt match-id (arena-rad utan match)', () => {
    // En arena-rad vars id saknas i matchplanen (här g-A-7, som inte finns, en grupp
    // har bara 6 matcher) ska BRYTA bygget, inte tyst joinas bort. Posten konstrueras
    // direkt (förbi parsern) eftersom buildVenueTable är grinden som vaktar join:en.
    const orphan = [{ matchId: 'g-A-7', venue: 'BMO Field, Toronto, Kanada' }];
    expect(() => buildVenueTable(orphan, MATCH_IDS)).toThrow(/okänt match-id/);
  });
});
