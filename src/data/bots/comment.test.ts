// Tester för den SPARSAMMA kommentars-generatorn + svar-approximationen (T82 del 2, #173).
//
// Bevisar (Definition of Done):
//   * determinism (samma input -> samma kommentarer),
//   * SPARSAMHET (andelen kommenterade matcher är låg) , kvantitativt, inte påstått,
//   * TYSTHETS-DEFAULT (lågbenägen persona i en "tråkig" match ger 0 kommentarer), MED en
//     negativ-kontroll som bevisar att test-fallet kan rödna,
//   * variation (inte identiska mekaniska mallar),
//   * kohort-scopning (vm2026/fsu kommenterar inte spelade matcher , de är tysta),
//   * skarven (mood-beroende pool vald ur RIKTIGT facit),
//   * svar-approximationens korrekthet (svar bara i en tråd med >= 2 distinkta botar),
//   * längd-gränsen (1..500, DB-CHECK) och edge/fel-vägar.

import { describe, expect, it } from 'vitest';
import { generateBotComments, planReplies, COMMENT_SCALE, type PrimaryComment } from './comment';
import { COMMENT_POOLS } from './comment-pools';
import { moodFromScoreline } from './match-mood';
import type { BotPersona } from './personas';
import { generatePersonas } from './personas';
import { derivePoolFacit, type PoolFacit } from '../../features/leaderboard/derive-facit';
import { WC2026_GROUPS, WC2026_TEAM_BASES } from '../wc2026/team-refs';
import { WC2026_MATCHES } from '../wc2026/matches';
import type { Team, Match } from '../../domain/types';

/* ------------------------------------------------------------------ *
 * Fixtures ur PRODUKTIONS-data.
 * ------------------------------------------------------------------ */

const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

/** Grupp A+B färdiga med VARIERADE resultat (så flera mood:ar förekommer). */
function matchesWithSomeFinished(): Match[] {
  return WC2026_MATCHES.map((m, idx): Match => {
    const isEarlyGroup = m.stage === 'group' && (m.groupId === 'A' || m.groupId === 'B');
    if (!isEarlyGroup) {
      return m;
    }
    return { ...m, status: 'finished', result: { homeGoals: idx % 4, awayGoals: (idx + 2) % 3 } };
  });
}

/** ALLA grupp A+B-matcher satta till 0-0 (en "tråkig" turnering för tysthets-testet). */
function matchesAllGoalless(): Match[] {
  return WC2026_MATCHES.map((m): Match => {
    const isEarlyGroup = m.stage === 'group' && (m.groupId === 'A' || m.groupId === 'B');
    if (!isEarlyGroup) {
      return m;
    }
    return { ...m, status: 'finished', result: { homeGoals: 0, awayGoals: 0 } };
  });
}

const FINISHED_MATCHES = matchesWithSomeFinished();
const FACIT: PoolFacit = derivePoolFacit(TEAMS, WC2026_GROUPS, FINISHED_MATCHES);
const PLAYED_COUNT = FACIT.matches.length;

function persona(overrides: Partial<BotPersona> = {}): BotPersona {
  return {
    index: 1,
    displayName: 'Testbot',
    skillTier: 0.5,
    personality: {
      label: 'peppig-pratig',
      commentChance: 0.3,
      reactionChance: 0.4,
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
  it('samma persona + facit ger EXAKT samma kommentarer', () => {
    const a = generateBotComments(persona(), FINISHED_MATCHES, FACIT);
    const b = generateBotComments(persona(), FINISHED_MATCHES, FACIT);
    expect(a).toEqual(b);
  });
});

/* ------------------------------------------------------------------ *
 * SPARSAMHET (kvantitativt bevisad).
 * ------------------------------------------------------------------ */

describe('sparsamhet (kommentarer är en sällsynt krydda)', () => {
  it('även en HÖGT pratig bot kommenterar bara en liten andel av matcherna', () => {
    // Maximal commentChance (0.30 är taket i personas.ts). Effektiv chans = 0.30*SCALE.
    const chatty = persona({
      index: 2,
      personality: {
        label: 'peppig-pratig',
        commentChance: 0.3,
        reactionChance: 0.4,
        tone: 'peppig',
      },
    });
    const cs = generateBotComments(chatty, FINISHED_MATCHES, FACIT);
    const fraction = cs.length / PLAYED_COUNT;
    // Effektiv chans ~0.105; med marginal ska andelen ligga klart under en fjärdedel.
    expect(fraction).toBeLessThan(0.25);
  });

  it('summan över ALLA personas: kommentarer är FÄRRE än spelade matcher * personas (gles)', () => {
    const personas = generatePersonas().filter((p) => p.cohort === 'new-room');
    let comments = 0;
    for (const p of personas) {
      comments += generateBotComments(p, FINISHED_MATCHES, FACIT).length;
    }
    const ceiling = personas.length * PLAYED_COUNT; // om alla kommenterade allt
    // Glesheten: faktiska kommentarer ska vara en LITEN bråkdel av taket.
    expect(comments).toBeGreaterThan(0); // men botarna är inte helt tysta
    expect(comments).toBeLessThan(ceiling * 0.15);
  });

  it('COMMENT_SCALE skalar ner chansen (kryddan, inte var-tredje-match)', () => {
    expect(COMMENT_SCALE).toBeLessThan(0.5);
    expect(COMMENT_SCALE).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * TYSTHETS-DEFAULT + negativ-kontroll.
 * ------------------------------------------------------------------ */

describe('tysthets-default', () => {
  const lowProp: BotPersona = {
    ...persona({ index: 7 }),
    personality: { label: 'lugn-sparsam', commentChance: 0.02, reactionChance: 0.1, tone: 'lugn' },
  };

  it('en lågbenägen bot i en mållös (tråkig) turnering ger 0 kommentarer', () => {
    const goalless = matchesAllGoalless();
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, goalless);
    const cs = generateBotComments(lowProp, goalless, facit);
    expect(cs).toHaveLength(0);
  });

  it('NEGATIV-KONTROLL: samma test-fall MED hög benägenhet ger > 0 (testet kan rödna)', () => {
    // Bevisar att tysthets-testet inte är trivialt grönt: vrider man upp commentChance
    // (samma matcher) SKA det bli kommentarer , annars vaktade tysthets-testet ingenting.
    const goalless = matchesAllGoalless();
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, goalless);
    const chatty: BotPersona = {
      ...lowProp,
      personality: { label: 'lugn-pratig', commentChance: 0.3, reactionChance: 0.1, tone: 'lugn' },
    };
    const cs = generateBotComments(chatty, goalless, facit);
    expect(cs.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Variation + skarv mot mood.
 * ------------------------------------------------------------------ */

describe('variation + mood-skarv', () => {
  it('kommentarerna är inte en enda upprepad mall (minst två olika fraser totalt)', () => {
    // Samla många botars kommentarer; fras-mängden ska ha variation (inte 1 identisk mall).
    const personas = generatePersonas()
      .filter((p) => p.cohort === 'new-room')
      .slice(0, 80);
    const bodies = new Set<string>();
    for (const p of personas) {
      for (const c of generateBotComments(p, FINISHED_MATCHES, FACIT)) {
        bodies.add(c.body);
      }
    }
    expect(bodies.size).toBeGreaterThan(1);
  });

  it('varje kommentar-text kommer ur den (mood, tone)-pool matchen + tonen pekar på (skarv)', () => {
    // Kör en bot, och bekräfta för varje kommentar att texten ligger i exakt den pool som
    // matchens mood (ur RIKTIGT facit) + botens ton ger. En mood-/pool-drift rödnar här.
    const p = persona({
      index: 11,
      personality: {
        label: 'peppig-pratig',
        commentChance: 0.3,
        reactionChance: 0,
        tone: 'peppig',
      },
    });
    const facitById = new Map(FACIT.matches.map((f) => [f.matchId, f]));
    const cs = generateBotComments(p, FINISHED_MATCHES, FACIT);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      const facitMatch = facitById.get(c.matchId);
      expect(facitMatch).toBeDefined();
      const mood = moodFromScoreline(facitMatch!.actual);
      expect(COMMENT_POOLS[mood].peppig).toContain(c.body);
    }
  });

  it('alla kommentar-texter respekterar DB-längdgränsen (1..500 tecken)', () => {
    const personas = generatePersonas().filter((p) => p.cohort === 'new-room');
    for (const p of personas) {
      for (const c of generateBotComments(p, FINISHED_MATCHES, FACIT)) {
        expect(c.body.length).toBeGreaterThanOrEqual(1);
        expect(c.body.length).toBeLessThanOrEqual(500);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * Kohort-scopning: vm2026/fsu tysta på spelat.
 * ------------------------------------------------------------------ */

describe('kohort-scopning', () => {
  it('vm2026 kommenterar INTE (har inte sett facit) , tom lista', () => {
    const vm = generateBotComments(
      {
        ...persona({ index: 13, cohort: 'vm2026' }),
        personality: { label: 'p', commentChance: 0.3, reactionChance: 0, tone: 'peppig' },
      },
      FINISHED_MATCHES,
      FACIT
    );
    expect(vm).toHaveLength(0);
  });

  it('fsu kommenterar inte heller , tom lista', () => {
    const fsu = generateBotComments(
      {
        ...persona({ index: 14, cohort: 'fsu' }),
        personality: { label: 'p', commentChance: 0.3, reactionChance: 0, tone: 'skämtsam' },
      },
      FINISHED_MATCHES,
      FACIT
    );
    expect(fsu).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Svar-approximation (planReplies).
 * ------------------------------------------------------------------ */

describe('svar-approximation (planReplies)', () => {
  function primary(
    personaKey: string,
    matchId: string,
    tone: BotPersona['personality']['tone']
  ): PrimaryComment {
    return {
      personaKey,
      persona: {
        ...persona(),
        personality: { label: 't', commentChance: 0.1, reactionChance: 0, tone },
      },
      matchId,
    };
  }

  it('en tråd med bara EN bot får inget svar (ingen att svara på)', () => {
    const primaries = [primary('a#1', 'g-A-1', 'peppig'), primary('a#1', 'g-A-1', 'peppig')];
    expect(planReplies(primaries, 1)).toHaveLength(0);
  });

  it('en tråd med >= 2 distinkta botar KAN få ett svar, och svaret pekar på den tråden', () => {
    const primaries = [primary('a#1', 'g-A-1', 'peppig'), primary('b#2', 'g-A-1', 'analytisk')];
    // Sök en seed som ger ett svar (planReplies är sparsamt; någon seed faller in).
    let withReply = null as ReturnType<typeof planReplies> | null;
    for (let seed = 1; seed <= 50; seed++) {
      const r = planReplies(primaries, seed);
      if (r.length > 0) {
        withReply = r;
        break;
      }
    }
    expect(withReply).not.toBeNull();
    for (const reply of withReply!) {
      // Svaret hör till samma match-tråd som de primära (en giltig befintlig konversation).
      expect(reply.matchId).toBe('g-A-1');
      // Svararen är en av trådens botar (inte en utomstående).
      expect(['a#1', 'b#2']).toContain(reply.personaKey);
      expect(reply.isReply).toBe(true);
      expect(reply.body.length).toBeGreaterThan(0);
    }
  });

  it('svar är deterministiska (samma primaries + seed -> samma svar)', () => {
    const primaries = [primary('a#1', 'g-A-1', 'peppig'), primary('b#2', 'g-A-1', 'analytisk')];
    expect(planReplies(primaries, 7)).toEqual(planReplies(primaries, 7));
  });

  it('svar korsar aldrig trådar (ett svar i tråd X refererar bara tråd X)', () => {
    const primaries = [
      primary('a#1', 'g-A-1', 'peppig'),
      primary('b#2', 'g-A-1', 'lugn'),
      primary('c#3', 'g-A-2', 'skämtsam'),
      primary('d#4', 'g-A-2', 'analytisk'),
    ];
    const validThreads = new Set(primaries.map((p) => p.matchId));
    for (let seed = 1; seed <= 30; seed++) {
      for (const reply of planReplies(primaries, seed)) {
        expect(validThreads.has(reply.matchId)).toBe(true);
      }
    }
  });

  it('tom input -> inga svar', () => {
    expect(planReplies([], 1)).toEqual([]);
  });
});
