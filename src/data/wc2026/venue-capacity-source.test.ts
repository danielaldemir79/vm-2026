import { describe, expect, it } from 'vitest';
// Källfilen läses som rå text via Vites `?raw`, så testet kör EXAKT samma parsnings-
// logik som datan byggs med (venue-parser.ts), ingen duplicerad parser.
import venueSource from './venue-source.txt?raw';
import {
  buildVenueCapacityTable,
  parseVenueCapacities,
  parseCapacityRow,
  KNOWN_VENUES,
  EXPECTED_VENUE_COUNT,
} from './venue-parser';
import { WC2026_VENUE_CAPACITIES } from './venue-capacities';
import { WC2026_MATCHES } from './matches';
import { formatCapacity, formatVenueCapacity } from '../../features/daily/match-display';

// ============================================================================
// KÄLLÅNKRING + KORSKOLL av VM 2026:s ÅSKÅDARKAPACITET per arena (T4e #149).
//
// Daniels feedback 2026-06-13: "mer matchinfo på kortet". Varje arena visas med sin
// kapacitet ("80 824 platser"). Kapaciteten är PER ARENA (16 värden), inte per match,
// källåkrad mot FIFA:s OFFICIELLT TILLKÄNNAGIVNA TURNERINGS-kapaciteter (Wikipedia
// "2026 FIFA World Cup", venue-tabellen), korskoll-bekräftad mot Crypto Briefing (samma
// figurer, FIFA:s officiella tal). Se preambeln i venue-source.txt + docs/decisions.md (T4e).
//
// VAL AV FIGUR (gissa aldrig): det cirkulerar två figur-uppsättningar, (1) FIFA:s
// turnerings-kapacitet (vald: Azteca 80 824) och (2) arenornas ordinarie max (Azteca
// 83 000+). Vi pinnar (1) eftersom det är FIFA:s officiella turnerings-tal ur SAMMA gold
// source som arena-listan. Detta test PINNAR de valda figurerna explicit (mot källan) +
// låser parsern/formateringen + bevisar att en bytt siffra fångas (mutationstest).
// ============================================================================

describe('Kapacitet: källan parsas till 16 arenor (en per FIFA-arena)', () => {
  it('kapacitets-källan ger exakt 16 rader (en per arena)', () => {
    expect(parseVenueCapacities(venueSource)).toHaveLength(EXPECTED_VENUE_COUNT);
  });

  it('den byggda tabellen har exakt 16 distinkta arenor', () => {
    expect(WC2026_VENUE_CAPACITIES.size).toBe(EXPECTED_VENUE_COUNT);
  });

  it('VARJE känd arena (KNOWN_VENUES) har en verifierad kapacitet (ingen tyst lucka)', () => {
    for (const venue of KNOWN_VENUES) {
      const capacity = WC2026_VENUE_CAPACITIES.get(venue);
      expect(capacity, venue).toBeDefined();
      expect(capacity, venue).toBeGreaterThan(0);
      expect(Number.isInteger(capacity), venue).toBe(true);
    }
  });

  it('inga kapacitets-arenor utanför de 16 kända (ingen gissad/extra arena)', () => {
    for (const venue of WC2026_VENUE_CAPACITIES.keys()) {
      expect(KNOWN_VENUES.has(venue), venue).toBe(true);
    }
  });
});

describe('Kapacitet: PINNADE figurer mot källan (FIFA:s turnerings-kapaciteter, T4e)', () => {
  // Pinnar de valda FIFA-turnerings-kapaciteterna explicit. Källa: Wikipedia "2026 FIFA
  // World Cup" venue-tabell, korskoll-bekräftad mot Crypto Briefing. En bytt figur i
  // källan (t.ex. arenans ordinarie max i stället för turnerings-talet) fångas av detta
  // test, så valet av figur-uppsättning inte tyst driver. Alla 16 pinnas.
  const EXPECTED: ReadonlyArray<[string, number]> = [
    ['MetLife Stadium, East Rutherford, USA', 80663],
    ['AT&T Stadium, Arlington, USA', 70649],
    ['SoFi Stadium, Inglewood, USA', 70492],
    ['Arrowhead Stadium, Kansas City, USA', 69045],
    ["Levi's Stadium, Santa Clara, USA", 68827],
    ['NRG Stadium, Houston, USA', 68777],
    ['Lincoln Financial Field, Philadelphia, USA', 68324],
    ['Mercedes-Benz Stadium, Atlanta, USA', 68239],
    ['Lumen Field, Seattle, USA', 66925],
    ['Hard Rock Stadium, Miami Gardens, USA', 64478],
    ['Gillette Stadium, Foxborough, USA', 64146],
    ['Estadio Azteca, Mexico City, Mexiko', 80824],
    ['Estadio BBVA, Guadalupe, Mexiko', 51243],
    ['Estadio Akron, Zapopan, Mexiko', 45664],
    ['BC Place, Vancouver, Kanada', 52497],
    ['BMO Field, Toronto, Kanada', 43036],
  ];

  it('pinnar alla 16 (ingen lucka, ingen extra)', () => {
    expect(EXPECTED).toHaveLength(EXPECTED_VENUE_COUNT);
  });

  it.each(EXPECTED)('%s har kapacitet %i (FIFA-turnering, källåkrad)', (venue, capacity) => {
    expect(WC2026_VENUE_CAPACITIES.get(venue)).toBe(capacity);
  });

  it('öppningsmatchens arena (Estadio Azteca) är 80 824 (INTE arenans ordinarie max ~83 000)', () => {
    // Extra korskoll mot just figur-VALET: vi använder FIFA:s turnerings-tal (80 824),
    // inte arenans vanliga max (cirka 83 000/87 523 i andra källor). Detta test fångar
    // om någon byter till "fel" figur-uppsättning. Källa: Wikipedia "2026 FIFA World Cup".
    expect(WC2026_VENUE_CAPACITIES.get('Estadio Azteca, Mexico City, Mexiko')).toBe(80824);
  });
});

describe('Kapacitet: MUTATIONSTEST (beviset att låset fångar en bytt siffra)', () => {
  it('en bytt kapacitets-siffra i källan ger en annan tabell (låset fångar felet)', () => {
    // Byt BARA Estadio Aztecas siffra (80824 -> 79999): en kapacitets-faktafel-klass.
    // Den byggda tabellen ur den muterade källan ska skilja sig från den committade.
    const mutated = venueSource.replace(
      'Estadio Azteca, Mexico City, Mexiko | capacity=80824',
      'Estadio Azteca, Mexico City, Mexiko | capacity=79999'
    );
    expect(mutated).not.toBe(venueSource); // mutationen tog effekt
    const mutatedTable = buildVenueCapacityTable(parseVenueCapacities(mutated));
    expect(mutatedTable.get('Estadio Azteca, Mexico City, Mexiko')).toBe(79999);
    expect(mutatedTable.get('Estadio Azteca, Mexico City, Mexiko')).not.toBe(
      WC2026_VENUE_CAPACITIES.get('Estadio Azteca, Mexico City, Mexiko')
    );
  });
});

describe('Kapacitet: parsern är strikt (fail loud på trasig rad/lucka)', () => {
  it('avvisar en rad utan capacity-fält', () => {
    expect(() => parseCapacityRow('Estadio Azteca, Mexico City, Mexiko')).toThrow(/2 fält/);
  });

  it('avvisar en okänd arena (gissad arena ska inte slinka igenom)', () => {
    expect(() => parseCapacityRow('Camp Nou, Barcelona, Spanien | capacity=99000')).toThrow(
      /[Oo]känd arena/
    );
  });

  it('avvisar en icke-numerisk kapacitet (ingen tyst NaN)', () => {
    expect(() => parseCapacityRow('Estadio Azteca, Mexico City, Mexiko | capacity=åttio')).toThrow(
      /[Oo]giltig kapacitet/
    );
  });

  it('avvisar en kapacitet med tusentals-avgränsare (källan lagrar rent heltal)', () => {
    // "80 824" eller "80,824" är UI-formatering, inte källans form. Källan ska ha 80824.
    expect(() => parseCapacityRow('Estadio Azteca, Mexico City, Mexiko | capacity=80,824')).toThrow(
      /[Oo]giltig kapacitet/
    );
  });

  it('parseVenueCapacities kastar om kapacitets-markören saknas (trasig källa ger inte tyst noll)', () => {
    expect(() => parseVenueCapacities('ingen markör\nbara brus')).toThrow(/start-markören/);
  });

  it('buildVenueCapacityTable fail-loud:ar om en arena saknar kapacitets-rad', () => {
    // Ta bort Estadio Aztecas rad: byggsteget ska KASTA (hellre stopp än en arena utan
    // kapacitet som tyst saknar siffra på kortet), inte tyst ge 15 arenor.
    const withoutAzteca = parseVenueCapacities(venueSource).filter(
      (r) => r.venue !== 'Estadio Azteca, Mexico City, Mexiko'
    );
    expect(() => buildVenueCapacityTable(withoutAzteca)).toThrow(/utan kapacitet/);
  });

  it('buildVenueCapacityTable fail-loud:ar på en dubblerad arena-rad', () => {
    const rows = parseVenueCapacities(venueSource);
    const duplicated = [...rows, rows[0]];
    expect(() => buildVenueCapacityTable(duplicated)).toThrow(/[Dd]ubbler/);
  });
});

describe('Kapacitet: svensk formatering (en sanning, formatCapacity)', () => {
  it('grupperar tusental med ett FAST mellanslag (U+00A0), inte vanligt mellanslag', () => {
    const formatted = formatCapacity(80824);
    expect(formatted).toBe('80 824');
    // Inget VANLIGT mellanslag (U+0020) i talet, så det aldrig radbryts.
    expect(formatted).not.toContain(' ');
    expect(formatted).toContain(' ');
  });

  it('formaterar tre grupper korrekt (miljon-tal)', () => {
    expect(formatCapacity(1000000)).toBe('1 000 000');
  });

  it('formaterar tal under tusen utan avgränsare', () => {
    expect(formatCapacity(999)).toBe('999');
  });

  it('formatVenueCapacity ger "<kapacitet> platser" för en känd arena', () => {
    expect(formatVenueCapacity('Estadio Azteca, Mexico City, Mexiko')).toBe('80 824 platser');
  });

  it('formatVenueCapacity ger null TYST för en okänd arena (gissa aldrig)', () => {
    expect(formatVenueCapacity('Camp Nou, Barcelona, Spanien')).toBeNull();
  });

  it('formatVenueCapacity ger null TYST för arena-platshållaren (#35)', () => {
    expect(formatVenueCapacity('Arena ej verifierad (egen data-punkt)')).toBeNull();
  });
});

describe('Kapacitet: integritet mot den committade matchplanen', () => {
  it('VARJE match i planen har en arena med verifierad kapacitet (ingen tyst miss på riktig data)', () => {
    // Alla 104 matcher har en av de 16 arenorna (venue-source.test.ts), och alla 16 har
    // en kapacitet, så ingen match ska sakna kapacitet. Bevisar att UI:t alltid har en
    // siffra att visa för en riktig match (den tysta null-grenen är bara för okänd arena).
    for (const m of WC2026_MATCHES) {
      expect(formatVenueCapacity(m.venue), `${m.id}: ${m.venue}`).not.toBeNull();
    }
  });
});
