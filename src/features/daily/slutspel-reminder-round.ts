// VILKEN slutspelsrunda påminner vi om JUST NU + dess innehåll (2026-06-28, Daniels
// önskemål: notisen ska byta innehåll OCH utseende per runda , sextondel -> final).
//
// REN logik (ingen React), skild från komponenten så react-refresh-regeln hålls ren och
// runda-detektionen kan testas fristående.
//
// DETEKTION ÄR DATUM-BASERAD (inte resultat-baserad): den aktuella rundan = rundan för
// NÄSTA kommande slutspelsavspark (kickoff >= now). Så påminnelsen flyttar sig med
// SCHEMAT , den hänger inte på att Daniel hinner mata in resultat. När alla sextondels-
// avspark passerat pekar nästa avspark på åttondelarna -> notisen byter till dem, osv.
// Inga kommande slutspelsmatcher (efter finalen) -> null (inget att påminna om).
//
// Bronsmatchen (third-place) utelämnas MEDVETET ur ordningen (Daniel listade
// sextondel/åttondel/kvart/semi/final). Finalen är ändå sist i kalendern, så efter
// semifinalerna pekar nästa avspark på finalen.

import type { Match, MatchStage } from '../../domain/types';

/** De fem rundorna notisen växlar mellan (bronsmatchen utelämnad, se filhuvudet). */
export type KnockoutRound = Extract<
  MatchStage,
  'round-of-32' | 'round-of-16' | 'quarter-final' | 'semi-final' | 'final'
>;

const KNOCKOUT_ROUNDS = new Set<MatchStage>([
  'round-of-32',
  'round-of-16',
  'quarter-final',
  'semi-final',
  'final',
]);

/**
 * Rundan för NÄSTA kommande slutspelsavspark (kickoff >= now), eller null om ingen
 * slutspelsmatch är kvar att spela. Datum-baserad så notisen följer schemat oberoende
 * av om resultat hunnit matas in.
 */
export function currentKnockoutRound(matches: readonly Match[], now: number): KnockoutRound | null {
  let best: KnockoutRound | null = null;
  let bestKickoff = Infinity;
  for (const m of matches) {
    if (!KNOCKOUT_ROUNDS.has(m.stage)) {
      continue;
    }
    const t = Date.parse(m.kickoff);
    if (Number.isNaN(t) || t < now) {
      continue;
    }
    if (t < bestKickoff) {
      bestKickoff = t;
      best = m.stage as KnockoutRound;
    }
  }
  return best;
}

/** Innehållet notisen visar per runda. */
export interface RoundReminder {
  /** Runda-namnet (visas som bricka + i aria). */
  name: string;
  /** Påminnelse-meningen. */
  line: string;
  /** Knapp-texten (leder till slutspels-tipset). */
  cta: string;
}

/**
 * Per-runda-innehåll. Färgen/utseendet styrs av CSS via data-round (slutspel-
 * reminder.css): guld final, silver semi, brons kvart, egna toner för rundorna innan ,
 * så ögat reagerar på att något ändras vid varje ny runda.
 */
export const ROUND_REMINDER: Record<KnockoutRound, RoundReminder> = {
  'round-of-32': {
    name: 'Sextondelsfinal',
    line: 'Sextondelsfinalerna är här. Tippa vilka lag som tar sig vidare.',
    cta: 'Tippa sextondelarna',
  },
  'round-of-16': {
    name: 'Åttondelsfinal',
    line: 'Dags för åttondelsfinalerna. Tippa vilka åtta som går vidare.',
    cta: 'Tippa åttondelarna',
  },
  'quarter-final': {
    name: 'Kvartsfinal',
    line: 'Kvartsfinalerna väntar. Tippa vilka fyra som når semifinal.',
    cta: 'Tippa kvartsfinalerna',
  },
  'semi-final': {
    name: 'Semifinal',
    line: 'Semifinalerna avgör finalplatserna. Vilka två når finalen?',
    cta: 'Tippa semifinalerna',
  },
  final: {
    name: 'Final',
    line: 'Finalen är här. Vem tar bucklan och blir världsmästare?',
    cta: 'Tippa finalen',
  },
};
