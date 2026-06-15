// Tester för bot-seedningens FÖRE/EFTER-skydd (T82, #173). Bevisar att skyddet
// VAKTAR: en oförändrad räkning passerar, men VARJE ändring (medlemmar ELLER tips)
// KASTAR. Ett skydd som aldrig kan kasta vaktar inget (negativ-kontroll: dessa
// kastar-fall är just det som bevisar att grinden är ett äkta skyddsräcke).

import { describe, expect, it } from 'vitest';
import { assertRealDataUnchanged, type RealDataCounts } from './seed-protection';

const BASELINE: RealDataCounts = { members: 27, predictions: 770 };

describe('assertRealDataUnchanged (löpande skydd, fail loud vid ändring)', () => {
  it('passerar (kastar inte) när före == efter', () => {
    expect(() => assertRealDataUnchanged(BASELINE, { ...BASELINE })).not.toThrow();
  });

  it('passerar för nollor (tom DB) , skyddet hittar inte på en falsk skillnad', () => {
    const zero: RealDataCounts = { members: 0, predictions: 0 };
    expect(() => assertRealDataUnchanged(zero, { ...zero })).not.toThrow();
  });

  it('KASTAR om antalet riktiga medlemmar ändrats (en bot rörde en riktig medlem)', () => {
    expect(() => assertRealDataUnchanged(BASELINE, { members: 28, predictions: 770 })).toThrow(
      /riktig \(icke-bot\) data ändrades/
    );
  });

  it('KASTAR om antalet riktiga tips ändrats (en bot rörde ett riktigt tips)', () => {
    expect(() => assertRealDataUnchanged(BASELINE, { members: 27, predictions: 769 })).toThrow(
      /riktig \(icke-bot\) data ändrades/
    );
  });

  it('KASTAR även om data MINSKAR (en riktig rad raderades)', () => {
    // Riktningen spelar ingen roll: vilken som helst skillnad är ett brott.
    expect(() => assertRealDataUnchanged(BASELINE, { members: 26, predictions: 770 })).toThrow(
      /medlemmar 27->26/
    );
  });

  it('felmeddelandet visar BÅDA före/efter-värdena (granskbart)', () => {
    expect(() => assertRealDataUnchanged(BASELINE, { members: 27, predictions: 999 })).toThrow(
      /tips 770->999/
    );
  });
});
