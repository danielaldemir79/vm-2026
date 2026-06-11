// Tester för poängsättningen (T15, #15). UTTÖMMANDE: alla 1X2-kombinationer,
// exakt/utfall/miss, och edge-fall (höga siffror, 0-0). Poängregeln är en domän-
// regel (SPEC §4/§12 + decisions.md T15-beslutet), så den vaktas hårt.

import { describe, expect, it } from 'vitest';
import {
  outcomeOf,
  scorePrediction,
  PREDICTION_POINTS,
  type Outcome,
  type Scoreline,
} from './score';

describe('outcomeOf (1X2 ur en målställning)', () => {
  it('hemmavinst när hemma > borta', () => {
    expect(outcomeOf({ homeGoals: 2, awayGoals: 1 })).toBe<Outcome>('home');
  });
  it('bortavinst när borta > hemma', () => {
    expect(outcomeOf({ homeGoals: 0, awayGoals: 3 })).toBe<Outcome>('away');
  });
  it('oavgjort när lika', () => {
    expect(outcomeOf({ homeGoals: 1, awayGoals: 1 })).toBe<Outcome>('draw');
    expect(outcomeOf({ homeGoals: 0, awayGoals: 0 })).toBe<Outcome>('draw');
  });
});

describe('scorePrediction (poängregeln: exakt=3, rätt utfall=1, miss=0)', () => {
  it('konstanterna är de dokumenterade (3/1/0)', () => {
    // Låser poängvärdena: en ändring här ska vara ett MEDVETET val (decisions.md).
    expect(PREDICTION_POINTS).toEqual({ exact: 3, outcome: 1, miss: 0 });
  });

  it('EXAKT resultat ger 3 poäng (rätt antal mål för båda lagen)', () => {
    expect(scorePrediction({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 2, awayGoals: 1 })).toBe(3);
    expect(scorePrediction({ homeGoals: 0, awayGoals: 0 }, { homeGoals: 0, awayGoals: 0 })).toBe(3);
    expect(scorePrediction({ homeGoals: 3, awayGoals: 3 }, { homeGoals: 3, awayGoals: 3 })).toBe(3);
  });

  it('RÄTT UTFALL men fel siffror ger 1 poäng (hemmavinst)', () => {
    // Tippade 2-1 (hemmavinst), blev 3-0 (hemmavinst): rätt utfall, ej exakt.
    expect(scorePrediction({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 3, awayGoals: 0 })).toBe(1);
  });

  it('RÄTT UTFALL men fel siffror ger 1 poäng (bortavinst)', () => {
    expect(scorePrediction({ homeGoals: 0, awayGoals: 1 }, { homeGoals: 1, awayGoals: 4 })).toBe(1);
  });

  it('RÄTT UTFALL men fel siffror ger 1 poäng (oavgjort, ej exakt)', () => {
    // Båda oavgjort men olika siffror (1-1 vs 2-2): rätt utfall, ej exakt -> 1.
    expect(scorePrediction({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 2, awayGoals: 2 })).toBe(1);
  });

  it('FEL utfall ger 0 poäng (gissade hemmavinst, blev bortavinst)', () => {
    expect(scorePrediction({ homeGoals: 2, awayGoals: 0 }, { homeGoals: 0, awayGoals: 2 })).toBe(0);
  });

  it('FEL utfall ger 0 poäng (gissade oavgjort, blev hemmavinst)', () => {
    expect(scorePrediction({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 2, awayGoals: 1 })).toBe(0);
  });

  it('FEL utfall ger 0 poäng (gissade vinst, blev oavgjort)', () => {
    expect(scorePrediction({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 1, awayGoals: 1 })).toBe(0);
  });

  // EDGE: exakt belönas med 3, INTE 3+1. Bevisar att exakt inte dubbelräknas.
  it('exakt resultat ger 3 (inte 4): exakt INKLUDERAR rätt utfall men adderas inte', () => {
    const score = scorePrediction({ homeGoals: 1, awayGoals: 0 }, { homeGoals: 1, awayGoals: 0 });
    expect(score).toBe(PREDICTION_POINTS.exact);
    expect(score).not.toBe(PREDICTION_POINTS.exact + PREDICTION_POINTS.outcome);
  });

  // EDGE: höga, ovanliga siffror (inga magiska gränser).
  it('hanterar höga målsiffror', () => {
    expect(scorePrediction({ homeGoals: 7, awayGoals: 0 }, { homeGoals: 7, awayGoals: 0 })).toBe(3);
    expect(scorePrediction({ homeGoals: 5, awayGoals: 2 }, { homeGoals: 9, awayGoals: 1 })).toBe(1);
  });

  // UTTÖMMANDE 1X2-matris: för varje (tippat utfall, faktiskt utfall)-par,
  // bevisa att rätt utfall ger >= 1 och fel utfall ger 0, via representativa
  // icke-exakta siffror, så ingen gren av utfalls-logiken är otestad.
  it('uttömmande 1X2-matris: rätt utfall (ej exakt) = 1, fel utfall = 0', () => {
    const repr: Record<Outcome, Scoreline> = {
      home: { homeGoals: 3, awayGoals: 1 },
      draw: { homeGoals: 2, awayGoals: 2 },
      away: { homeGoals: 1, awayGoals: 3 },
    };
    // Icke-exakta varianter med SAMMA utfall (så vi testar utfall, inte exakt).
    const reprAlt: Record<Outcome, Scoreline> = {
      home: { homeGoals: 4, awayGoals: 0 },
      draw: { homeGoals: 0, awayGoals: 0 },
      away: { homeGoals: 0, awayGoals: 4 },
    };
    const outcomes: Outcome[] = ['home', 'draw', 'away'];
    for (const tip of outcomes) {
      for (const real of outcomes) {
        const score = scorePrediction(repr[tip], reprAlt[real]);
        if (tip === real) {
          // Samma utfall, olika siffror -> exakt 1 poäng.
          expect(score, `tip=${tip} real=${real}`).toBe(1);
        } else {
          expect(score, `tip=${tip} real=${real}`).toBe(0);
        }
      }
    }
  });
});
