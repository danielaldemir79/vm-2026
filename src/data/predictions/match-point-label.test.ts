// Tester för match-tipsens VARFÖR-etikett (T58, #99). FOKUS: utfalls-MEDVETEN text,
// särskilt kryss-fallet (#69-noten), och att etiketten härleds ur pointType + faktiskt
// utfall (aldrig "Rätt vinnare" på ett oavgjort).

import { describe, expect, it } from 'vitest';
import { matchPointLabel } from './match-point-label';
import { outcomeOf, pointTypeOf, type Scoreline } from './score';

/** Bygg etiketten direkt ur tippad + faktisk målställning, samma väg som UI:t. */
function labelFor(predicted: Scoreline, actual: Scoreline): string {
  return matchPointLabel(pointTypeOf(predicted, actual), outcomeOf(actual));
}

describe('matchPointLabel', () => {
  it('exakt resultat -> "Exakt resultat" (oavsett utfall)', () => {
    expect(matchPointLabel('exact', 'home')).toBe('Exakt resultat');
    expect(matchPointLabel('exact', 'draw')).toBe('Exakt resultat');
    expect(matchPointLabel('exact', 'away')).toBe('Exakt resultat');
  });

  it('miss -> "Miss" (oavsett utfall)', () => {
    expect(matchPointLabel('miss', 'home')).toBe('Miss');
    expect(matchPointLabel('miss', 'draw')).toBe('Miss');
    expect(matchPointLabel('miss', 'away')).toBe('Miss');
  });

  // HARD (#69 kryss-noten): rätt utfall PÅ ETT OAVGJORT får ALDRIG heta "Rätt vinnare".
  it('rätt utfall på OAVGJORT -> "Rätt kryss", aldrig "Rätt vinnare"', () => {
    expect(matchPointLabel('outcome', 'draw')).toBe('Rätt kryss');
  });

  it('rätt utfall på en VINST (hemma/borta) -> "Rätt vinnare"', () => {
    expect(matchPointLabel('outcome', 'home')).toBe('Rätt vinnare');
    expect(matchPointLabel('outcome', 'away')).toBe('Rätt vinnare');
  });

  // End-to-end ur de faktiska målställningarna (samma härledning som reveal/tips-vyn),
  // så seamen pointTypeOf + outcomeOf -> etikett bevisas, inte bara handskrivna typer.
  it('härleder kryss-etiketten ur en draw-mot-draw 1-poängare (1-1 mot 2-2)', () => {
    // Tippade 1-1 (draw), facit 2-2 (draw): rätt utfall men ej exakt -> "Rätt kryss".
    expect(labelFor({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 2, awayGoals: 2 })).toBe(
      'Rätt kryss'
    );
  });

  it('härleder "Rätt vinnare" ur en hemmavinst-1-poängare (2-0 mot 1-0)', () => {
    expect(labelFor({ homeGoals: 2, awayGoals: 0 }, { homeGoals: 1, awayGoals: 0 })).toBe(
      'Rätt vinnare'
    );
  });

  it('härleder "Exakt resultat" ur ett exakt kryss-tips (1-1 mot 1-1)', () => {
    // Exakt resultat på ett oavgjort: ordet är "Exakt resultat", inte kryss-varianten.
    expect(labelFor({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 1, awayGoals: 1 })).toBe(
      'Exakt resultat'
    );
  });

  it('härleder "Miss" ur ett fel utfall (hemmavinst tippad, borta vann)', () => {
    expect(labelFor({ homeGoals: 2, awayGoals: 0 }, { homeGoals: 0, awayGoals: 1 })).toBe('Miss');
  });
});
