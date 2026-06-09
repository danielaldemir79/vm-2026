// Bygg det fullständiga slutspelsträdet som BracketSlot-noder (T3:s typ), med
// nästa-slot-koppling genom HELA trädet enligt FIFA:s officiella schema.
//
// Trädet är STRUKTURELLT (positioner, inte lagidentiteter): varje slot bär var
// dess lag KOMMER ifrån (gruppvinnare/tvåa/bästa trea, eller vinnare/förlorare
// av en tidigare match), och vart vinnaren går vidare. resolvedTeamId är null
// här, det fylls när gruppspelet är klart och seedningen kört (separat steg).
//
// KÄLLA: bracket-structure.ts (FIFA Regulations Article 12.6-12.11). Denna fil
// härleder bara slot-grafen ur den strukturen, den definierar ingen ny regel.

import type { BracketSlot } from '../types';
import { BRACKET_MATCHES, type BracketMatch } from './bracket-structure';

/**
 * Vilken sida av en match en slot avser. En slutspelsmatch har två slots
 * (hemma/borta), och båda går vidare till SAMMA nästa-slot (matchens vinnare).
 */
export type SlotSide = 'home' | 'away';

/** Slot-id-konvention: matchnummer + sida, t.ex. "M79-home". Stabil och läsbar. */
export function slotId(matchId: string, side: SlotSide): string {
  return `${matchId}-${side}`;
}

/**
 * En slot-nod: T3:s BracketSlot (id, stage, source, resolvedTeamId, nextSlotId)
 * utökad med vilken match och sida den hör till. `source` bär källan direkt
 * (BracketSource täcker både grupp-positioner och match-progression, så ingen
 * platshållare behövs och inget gissas).
 */
export interface BracketNode extends BracketSlot {
  matchId: string;
  side: SlotSide;
}

/**
 * Bygg slot-grafen för hela slutspelet.
 *
 * Varje slutspelsmatch ger två slots (hemma/borta). nextSlotId pekar på den
 * slot dit MATCHENS VINNARE går vidare: vi indexerar, för varje match, vilken
 * slot som tar emot dess vinnare (den slot vars källa är match-winner med detta
 * matchnummer) och pekar BÅDA matchens slots dit. Finalens (M104) slots har
 * nextSlotId = null (ingen match efter). Bronsmatchens (M103) slots matas av
 * semifinal-FÖRLORARNA och har också nextSlotId = null (ingen match efter).
 *
 * @returns slots i officiell match-ordning (hemma före borta per match).
 */
export function buildBracket(): BracketNode[] {
  // Index: vilken slot tar emot vinnaren av en given match?
  const winnerGoesTo = new Map<string, string>();
  for (const match of BRACKET_MATCHES) {
    for (const side of ['home', 'away'] as const) {
      const source = side === 'home' ? match.home : match.away;
      if (source.kind === 'match-winner') {
        winnerGoesTo.set(source.matchId, slotId(match.id, side));
      }
    }
  }

  const nodes: BracketNode[] = [];
  for (const match of BRACKET_MATCHES) {
    nodes.push(makeNode(match, 'home', winnerGoesTo));
    nodes.push(makeNode(match, 'away', winnerGoesTo));
  }
  return nodes;
}

function makeNode(
  match: BracketMatch,
  side: SlotSide,
  winnerGoesTo: ReadonlyMap<string, string>
): BracketNode {
  const source = side === 'home' ? match.home : match.away;
  return {
    id: slotId(match.id, side),
    stage: match.stage,
    source,
    resolvedTeamId: null,
    nextSlotId: winnerGoesTo.get(match.id) ?? null,
    matchId: match.id,
    side,
  };
}
