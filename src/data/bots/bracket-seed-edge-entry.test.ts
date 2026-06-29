// SEAM-TEST (bevisa skarven, inte happy-path): officiella resultat -> matchplan ->
// grupptabeller -> slutspelsträd -> seedbara slots -> seed-plan. Kör den FAKTISKA
// härledningskedjan edge-funktionen kör (planBotBracketSeedingFromDb) mot den RIKTIGA
// källåkrade WC2026-planen, och bevisar PARITET med appens egen "tippbar"-logik
// (selectPredictableBracket), så bot-seedarens slot-urval aldrig driver isär från det
// riktiga spelare ser i bracket-tips-vyn.

import { describe, it, expect } from 'vitest';
import type { RoomMatchResult } from '../rooms/rooms-api';
import { deriveGroupTables } from '../../features/groups/derive-group-tables';
import { deriveBracket } from '../../features/bracket/derive-bracket';
import { applyRoomResults } from '../../features/results/apply-room-results';
import { selectPredictableBracket } from '../../features/bracket-predictions/bracket-predictable-slots';
import { EMBEDDED_BRACKET_PLAN, planBotBracketSeedingFromDb } from './bracket-seed-edge-entry';
import type { BotForSeeding } from './seed-bracket-slots';

/** Avsluta ALLA gruppmatcher (hemmaseger 1-0) så gruppspelet blir komplett (deterministiskt). */
function finishAllGroupMatches(): RoomMatchResult[] {
  return EMBEDDED_BRACKET_PLAN.matches
    .filter((m) => m.stage === 'group')
    .map((m) => ({
      matchId: m.id,
      homeGoals: 1,
      awayGoals: 0,
      penalties: null,
      status: 'finished' as const,
      updatedBy: '00000000-0000-0000-0000-000000000000',
      updatedAt: '2026-06-27T00:00:00.000Z',
    }));
}

/** Appens egen mängd "tippbara, ej låsta" match-slots, för paritetsjämförelse. */
function appPredictableUnlockedSlotIds(official: RoomMatchResult[], now: Date): Set<string> {
  const matches = applyRoomResults([...EMBEDDED_BRACKET_PLAN.matches], official);
  const tables = deriveGroupTables(EMBEDDED_BRACKET_PLAN.groups, matches);
  const bracket = deriveBracket(tables, matches);
  const predictable = selectPredictableBracket(bracket, EMBEDDED_BRACKET_PLAN.teams, matches, now);
  const ids = new Set<string>();
  for (const round of predictable.rounds) {
    for (const slot of round.slots) {
      if (slot.teamsKnown && !slot.locked) {
        ids.add(slot.slotId);
      }
    }
  }
  return ids;
}

const BEFORE_R32 = new Date('2026-06-27T00:00:00.000Z'); // före alla sextondelsfinaler

describe('bracket-seed-edge-entry: inbäddad plan', () => {
  it('bär hela den källåkrade planen (48 lag, 104 matcher)', () => {
    expect(EMBEDDED_BRACKET_PLAN.teams.length).toBe(48);
    expect(EMBEDDED_BRACKET_PLAN.matches.length).toBe(104);
    expect(EMBEDDED_BRACKET_PLAN.groups.length).toBe(12);
  });
});

describe('planBotBracketSeedingFromDb: seam officiella resultat -> seedbar plan', () => {
  it('härleder seedbara R32-slots med två RIKTIGA lag när gruppspelet är klart', () => {
    const official = finishAllGroupMatches();
    const plan = planBotBracketSeedingFromDb({
      bots: [],
      existingBracket: [],
      officialResults: official,
      nowIso: BEFORE_R32.toISOString(),
    });
    expect(plan.seedableSlots.length).toBeGreaterThan(0);
    for (const slot of plan.seedableSlots) {
      expect(slot.stage).toBe('round-of-32'); // före R32 kan bara R32 vara resolved
      expect(slot.favorite).not.toBe(slot.underdog);
      expect(slot.favorite).toMatch(/^[A-Z]{3}$/);
      expect(slot.underdog).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('PARITET: seedbara slotIds == appens (teamsKnown && !locked) match-slots', () => {
    const official = finishAllGroupMatches();
    const plan = planBotBracketSeedingFromDb({
      bots: [],
      existingBracket: [],
      officialResults: official,
      nowIso: BEFORE_R32.toISOString(),
    });
    const mine = new Set(plan.seedableSlots.map((s) => s.slotId));
    const app = appPredictableUnlockedSlotIds(official, BEFORE_R32);
    expect([...mine].sort()).toEqual([...app].sort());
  });

  it('låsning följer NU: en senare now utesluter R32-slots vars avspark passerat', () => {
    const official = finishAllGroupMatches();
    const early = planBotBracketSeedingFromDb({
      bots: [],
      existingBracket: [],
      officialResults: official,
      nowIso: '2026-06-27T00:00:00.000Z',
    });
    const late = planBotBracketSeedingFromDb({
      bots: [],
      existingBracket: [],
      officialResults: official,
      nowIso: '2026-07-10T00:00:00.000Z', // efter alla sextondelsfinaler
    });
    expect(early.seedableSlots.length).toBeGreaterThan(late.seedableSlots.length);
  });

  it('planerar bot-tips för seedbara slots och är idempotent på en omkörning', () => {
    const official = finishAllGroupMatches();
    const bots: BotForSeeding[] = [
      { userId: 'bot-1', roomId: 'R1', skillTier: 0.9, seedKey: 'vm2026#1' },
      { userId: 'bot-2', roomId: 'R1', skillTier: 0.1, seedKey: 'vm2026#2' },
    ];
    const first = planBotBracketSeedingFromDb({
      bots,
      existingBracket: [],
      officialResults: official,
      nowIso: BEFORE_R32.toISOString(),
    });
    expect(first.rows.length).toBe(bots.length * first.seedableSlots.length);
    // Varje rad pekar på ett bot-konto (bot-isolering):
    expect(first.rows.every((r) => r.userId === 'bot-1' || r.userId === 'bot-2')).toBe(true);

    // Mata tillbaka som befintliga -> andra körningen tom (idempotens på riktiga skarven).
    const second = planBotBracketSeedingFromDb({
      bots,
      existingBracket: first.rows.map((r) => ({
        roomId: r.roomId,
        slotId: r.slotId,
        userId: r.userId,
        advancingTeamId: r.advancingTeamId,
      })),
      officialResults: official,
      nowIso: BEFORE_R32.toISOString(),
    });
    expect(second.rows).toEqual([]);
  });

  it('inga seedbara slots innan gruppspelet är klart (inga resultat alls)', () => {
    const plan = planBotBracketSeedingFromDb({
      bots: [{ userId: 'bot-1', roomId: 'R1', skillTier: 0.5, seedKey: 'vm2026#1' }],
      existingBracket: [],
      officialResults: [],
      nowIso: BEFORE_R32.toISOString(),
    });
    expect(plan.seedableSlots).toEqual([]);
    expect(plan.rows).toEqual([]);
  });
});
