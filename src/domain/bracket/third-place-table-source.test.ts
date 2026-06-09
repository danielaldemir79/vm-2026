import { describe, expect, it } from 'vitest';
// Källfilerna läses som rå text via Vites `?raw` (typad av vite/client), så
// testet behöver inga Node-beroenden och typkollas av app-bygget.
import sourceText from './annexe-c-source.txt?raw';
import committedTable from './third-place-table.ts?raw';
// Återanvänd EXAKT generatorns parsnings-/emit-logik (ingen duplicerad parser):
// testet bevisar att DEN HÄR koden, körd på den committade källan, ger den
// committade tabellen. Se src/domain/bracket/annexe-c-parser.ts.
import { buildTableFile, parseAnnexeC, validate } from './annexe-c-parser';
import { COLUMN_MATCH_IDS } from './seed-third-places';
import { ROUND_OF_32 } from './bracket-structure';

// ============================================================================
// KÄLLÅNKRING av Annexe C-tabellen (F1, dataintegritet, SPEC §5).
//
// Det "uttömmande" 495-testet (seed-third-places.test.ts) vaktar bara
// STRUKTURELLA invarianter (behörighet + kollisionsfrihet). Men varje av de 495
// kombinationerna har MÅNGA behörighets-giltiga, kollisionsfria tilldelningar,
// medan FIFA fastställer EXAKT EN. Alltså passerar ett värde-fel mitt i tabellen
// (regex som glider en kolumn, PDF-feltolkning, hand-edit) som råkar landa på en
// ANNAN behörig kolumn det testet TYST.
//
// Detta test låser i stället tabellen till KÄLLAN: det regenererar tabellen ur
// det committade Annexe C-utdraget (annexe-c-source.txt) och kräver VÄRDE-likhet
// med third-place-table.ts. Trust-kedjan blir: FIFA PDF -> committat utdrag
// (spot-checkbart mot PDF) -> generator -> tabell (bevisat lika här). Mutations-
// testet längst ned bevisar att låset faktiskt fångar ett bytt värde.
// ============================================================================

/**
 * Radslut-normalisering före jämförelse. Den committade .ts:en är CRLF på
 * Windows (git autocrlf) medan generatorn emittar LF; en RÅ byte-jämförelse
 * skulle annars faila på enbart radslut, inte på innehåll (känd fallgrop:
 * idempotent-synk-verifierad-med-radslut-känslig-hash). Vi jämför INNEHÅLL.
 */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('Annexe C-tabellen: låst mot FIFA-källan (regenerera och diffa)', () => {
  it('källutdraget är giltigt (495 unika, välformade rader)', () => {
    const errors = validate(parseAnnexeC(sourceText));
    expect(errors).toEqual([]);
  });

  it('regenererad tabell ur källutdraget är värde-identisk med third-place-table.ts', () => {
    // F1 + F2: detta är låset. Skiljer en enda rad sig (värde-fel, tappad rad,
    // hand-edit i .ts:en, eller drift mellan generator och committad tabell)
    // failar testet. Strängjämförelse ger en exakt diff vid fel (fail loud).
    const regenerated = buildTableFile(sourceText);
    expect(normalizeEol(regenerated)).toBe(normalizeEol(committedTable));
  });
});

// ----------------------------------------------------------------------------
// Behörighet per kolumn, härledd ur strukturen (samma sanning som motorn).
// THIRD_PLACE_COLUMN_WINNERS-ordningen speglas av COLUMN_MATCH_IDS, så kolumn i
// hör till matchen COLUMN_MATCH_IDS[i] med dess behöriga grupper.
// ----------------------------------------------------------------------------
const ELIGIBLE_BY_COLUMN: readonly (readonly string[])[] = COLUMN_MATCH_IDS.map((matchId) => {
  const match = ROUND_OF_32.find((m) => m.id === matchId);
  if (!match || match.away.kind !== 'best-third') {
    throw new Error(`Testuppsättning: ${matchId} är ingen bästa-trea-match.`);
  }
  return match.away.eligibleGroups;
});

/**
 * Hitta två kolumner i raden vars VÄRDEN kan bytas och BÅDA förblir behöriga i
 * sin nya kolumn. Ett sådant byte ger en STRUKTURELLT giltig (behörig +
 * kollisionsfri, samma 8 grupper) men FELAKTIG tilldelning, exakt den fel-klass
 * det strukturella 495-testet inte fångar. Returnerar [i, j] eller null.
 */
function findEligiblePreservingSwap(row: readonly string[]): [number, number] | null {
  for (let i = 0; i < row.length; i++) {
    for (let j = i + 1; j < row.length; j++) {
      const iEligibleInJ = ELIGIBLE_BY_COLUMN[j].includes(row[i]);
      const jEligibleInI = ELIGIBLE_BY_COLUMN[i].includes(row[j]);
      if (row[i] !== row[j] && iEligibleInJ && jEligibleInI) {
        return [i, j];
      }
    }
  }
  return null;
}

describe('Annexe C-tabellen: MUTATIONSTEST (beviset att låset fångar ett bytt värde)', () => {
  // Acceptanskriterium (reviewern): byt två behöriga treor på en mittrad och
  // bevisa att källånkringen FAILAR. Det strukturella 495-testet gör det INTE,
  // just det gapet stänger detta lås.
  const MUTATED_ROW = 250; // 1-baserat, mitt i tabellen.

  it('hittar ett behörighets-bevarande byte på mittraden (annars är testet meningslöst)', () => {
    const rows = parseAnnexeC(sourceText);
    const swap = findEligiblePreservingSwap(rows[MUTATED_ROW]);
    expect(swap, `rad ${MUTATED_ROW} saknar ett behörighets-bevarande byte`).not.toBeNull();
  });

  it('det strukturella validate() ACCEPTERAR den muterade källan (visar gapet)', () => {
    // Poängen: ett bytt-men-behörigt värde passerar generatorns strukturella
    // validering. Strukturkollen ensam skulle alltså INTE fånga felet.
    const mutated = mutateSourceRow();
    const errors = validate(parseAnnexeC(mutated));
    expect(errors).toEqual([]);
  });

  it('regenerera-och-diffa FAILAR mot den muterade källan (låset fångar felet)', () => {
    // Beviset: med den muterade källan skiljer den regenererade tabellen sig
    // från den committade, så källånkrings-testet ovan hade slagit larm.
    const mutated = mutateSourceRow();
    const regenerated = buildTableFile(mutated);
    expect(normalizeEol(regenerated)).not.toBe(normalizeEol(committedTable));
  });

  /**
   * Bygg en kopia av källtexten där mittradens två behöriga värden är bytta.
   * Muterar enbart den raden i rå-texten (samma rad-id), så resten av källan är
   * orörd och bara ett värde-byte skiljer.
   */
  function mutateSourceRow(): string {
    const rows = parseAnnexeC(sourceText);
    const swap = findEligiblePreservingSwap(rows[MUTATED_ROW]);
    if (!swap) {
      throw new Error(`rad ${MUTATED_ROW} saknar ett behörighets-bevarande byte.`);
    }
    const [i, j] = swap;
    const mutatedGroups = [...rows[MUTATED_ROW]];
    [mutatedGroups[i], mutatedGroups[j]] = [mutatedGroups[j], mutatedGroups[i]];

    // Hitta källans datarad för MUTATED_ROW och ersätt dess 8 koder, behåll id:t.
    const lines = sourceText.split(/\r?\n/);
    const rowLineIndex = lines.findIndex((l) => {
      const m = l.trim().match(/^(\d{1,3})\s+((?:3[A-L]\s*){8})/);
      return m !== null && Number(m[1]) === MUTATED_ROW;
    });
    if (rowLineIndex === -1) {
      throw new Error(`Hittade inte källraden för rad ${MUTATED_ROW}.`);
    }
    const codes = mutatedGroups.map((g) => `3${g}`).join('  ');
    lines[rowLineIndex] = `${MUTATED_ROW}   ${codes}`;
    return lines.join('\n');
  }
});
