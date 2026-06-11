// REN härledning av "Så funkar poängen"-raderna ur poäng-KONSTANTERNA (T34, #62).
//
// VARFÖR denna fil finns (HARD-krav, #62): förklarings-UI:t får ALDRIG hårdkoda
// poäng-siffror som en andra kopia vid sidan av score.ts/bonus-score.ts. Gör det
// någon det, kan en framtida skala-justering ändra konstanten men lämna UI:t
// kvar med en gammal siffra, ett ljugande UI. Genom att HÄRLEDA raderna ur
// konstanterna här (EN sanning) följer texten alltid talen: ändrar man en
// konstant ändras raden, och mutations-vakt-testet (score-explainer-items.test.ts)
// failar om en rad slutar matcha sin konstant. UI:t (ScoreGuide) renderar bara
// dessa rader, det innehåller inga egna siffror.
//
// Poäng-skalan är LÅST och live (Daniels beslut T49, #84); denna task ändrar
// INGA tal, den läser dem bara. Källa till varje tal står i kommentaren vid raden.

import {
  PREDICTION_POINTS,
  GROUP_PREDICTION_POINTS,
  BRACKET_ROUND_POINTS,
  CHAMPION_PREDICTION_POINTS,
} from '../../data/predictions';

/**
 * Poäng-värdet en regel-rad ger, antingen ett FAST tal (t.ex. 3p exakt) eller ett
 * INTERVALL (slutspelsträdet ger 1-5p stigande). Vi bär det strukturerat (inte en
 * färdig sträng) så UI:t kan formatera "p"-suffixet konsekvent OCH så testet kan
 * jämföra mot konstanterna utan att parsa text.
 */
export type ScorePoints =
  | { kind: 'fixed'; value: number }
  | { kind: 'range'; min: number; max: number };

/** En rad i förklaringen: poäng + vad som ger den (enkelt språk). */
export interface ScoreExplainerItem {
  /** Stabil nyckel för React-listan + test-/data-hakar. */
  id: string;
  /** Poängen raden beskriver (härledd ur konstanten, aldrig hårdkodad). */
  points: ScorePoints;
  /** Kort, inbjudande beskrivning i klartext (svenska). */
  label: string;
}

/** En grupp av rader under en gemensam rubrik (matchtips, grupptips, slutspel, mästaren). */
export interface ScoreExplainerSection {
  /** Stabil nyckel + data-hake. */
  id: string;
  /** Sektionsrubrik (enkelt språk). */
  heading: string;
  /** Raderna i sektionen. */
  items: ScoreExplainerItem[];
}

/** Lägsta värdet i en uppsättning poäng (för slutspelets stigande 1-5p-intervall). */
function minOf(values: readonly number[]): number {
  return values.reduce((lo, v) => (v < lo ? v : lo), values[0]);
}

/** Högsta värdet i en uppsättning poäng (för slutspelets stigande 1-5p-intervall). */
function maxOf(values: readonly number[]): number {
  return values.reduce((hi, v) => (v > hi ? v : hi), values[0]);
}

/**
 * Bygg hela förklaringen ur konstanterna. EN sanning för "Så funkar poängen":
 * varje tal hämtas ur sin konstant (score.ts / bonus-score.ts), aldrig skrivet
 * som en litteral här. Ordningen följer hur en tippare möter poängen: matcherna
 * först (det man gör mest), sen special-tipsen (grupp, slutspel), mästaren sist
 * (den tyngsta enskilda gissningen).
 *
 * Varje rad bär en kommentar om VAR talet kommer ifrån, så nästa läsare (människa
 * eller AI) ser att inget är gissat och kan bekräfta mot konstanten.
 */
export function buildScoreExplainer(): ScoreExplainerSection[] {
  // Slutspelets poäng STIGER per runda (sextondel 1p ... final 5p). Vi visar det
  // som ett intervall, härlett ur BRACKET_ROUND_POINTS faktiska min/max, så raden
  // följer konstanten om en rundas vikt ändras (i stället för en hårdkodad "1-5").
  const bracketValues = Object.values(BRACKET_ROUND_POINTS);

  return [
    {
      id: 'match',
      heading: 'Matcherna',
      items: [
        {
          id: 'match-exact',
          // Källa: PREDICTION_POINTS.exact (score.ts) = exakt rätt resultat.
          points: { kind: 'fixed', value: PREDICTION_POINTS.exact },
          label: 'Exakt rätt resultat, rätt antal mål för båda lagen.',
        },
        {
          id: 'match-outcome',
          // Källa: PREDICTION_POINTS.outcome (score.ts) = rätt vinnare, fel siffror.
          points: { kind: 'fixed', value: PREDICTION_POINTS.outcome },
          label: 'Rätt vinnare (eller oavgjort), men fel slutsiffror.',
        },
      ],
    },
    {
      id: 'group',
      heading: 'Grupperna',
      items: [
        {
          id: 'group-winner',
          // Källa: GROUP_PREDICTION_POINTS.winner (bonus-score.ts) = rätt gruppetta.
          points: { kind: 'fixed', value: GROUP_PREDICTION_POINTS.winner },
          label: 'Rätt gruppvinnare (laget som slutar etta i gruppen).',
        },
        {
          id: 'group-runner-up',
          // Källa: GROUP_PREDICTION_POINTS.runnerUp (bonus-score.ts) = rätt grupptvåa.
          points: { kind: 'fixed', value: GROUP_PREDICTION_POINTS.runnerUp },
          label: 'Rätt grupptvåa (laget som slutar tvåa i gruppen).',
        },
      ],
    },
    {
      id: 'bracket',
      heading: 'Slutspelet',
      items: [
        {
          id: 'bracket-advance',
          // Källa: BRACKET_ROUND_POINTS (bonus-score.ts), stigande per runda.
          // Min = sextondelsfinal, max = final, härlett ur konstantens värden.
          points: { kind: 'range', min: minOf(bracketValues), max: maxOf(bracketValues) },
          label: 'Rätt lag vidare i slutspelsträdet. Ju längre fram, desto mer ger det.',
        },
      ],
    },
    {
      id: 'champion',
      heading: 'VM-vinnaren',
      items: [
        {
          id: 'champion-pick',
          // Källa: CHAMPION_PREDICTION_POINTS (bonus-score.ts) = mästar-tipset.
          points: { kind: 'fixed', value: CHAMPION_PREDICTION_POINTS },
          label: 'Rätt VM-vinnare, turneringens tyngsta gissning, så den ger mest.',
        },
      ],
    },
  ];
}

/**
 * Formatera ett poäng-värde till visningstext ("3 p" / "1-5 p"). EN sanning för hur
 * poäng visas i förklaringen, så fast tal och intervall får samma "p"-suffix och
 * UI:t inte upprepar formateringen. Bindestreck (inte tankstreck) för intervall,
 * per projektets svenska copy-regel (inga em-dashes).
 */
export function formatScorePoints(points: ScorePoints): string {
  if (points.kind === 'range') {
    return `${points.min}-${points.max} p`;
  }
  return `${points.value} p`;
}
