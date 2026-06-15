// Tester för reaktions-generatorn (T82 del 2, #173).
//
// Bevisar: determinism, kohort-scopning (new-room reagerar på SPELADE matcher, vm2026/fsu
// bara på KOMMANDE), att emojin ALLTID ligger i den tillåtna 8-listan (skarven mot DB:ns
// CHECK , en otillåten emoji skulle nekas live), kadens-spridning (inte alla på allt),
// och edge/fel-vägar (0 benägenhet -> inga reaktioner, tom matchlista).

import { describe, expect, it } from 'vitest';
import { generateBotReactions } from './react';
import { isReactionEmoji } from '../rooms/reactions-api';
import type { BotPersona } from './personas';
import { generatePersonas } from './personas';
import { derivePoolFacit, type PoolFacit } from '../../features/leaderboard/derive-facit';
import { WC2026_GROUPS, WC2026_TEAM_BASES } from '../wc2026/team-refs';
import { WC2026_MATCHES } from '../wc2026/matches';
import type { Team, Match } from '../../domain/types';

/* ------------------------------------------------------------------ *
 * Fixtures ur PRODUKTIONS-data (källans schema, inte konsument-formen).
 * ------------------------------------------------------------------ */

const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

/** Grupp A+B färdigspelade (icke-tomt facit), resten orörda (kommande). */
function matchesWithSomeFinished(): Match[] {
  return WC2026_MATCHES.map((m, idx): Match => {
    const isEarlyGroup = m.stage === 'group' && (m.groupId === 'A' || m.groupId === 'B');
    if (!isEarlyGroup) {
      return m;
    }
    return { ...m, status: 'finished', result: { homeGoals: idx % 3, awayGoals: (idx + 1) % 2 } };
  });
}

const FINISHED_MATCHES = matchesWithSomeFinished();
const FACIT: PoolFacit = derivePoolFacit(TEAMS, WC2026_GROUPS, FINISHED_MATCHES);
const PLAYED_IDS = new Set(FACIT.matches.map((f) => f.matchId));

function persona(overrides: Partial<BotPersona> = {}): BotPersona {
  return {
    index: 1,
    displayName: 'Testbot',
    skillTier: 0.5,
    personality: {
      label: 'peppig-pratig',
      commentChance: 0.1,
      reactionChance: 0.5,
      tone: 'peppig',
    },
    cohort: 'new-room',
    roomIndex: 0,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Determinism.
 * ------------------------------------------------------------------ */

describe('determinism', () => {
  it('samma persona + facit ger EXAKT samma reaktioner', () => {
    const a = generateBotReactions(persona(), FINISHED_MATCHES, FACIT);
    const b = generateBotReactions(persona(), FINISHED_MATCHES, FACIT);
    expect(a).toEqual(b);
  });

  it('olika persona-index ger (sannolikt) olika reaktioner , botar är oberoende', () => {
    const a = generateBotReactions(persona({ index: 1 }), FINISHED_MATCHES, FACIT);
    const b = generateBotReactions(persona({ index: 2 }), FINISHED_MATCHES, FACIT);
    expect(a).not.toEqual(b);
  });
});

/* ------------------------------------------------------------------ *
 * Skarven mot DB:ns emoji-CHECK: alltid en av de 8.
 * ------------------------------------------------------------------ */

describe('emoji ligger ALLTID i den tillåtna 8-listan (skarv mot DB-CHECK)', () => {
  it('varje genererad emoji (alla personas, spelat OCH kommande) är en REACTION_EMOJI', () => {
    const personas = generatePersonas();
    let total = 0;
    for (const p of personas) {
      for (const r of generateBotReactions(p, FINISHED_MATCHES, FACIT)) {
        // isReactionEmoji är klientens/DB:ns sanning. En emoji utanför listan skulle nekas
        // av room_reactions_emoji_allowed live , detta fångar det redan i genereringen.
        expect(isReactionEmoji(r.emoji)).toBe(true);
        total++;
      }
    }
    expect(total).toBeGreaterThan(0); // botarna reagerar faktiskt på något
  });
});

/* ------------------------------------------------------------------ *
 * Kohort-scopning: new-room på spelat, vm2026/fsu på kommande.
 * ------------------------------------------------------------------ */

describe('kohort-scopning', () => {
  it('new-room reagerar BARA på spelade matcher (i facit)', () => {
    const rs = generateBotReactions(
      persona({ index: 5, cohort: 'new-room' }),
      FINISHED_MATCHES,
      FACIT
    );
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(PLAYED_IDS.has(r.matchId)).toBe(true);
    }
  });

  it('vm2026 reagerar BARA på kommande matcher (ej i facit)', () => {
    const vm = generateBotReactions(
      {
        ...persona({ index: 6, cohort: 'vm2026' }),
        personality: { label: 'p', commentChance: 0, reactionChance: 0.6, tone: 'lugn' },
      },
      FINISHED_MATCHES,
      FACIT
    );
    expect(vm.length).toBeGreaterThan(0);
    for (const r of vm) {
      expect(PLAYED_IDS.has(r.matchId)).toBe(false);
    }
  });

  it('vm2026 på kommande match får "het match"-emojin 🔥 (inget utfall finns)', () => {
    const vm = generateBotReactions(
      {
        ...persona({ index: 9, cohort: 'vm2026' }),
        personality: { label: 'p', commentChance: 0, reactionChance: 0.9, tone: 'peppig' },
      },
      FINISHED_MATCHES,
      FACIT
    );
    expect(vm.length).toBeGreaterThan(0);
    for (const r of vm) {
      expect(r.emoji).toBe('🔥');
    }
  });
});

/* ------------------------------------------------------------------ *
 * Kadens: spridd, inte alla på allt.
 * ------------------------------------------------------------------ */

describe('kadens (diskret, spridd)', () => {
  it('en bot reagerar inte på ALLA spelade matcher (reactionChance < 1)', () => {
    const rs = generateBotReactions(persona({ index: 3 }), FINISHED_MATCHES, FACIT);
    expect(rs.length).toBeLessThan(PLAYED_IDS.size);
  });

  it('en bot reagerar EN gång per match som mest (PK-invarianten: en rad per match)', () => {
    const rs = generateBotReactions(persona({ index: 4 }), FINISHED_MATCHES, FACIT);
    const ids = rs.map((r) => r.matchId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ------------------------------------------------------------------ *
 * Edge / fel-vägar.
 * ------------------------------------------------------------------ */

describe('edge/fel-vägar', () => {
  it('0 reaktions-benägenhet -> inga reaktioner alls', () => {
    const silent: BotPersona = {
      ...persona({ index: 2 }),
      personality: { label: 'lugn-sparsam', commentChance: 0, reactionChance: 0, tone: 'lugn' },
    };
    expect(generateBotReactions(silent, FINISHED_MATCHES, FACIT)).toEqual([]);
  });

  it('tom matchlista -> inga reaktioner (ingen krasch)', () => {
    expect(generateBotReactions(persona(), [], FACIT)).toEqual([]);
  });
});
