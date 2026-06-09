import { describe, expect, it } from 'vitest';
// Den verkliga, committade källan läses som rå text via Vites `?raw`, så testet
// bevisar fail-loud-vakten OCH att den kompletta källan fortsätter parsa grönt.
import sourceText from './annexe-c-source.txt?raw';
import { EXPECTED_ROWS, parseAnnexeC } from './annexe-c-parser';

// ============================================================================
// FAIL-LOUD på duplicerat rad-id (C9, dataintegritet/robusthet).
//
// parseAnnexeC är en del av källånkrings-trust-kedjan (FIFA PDF -> committat
// utdrag -> generator -> tabell). En tyst `rows[idx] = ...`-överskrivning vid
// ett duplicerat rad-id skulle behålla bara den senare raden och få felet att
// rapporteras INDIREKT (validate() ser en "saknad rad"/"fel antal") i stället
// för att peka på den VERKLIGA orsaken. Vakten kastar i stället vid källan,
// konsekvent med setOnce-hårdningen på winnerGoesTo och TABLE_INDEX.
// ============================================================================

describe('parseAnnexeC: fail-loud på duplicerat rad-id (C9)', () => {
  it('parsar den kompletta, unika källan grönt (alla 495 rader)', () => {
    const rows = parseAnnexeC(sourceText);
    expect(Object.keys(rows)).toHaveLength(EXPECTED_ROWS);
    // Stickprov: rad-id:n är 1-baserade och raderna har 8 grupper var.
    expect(rows[1]).toHaveLength(8);
    expect(rows[EXPECTED_ROWS]).toHaveLength(8);
  });

  it('KASTAR om samma rad-id förekommer två gånger (duplicerad källextraktion)', () => {
    // Duplicera EN datarad i den verkliga källan: samma rad-id, samma giltiga
    // form. En tyst överskrivning hade accepterat detta; vakten ska kasta och
    // peka ut det duplicerade rad-id:t.
    const lines = sourceText.split(/\r?\n/);
    const dataLineIndex = lines.findIndex((l) => /^(\d{1,3})\s+((?:3[A-L]\s*){8})/.test(l.trim()));
    expect(dataLineIndex, 'hittade ingen datarad att duplicera').toBeGreaterThanOrEqual(0);

    const dupLine = lines[dataLineIndex];
    const dupId = Number(dupLine.trim().match(/^(\d{1,3})/)?.[1]);
    // Lägg en exakt kopia av raden direkt efter originalet.
    lines.splice(dataLineIndex + 1, 0, dupLine);
    const corrupted = lines.join('\n');

    expect(() => parseAnnexeC(corrupted)).toThrow(new RegExp(`Duplicerat rad-id ${dupId}`));
  });

  it('skriver INTE tyst över den första raden (felet syns i stället för att maskeras)', () => {
    // Bevisar att felklassen är just den C9 beskriver: utan vakten hade en
    // duplicerad rad gett ett indirekt fel; med vakten failar parsningen direkt.
    const lines = sourceText.split(/\r?\n/);
    const dataLineIndex = lines.findIndex((l) => /^(\d{1,3})\s+((?:3[A-L]\s*){8})/.test(l.trim()));
    lines.splice(dataLineIndex + 1, 0, lines[dataLineIndex]);
    expect(() => parseAnnexeC(lines.join('\n'))).toThrow(/förekommer mer än en gång/);
  });

  it('kastar (oförändrat) om tabellhuvudet saknas (fel fil / trasig extraktion)', () => {
    expect(() => parseAnnexeC('en text helt utan Annexe C-tabellhuvud')).toThrow(
      /Hittade inte Annexe C-tabellhuvudet/
    );
  });
});
