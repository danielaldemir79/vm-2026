import { describe, expect, it } from 'vitest';
import {
  buildScoreExplainer,
  formatScorePoints,
  type ScoreExplainerItem,
} from './score-explainer-items';
import {
  PREDICTION_POINTS,
  GROUP_PREDICTION_POINTS,
  BRACKET_ROUND_POINTS,
  CHAMPION_PREDICTION_POINTS,
} from '../../data/predictions';

// MUTATIONS-VAKT (HARD-krav, #62): förklaringen får ALDRIG bära en hårdkodad
// siffer-dubblett av poäng-konstanterna. Dessa tester binder varje rad till SIN
// konstant (inte till en litteral siffra), så om en konstant ändras MÅSTE den
// härledda raden följa med, annars rödnar testet. En hårdkodad siffra i
// score-explainer-items.ts (i stället för en härledning ur konstanten) skulle
// drifta från konstanten och fångas här. Det är skillnaden mot ett test som bara
// kollar "står det 3p?": vi jämför mot KONSTANTEN, inte mot en förväntad siffra.

/** Plocka en rad ur den platta listan på dess stabila id (fail-loud om den saknas). */
function itemById(id: string): ScoreExplainerItem {
  const item = buildScoreExplainer()
    .flatMap((section) => section.items)
    .find((i) => i.id === id);
  if (item === undefined) {
    throw new Error(`Förklarings-raden "${id}" saknas, testet kan inte vakta den.`);
  }
  return item;
}

describe('buildScoreExplainer, poäng HÄRLEDS ur konstanterna (inga hårdkodade dubbletter)', () => {
  it('matchtips: exakt-raden bär PREDICTION_POINTS.exact', () => {
    expect(itemById('match-exact').points).toEqual({
      kind: 'fixed',
      value: PREDICTION_POINTS.exact,
    });
  });

  it('matchtips: rätt-vinnare-raden bär PREDICTION_POINTS.outcome', () => {
    expect(itemById('match-outcome').points).toEqual({
      kind: 'fixed',
      value: PREDICTION_POINTS.outcome,
    });
  });

  it('grupptips: vinnar-raden bär GROUP_PREDICTION_POINTS.winner', () => {
    expect(itemById('group-winner').points).toEqual({
      kind: 'fixed',
      value: GROUP_PREDICTION_POINTS.winner,
    });
  });

  it('grupptips: tvåa-raden bär GROUP_PREDICTION_POINTS.runnerUp', () => {
    expect(itemById('group-runner-up').points).toEqual({
      kind: 'fixed',
      value: GROUP_PREDICTION_POINTS.runnerUp,
    });
  });

  it('slutspelet: intervallet bär BRACKET_ROUND_POINTS faktiska min OCH max (stigande skala)', () => {
    const values = Object.values(BRACKET_ROUND_POINTS);
    const expectedMin = Math.min(...values);
    const expectedMax = Math.max(...values);
    expect(itemById('bracket-advance').points).toEqual({
      kind: 'range',
      min: expectedMin,
      max: expectedMax,
    });
    // Sanity mot den låsta skalan (sextondel 1p ... final 5p): intervallet får inte
    // kollapsa till en punkt, då vore "stigande" en lögn.
    expect(expectedMin).toBeLessThan(expectedMax);
  });

  it('VM-vinnaren: raden bär CHAMPION_PREDICTION_POINTS', () => {
    expect(itemById('champion-pick').points).toEqual({
      kind: 'fixed',
      value: CHAMPION_PREDICTION_POINTS,
    });
  });

  it('varje rad har en icke-tom, läsbar etikett (enkelt språk, ingen tom rad)', () => {
    for (const item of buildScoreExplainer().flatMap((s) => s.items)) {
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('sektionerna täcker alla fyra tips-källor i en stabil ordning (match, grupp, slutspel, mästare)', () => {
    expect(buildScoreExplainer().map((s) => s.id)).toEqual([
      'match',
      'group',
      'bracket',
      'champion',
    ]);
  });
});

describe('formatScorePoints, EN sanning för poäng-visningen', () => {
  it('fast tal blir "<n> p"', () => {
    expect(formatScorePoints({ kind: 'fixed', value: PREDICTION_POINTS.exact })).toBe(
      `${PREDICTION_POINTS.exact} p`
    );
  });

  it('intervall blir "<min>-<max> p" med bindestreck (inte em-dash)', () => {
    const text = formatScorePoints({ kind: 'range', min: 1, max: 5 });
    expect(text).toBe('1-5 p');
    // Copy-regel: inga em-/en-dashes i svensk copy.
    expect(text).not.toMatch(/[—–]/);
  });
});
