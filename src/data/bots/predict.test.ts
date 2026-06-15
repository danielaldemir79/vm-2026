// Tester för den skicklighets-skiktade tips-generatorn (T82, #173).
//
// Det viktigaste här är att bevisa SKARVEN mot den RIKTIGA poäng-motorn (inte en
// parallell poäng-beräkning), exakt lärdomen "bevisa skarven, inte happy-path": vi
// härleder ett VERKLIGT facit via derivePoolFacit ur produktions-matcherna, genererar
// bot-tips, och poängsätter dem genom det RIKTIGA scoreMemberBreakdown/buildLeaderboard.
// Då failar en mappnings-/identitets-drift RÖTT i stället för att tyst ge 0 poäng.
//
// Plus: determinism, kohort-scopning (new-room får poäng på spelat, vm2026/fsu = 0),
// att TAKET håller (ingen bot över en stark referens-spelare, diskriminerande), att
// högre skill ger fler poäng (skiktning syns), och edge/fel-vägar.

import { describe, expect, it } from 'vitest';
import { generateBotPredictions, DEFAULT_PREDICT_CONFIG, type PredictConfig } from './predict';
import type { BotPersona } from './personas';
import { WC2026_GROUPS, WC2026_TEAM_BASES } from '../wc2026/team-refs';
import { WC2026_MATCHES } from '../wc2026/matches';
import { derivePoolFacit, type PoolFacit } from '../../features/leaderboard/derive-facit';
import {
  buildLeaderboard,
  scoreMemberBreakdown,
  type MemberPredictions,
} from '../../features/leaderboard/aggregate-scores';
import type { Team, Match, Group } from '../../domain/types';
import { PREDICTION_POINTS } from '../predictions/score';

/* ------------------------------------------------------------------ *
 * Fixtures härledda ur PRODUKTIONS-data (källans schema, inte konsument-formen).
 * ------------------------------------------------------------------ */

// Full lag-lista (Team) ur bas-referenserna (id/code/grupp räcker för facit-mappningen).
const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

const GROUPS: Group[] = WC2026_GROUPS;

/**
 * Bygg en matchlista där ALLA gruppmatcher i grupp A+B är FÄRDIGSPELADE (deterministiska
 * resultat ur match-index), resten orörda (scheduled). Det ger ett RIKTIGT, icke-tomt
 * facit (avgjorda matcher + ev. klara grupper) att poängsätta mot, utan att vi handrullar
 * facit-formen, derivePoolFacit gör det.
 */
function matchesWithSomeFinished(): Match[] {
  return WC2026_MATCHES.map((m, idx): Match => {
    const isEarlyGroup = m.stage === 'group' && (m.groupId === 'A' || m.groupId === 'B');
    if (!isEarlyGroup) {
      return m;
    }
    // Deterministiska men varierade resultat så grupperna faktiskt avgörs.
    return {
      ...m,
      status: 'finished',
      result: { homeGoals: idx % 3, awayGoals: (idx + 1) % 2 },
    };
  });
}

const FINISHED_MATCHES = matchesWithSomeFinished();
const FACIT: PoolFacit = derivePoolFacit(TEAMS, GROUPS, FINISHED_MATCHES);

function persona(overrides: Partial<BotPersona> = {}): BotPersona {
  return {
    index: 1,
    displayName: 'Testbot',
    skillTier: 0.5,
    personality: { label: 'lugn-sparsam', commentChance: 0.1, reactionChance: 0.2, tone: 'lugn' },
    cohort: 'new-room',
    roomIndex: 0,
    ...overrides,
  };
}

/** Sätt user_id på alla tips (planeraren gör det i prod); aggregeringen bryr sig inte om id:t. */
function asMember(
  userId: string,
  preds: ReturnType<typeof generateBotPredictions>
): MemberPredictions {
  return {
    userId,
    matchPredictions: preds.matchPredictions.map((p) => ({ ...p, userId })),
    groupPredictions: preds.groupPredictions.map((p) => ({ ...p, userId })),
    bracketPredictions: preds.bracketPredictions.map((p) => ({ ...p, userId })),
  };
}

/* ------------------------------------------------------------------ *
 * Determinism.
 * ------------------------------------------------------------------ */

describe('determinism', () => {
  it('samma persona + facit ger EXAKT samma tips', () => {
    const a = generateBotPredictions(persona(), FINISHED_MATCHES, GROUPS, FACIT);
    const b = generateBotPredictions(persona(), FINISHED_MATCHES, GROUPS, FACIT);
    expect(a).toEqual(b);
  });

  it('olika persona-index ger olika tips (oberoende botar)', () => {
    const a = generateBotPredictions(persona({ index: 1 }), FINISHED_MATCHES, GROUPS, FACIT);
    const b = generateBotPredictions(persona({ index: 2 }), FINISHED_MATCHES, GROUPS, FACIT);
    expect(a).not.toEqual(b);
  });
});

/* ------------------------------------------------------------------ *
 * SKARVEN mot den RIKTIGA poäng-motorn (kärnan, inte happy-path).
 * ------------------------------------------------------------------ */

describe('poäng-skarv mot den RIKTIGA motorn (scoreMemberBreakdown/buildLeaderboard)', () => {
  it('en new-room-bots tips ger FAKTISKA poäng mot facit via den riktiga motorn (> 0)', () => {
    // Hög skicklighet => många rätt => den riktiga motorn ska ge poäng. Att vi kör den
    // ÄKTA motorn (inte en egen summa) bevisar att tips-FORMEN matchar det aggregeringen
    // läser (matchId/code-rymd/slot-id), annars vore poängen tyst 0 (T16-buggen).
    const preds = generateBotPredictions(
      persona({ index: 7, skillTier: 1, cohort: 'new-room' }),
      FINISHED_MATCHES,
      GROUPS,
      FACIT
    );
    const { total, bySource } = scoreMemberBreakdown(asMember('bot-7', preds), FACIT);
    expect(total).toBeGreaterThan(0);
    // Match-tips mot spelade matcher ska bidra (det är den primära poäng-källan här).
    expect(bySource.match).toBeGreaterThan(0);
    // Invariant ur motorn: käll-summorna summerar till total (vi bygger inget eget).
    expect(bySource.match + bySource.group + bySource.bracket + bySource.champion).toBe(total);
  });

  it('en exakt facit-kopia ger 3p (PREDICTION_POINTS.exact) per spelad match: skarven är rätt rymd', () => {
    // En "perfekt" persona (skill 1, accuracy ~0.999 nästan alltid rätt) ska få
    // exakt-poäng på spelade matcher via den riktiga score.ts. Detta KÖR den faktiska
    // skarven match-tips -> scorePrediction och skulle rödna om matchId/rymd driftat.
    // floor strax under cap (giltig skiktning), båda så höga att accuracy ~ cap.
    const nearPerfect: PredictConfig = { floorAccuracy: 0.998, capAccuracy: 0.999 };
    const preds = generateBotPredictions(
      persona({ index: 3, skillTier: 1, cohort: 'new-room' }),
      FINISHED_MATCHES,
      GROUPS,
      FACIT,
      nearPerfect
    );
    const { bySource } = scoreMemberBreakdown(asMember('bot-3', preds), FACIT);
    const playedCount = FACIT.matches.length;
    // Alla spelade matcher exakt => match-poäng == antal spelade * 3.
    expect(playedCount).toBeGreaterThan(0);
    expect(bySource.match).toBe(playedCount * PREDICTION_POINTS.exact);
  });
});

/* ------------------------------------------------------------------ *
 * Kohort-scopning: new-room får poäng på spelat, vm2026/fsu börjar på 0.
 * ------------------------------------------------------------------ */

describe('kohort-scopning (vm2026/fsu börjar på 0 poäng)', () => {
  it('vm2026-bot tippar INGEN spelad match/grupp/slot -> 0 poäng mot facit', () => {
    const preds = generateBotPredictions(
      persona({ index: 11, skillTier: 1, cohort: 'vm2026' }),
      FINISHED_MATCHES,
      GROUPS,
      FACIT
    );
    const { total } = scoreMemberBreakdown(asMember('vm-11', preds), FACIT);
    expect(total).toBe(0);
  });

  it('fsu-bot börjar också på 0 poäng mot facit', () => {
    const preds = generateBotPredictions(
      persona({ index: 12, skillTier: 1, cohort: 'fsu', displayName: 'GitGud' }),
      FINISHED_MATCHES,
      GROUPS,
      FACIT
    );
    const { total } = scoreMemberBreakdown(asMember('fsu-12', preds), FACIT);
    expect(total).toBe(0);
  });

  it('vm2026-bot tippar ÄNDÅ kommande matcher (tips finns, bara inte på spelade)', () => {
    const preds = generateBotPredictions(
      persona({ index: 13, cohort: 'vm2026' }),
      FINISHED_MATCHES,
      GROUPS,
      FACIT
    );
    // Den tippar de kommande (ej i facit) matcherna, så listan är inte tom.
    expect(preds.matchPredictions.length).toBeGreaterThan(0);
    // Men INGEN av dem är en spelad match (alla matchId saknas i facit.matches).
    const playedIds = new Set(FACIT.matches.map((f) => f.matchId));
    for (const p of preds.matchPredictions) {
      expect(playedIds.has(p.matchId)).toBe(false);
    }
  });

  it('new-room-bot tippar OCKSÅ de spelade matcherna (inkluderar facit-matcherna)', () => {
    const preds = generateBotPredictions(
      persona({ index: 14, cohort: 'new-room' }),
      FINISHED_MATCHES,
      GROUPS,
      FACIT
    );
    const tippedIds = new Set(preds.matchPredictions.map((p) => p.matchId));
    for (const f of FACIT.matches) {
      expect(tippedIds.has(f.matchId)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * TAKET: ingen bot toppar (mot en stark referens-spelare). Spridning syns.
 * ------------------------------------------------------------------ */

describe('taket håller: ingen bot går om en stark riktig spelare', () => {
  // En stark referens-spelare prickar ~90 % rätt (klart över bot-taket 0.62).
  function strongPlayerPredictions(): MemberPredictions {
    const strong = generateBotPredictions(
      persona({ index: 100, skillTier: 1, cohort: 'new-room' }),
      FINISHED_MATCHES,
      GROUPS,
      FACIT,
      { floorAccuracy: 0.9, capAccuracy: 0.95 }
    );
    return asMember('strong', strong);
  }

  it('over 60 botar med default-config håller sig UNDER den starka spelaren', () => {
    const strong = strongPlayerPredictions();
    const strongScore = scoreMemberBreakdown(strong, FACIT).total;

    // Generera 60 new-room-botar med spridda skill-tiers och default-tak.
    const members: MemberPredictions[] = [strong];
    for (let i = 0; i < 60; i++) {
      const p = persona({ index: 200 + i, skillTier: (i % 11) / 10, cohort: 'new-room' });
      const preds = generateBotPredictions(p, FINISHED_MATCHES, GROUPS, FACIT);
      members.push(asMember(`bot-${i}`, preds));
    }

    // Ingen bot ska nå den starka spelarens poäng (taket håller).
    for (let i = 1; i < members.length; i++) {
      const score = scoreMemberBreakdown(members[i], FACIT).total;
      expect(score).toBeLessThan(strongScore);
    }
  });

  it('topplistans 1:a är den starka spelaren, inte en bot (via den riktiga buildLeaderboard)', () => {
    const strong = strongPlayerPredictions();
    const predictionsByUser = new Map<string, MemberPredictions>();
    predictionsByUser.set('strong', strong);
    const roomMembers = [{ userId: 'strong', displayName: 'Stark Spelare' }];
    for (let i = 0; i < 40; i++) {
      const p = persona({ index: 300 + i, skillTier: (i % 11) / 10, cohort: 'new-room' });
      const preds = generateBotPredictions(p, FINISHED_MATCHES, GROUPS, FACIT);
      predictionsByUser.set(`bot-${i}`, asMember(`bot-${i}`, preds));
      roomMembers.push({ userId: `bot-${i}`, displayName: `Bot ${i}` });
    }
    const board = buildLeaderboard(roomMembers, predictionsByUser, FACIT);
    expect(board[0].userId).toBe('strong');
    expect(board[0].rank).toBe(1);
  });
});

describe('skiktning syns: högre skill ger i snitt fler poäng', () => {
  it('en grupp högskill-botar slår en grupp lågskill-botar i snittpoäng', () => {
    function avgFor(skillTier: number, base: number): number {
      let sum = 0;
      const n = 25;
      for (let i = 0; i < n; i++) {
        const p = persona({ index: base + i, skillTier, cohort: 'new-room' });
        const preds = generateBotPredictions(p, FINISHED_MATCHES, GROUPS, FACIT);
        sum += scoreMemberBreakdown(asMember(`x-${base + i}`, preds), FACIT).total;
      }
      return sum / n;
    }
    const lowAvg = avgFor(0.1, 1000);
    const highAvg = avgFor(0.9, 2000);
    expect(highAvg).toBeGreaterThan(lowAvg);
  });
});

/* ------------------------------------------------------------------ *
 * Edge- och fel-vägar.
 * ------------------------------------------------------------------ */

describe('edge- och fel-vägar', () => {
  it('tom matchlista + tomt facit ger inga match-/grupp-tips men kraschar inte', () => {
    const emptyFacit: PoolFacit = { matches: [], groups: [], bracketSlots: [], champion: null };
    const preds = generateBotPredictions(persona(), [], [], emptyFacit);
    expect(preds.matchPredictions).toEqual([]);
    expect(preds.groupPredictions).toEqual([]);
    // Utan kända lag (tom matchlista/grupper) finns inga koder att gissa bracket ur.
    expect(preds.bracketPredictions).toEqual([]);
  });

  it('tomt facit men full matchlista: alla matcher behandlas som kommande (tips finns, 0 poäng)', () => {
    const emptyFacit: PoolFacit = { matches: [], groups: [], bracketSlots: [], champion: null };
    const preds = generateBotPredictions(
      persona({ cohort: 'new-room' }),
      WC2026_MATCHES,
      GROUPS,
      emptyFacit
    );
    // Alla gruppmatcher (kända lag) tippas, men inget ger poäng (tomt facit).
    expect(preds.matchPredictions.length).toBeGreaterThan(0);
    expect(scoreMemberBreakdown(asMember('e', preds), emptyFacit).total).toBe(0);
  });

  it('match utan kända lag (slutspel före seedning) hoppas över', () => {
    const emptyFacit: PoolFacit = { matches: [], groups: [], bracketSlots: [], champion: null };
    const preds = generateBotPredictions(persona(), WC2026_MATCHES, GROUPS, emptyFacit);
    // Inga slutspels-match-tips (M73.. har null-lag tills seedning).
    const knockoutTipped = preds.matchPredictions.filter((p) => p.matchId.startsWith('M'));
    expect(knockoutTipped).toEqual([]);
  });

  it('kastar på capAccuracy >= 1 (en bot får aldrig bli perfekt)', () => {
    expect(() =>
      generateBotPredictions(persona(), FINISHED_MATCHES, GROUPS, FACIT, {
        floorAccuracy: 0.2,
        capAccuracy: 1,
      })
    ).toThrow(/aldrig bli\s+perfekt|< 1/);
  });

  it('kastar på cap <= floor (ingen skiktning)', () => {
    expect(() =>
      generateBotPredictions(persona(), FINISHED_MATCHES, GROUPS, FACIT, {
        floorAccuracy: 0.6,
        capAccuracy: 0.5,
      })
    ).toThrow(/större än floorAccuracy/);
  });

  it('default-tak är < 1 (invariant: ingen perfekt bot)', () => {
    expect(DEFAULT_PREDICT_CONFIG.capAccuracy).toBeLessThan(1);
  });
});
