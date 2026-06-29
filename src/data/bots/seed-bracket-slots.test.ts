import { describe, it, expect } from 'vitest';
import type { Team } from '../../domain/types';
import type { BracketState } from '../../features/bracket/derive-bracket';
import { teamCode } from '../../domain/team-code';
import type { Rng } from './prng';
import {
  pickAdvancingTeam,
  selectSeedableSlots,
  planBotBracketSeeding,
  DEFAULT_SEED_BRACKET_CONFIG,
  type SeedableSlot,
  type BotForSeeding,
  type ExistingBracketRow,
} from './seed-bracket-slots';

/* ------------------------------------------------------------------ *
 * Fixtur-hjälpare.
 * ------------------------------------------------------------------ */

function team(id: string, code: string, fifaRanking: number | undefined): Team {
  return {
    id,
    code,
    name: code,
    group: 'A',
    ...(fifaRanking !== undefined ? { fifaRanking } : {}),
  };
}

type Slot = BracketState['matches'][number]['home'];

function slot(matchId: string, side: 'home' | 'away', teamId: string | null): Slot {
  return {
    id: `${matchId}-${side}`,
    matchId,
    side,
    stage: 'round-of-32',
    nextSlotId: null,
    resolution: teamId === null ? 'tbd' : 'resolved',
    label: `${matchId} ${side}`,
    teamId,
    candidateTeamIds: [],
  };
}

function bracketMatch(
  matchId: string,
  homeTeamId: string | null,
  awayTeamId: string | null
): BracketState['matches'][number] {
  return {
    matchId,
    stage: 'round-of-32',
    home: slot(matchId, 'home', homeTeamId),
    away: slot(matchId, 'away', awayTeamId),
    winnerSlotId: null,
    result: null,
    kickoff: null,
  };
}

function bracketOf(matches: BracketState['matches']): BracketState {
  return { matches, locked: true, preliminary: false };
}

/** En rng som ger ett fast värde (för att styra favorit/skräll-grenen exakt). */
function fixedRng(value: number): Rng {
  return () => value;
}

const FAV = teamCode('FAV');
const UND = teamCode('UND');

/* ------------------------------------------------------------------ *
 * pickAdvancingTeam: skill-viktad favorit.
 * ------------------------------------------------------------------ */

describe('pickAdvancingTeam', () => {
  const cfg = { favoriteCap: 0.85, replaceInvalid: true };
  const slotTeams = { favorite: FAV, underdog: UND };

  it('skill 0 = ren slantsing (p favorit = 0.5): under 0.5 -> favorit, 0.5+ -> skräll', () => {
    expect(pickAdvancingTeam(slotTeams, 0, fixedRng(0.49), cfg)).toBe(FAV);
    expect(pickAdvancingTeam(slotTeams, 0, fixedRng(0.5), cfg)).toBe(UND); // gränsen exklusiv
    expect(pickAdvancingTeam(slotTeams, 0, fixedRng(0.51), cfg)).toBe(UND);
  });

  it('skill 1 = favorit-tak (0.85): strax under -> favorit, strax över -> skräll', () => {
    expect(pickAdvancingTeam(slotTeams, 1, fixedRng(0.84), cfg)).toBe(FAV);
    expect(pickAdvancingTeam(slotTeams, 1, fixedRng(0.85), cfg)).toBe(UND);
    expect(pickAdvancingTeam(slotTeams, 1, fixedRng(0.86), cfg)).toBe(UND);
  });

  it('skill 0.5 -> p favorit 0.675 (mellan slantsing och tak), diskriminerande', () => {
    // En drift som t.ex. ignorerade skill (alltid 0.5) skulle ge UND vid 0.6 (0.6>=0.5).
    expect(pickAdvancingTeam(slotTeams, 0.5, fixedRng(0.6), cfg)).toBe(FAV); // 0.6 < 0.675
    expect(pickAdvancingTeam(slotTeams, 0.5, fixedRng(0.7), cfg)).toBe(UND); // 0.7 >= 0.675
  });

  it('clampar skill_tier utanför [0,1]', () => {
    expect(pickAdvancingTeam(slotTeams, 5, fixedRng(0.84), cfg)).toBe(FAV); // som skill 1
    expect(pickAdvancingTeam(slotTeams, -3, fixedRng(0.49), cfg)).toBe(FAV); // som skill 0
  });

  it('fail-loud på ogiltig favoriteCap (måste ligga i (0.5, 1))', () => {
    const bad = (favoriteCap: number) =>
      pickAdvancingTeam(slotTeams, 1, fixedRng(0.5), { favoriteCap, replaceInvalid: true });
    // pickAdvancingTeam validerar inte själv; validering sker i planeraren. Bekräfta att
    // planeraren fail-loud:ar (se planBotBracketSeeding-blocket nedan). Här bara default OK.
    expect(() =>
      pickAdvancingTeam(slotTeams, 1, fixedRng(0.5), DEFAULT_SEED_BRACKET_CONFIG)
    ).not.toThrow();
    void bad;
  });
});

/* ------------------------------------------------------------------ *
 * selectSeedableSlots: tippbar = lag kända OCH ej låst.
 * ------------------------------------------------------------------ */

describe('selectSeedableSlots', () => {
  // Det STARKARE laget (lägre ranking) ligger som AWAY, så ett "home är alltid favorit"-fel
  // skulle ge fel favorit (diskriminerande).
  const teams: Team[] = [team('weak', 'WEA', 30), team('strong', 'STR', 3)];
  const matchPlan = [
    { id: 'M73', kickoff: '2026-06-30T18:00:00.000Z' },
    { id: 'M74', kickoff: '2026-06-29T12:00:00.000Z' },
    { id: 'M75', kickoff: '2026-07-01T18:00:00.000Z' },
  ];

  it('tar med en resolved, ej låst slot och sätter favoriten = FIFA-starkare (away kan vara favorit)', () => {
    const bracket = bracketOf([bracketMatch('M73', 'weak', 'strong')]);
    const now = new Date('2026-06-29T00:00:00.000Z'); // före M73:s avspark
    const seedable = selectSeedableSlots(bracket, teams, matchPlan, now);
    expect(seedable).toEqual<SeedableSlot[]>([
      { slotId: 'M73', stage: 'round-of-32', favorite: teamCode('STR'), underdog: teamCode('WEA') },
    ]);
  });

  it('utesluter en slot vars lag inte är kända (en sida tbd)', () => {
    const bracket = bracketOf([bracketMatch('M73', 'weak', null)]);
    const now = new Date('2026-06-29T00:00:00.000Z');
    expect(selectSeedableSlots(bracket, teams, matchPlan, now)).toEqual([]);
  });

  it('utesluter en LÅST slot (avspark passerad)', () => {
    const bracket = bracketOf([bracketMatch('M74', 'weak', 'strong')]); // M74 avspark 2026-06-29T12:00
    const now = new Date('2026-06-29T18:00:00.000Z'); // efter avspark
    expect(selectSeedableSlots(bracket, teams, matchPlan, now)).toEqual([]);
  });

  it('lås-tröskeln är now >= avspark (n-1 tippbar, n låst, n+1 låst)', () => {
    const bracket = bracketOf([bracketMatch('M73', 'weak', 'strong')]); // avspark 2026-06-30T18:00
    const kickoffMs = new Date('2026-06-30T18:00:00.000Z').getTime();
    const before = selectSeedableSlots(bracket, teams, matchPlan, new Date(kickoffMs - 1));
    const exactly = selectSeedableSlots(bracket, teams, matchPlan, new Date(kickoffMs));
    const after = selectSeedableSlots(bracket, teams, matchPlan, new Date(kickoffMs + 1));
    expect(before).toHaveLength(1); // 1ms före avspark: ännu tippbar
    expect(exactly).toHaveLength(0); // exakt avspark: låst
    expect(after).toHaveLength(0); // efter avspark: låst
  });

  it('behandlar en slot utan känd avspark som låst (fail-safe)', () => {
    const bracket = bracketOf([bracketMatch('M99', 'weak', 'strong')]); // M99 saknas i matchPlan
    const now = new Date('2026-06-29T00:00:00.000Z');
    expect(selectSeedableSlots(bracket, teams, matchPlan, now)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * planBotBracketSeeding: idempotens, ogiltig-ersättning, bot-isolering.
 * ------------------------------------------------------------------ */

describe('planBotBracketSeeding', () => {
  const seedable: SeedableSlot[] = [
    { slotId: 'M73', stage: 'round-of-32', favorite: FAV, underdog: UND },
  ];
  const bots: BotForSeeding[] = [
    { userId: 'bot-1', roomId: 'R1', skillTier: 1, seedKey: 'vm2026#1' },
    { userId: 'bot-2', roomId: 'R1', skillTier: 0, seedKey: 'vm2026#2' },
  ];

  it('fyller saknade tips för alla botar och bara med ett av slottens två lag', () => {
    const plan = planBotBracketSeeding({ bots, seedableSlots: seedable, existingBracket: [] });
    expect(plan.summary.rowsToWrite).toBe(2);
    expect(plan.summary.missingFilled).toBe(2);
    expect(plan.summary.alreadyValid).toBe(0);
    expect(plan.summary.bySlot).toEqual({ M73: 2 });
    for (const row of plan.rows) {
      expect([FAV, UND]).toContain(row.advancingTeamId);
      expect(row.roomId).toBe('R1');
      expect(row.slotId).toBe('M73');
    }
  });

  it('är IDEMPOTENT: matar man tillbaka planens rader som befintliga blir andra planen tom', () => {
    const first = planBotBracketSeeding({ bots, seedableSlots: seedable, existingBracket: [] });
    const asExisting: ExistingBracketRow[] = first.rows.map((r) => ({
      roomId: r.roomId,
      slotId: r.slotId,
      userId: r.userId,
      advancingTeamId: r.advancingTeamId,
    }));
    const second = planBotBracketSeeding({
      bots,
      seedableSlots: seedable,
      existingBracket: asExisting,
    });
    expect(second.rows).toEqual([]);
    expect(second.summary.alreadyValid).toBe(2);
    expect(second.summary.rowsToWrite).toBe(0);
  });

  it('är DETERMINISTISK: samma indata ger exakt samma rader', () => {
    const a = planBotBracketSeeding({ bots, seedableSlots: seedable, existingBracket: [] });
    const b = planBotBracketSeeding({ bots, seedableSlots: seedable, existingBracket: [] });
    expect(a.rows).toEqual(b.rows);
  });

  it('ERSÄTTER ett ogiltigt tips (ej ett av lagen) när replaceInvalid=true', () => {
    const existing: ExistingBracketRow[] = [
      { roomId: 'R1', slotId: 'M73', userId: 'bot-1', advancingTeamId: 'ZZZ' }, // ej FAV/UND
    ];
    const plan = planBotBracketSeeding({
      bots,
      seedableSlots: seedable,
      existingBracket: existing,
    });
    expect(plan.summary.invalidReplaced).toBe(1);
    expect(plan.summary.missingFilled).toBe(1); // bot-2 saknade
    expect(plan.summary.rowsToWrite).toBe(2);
    const bot1Row = plan.rows.find((r) => r.userId === 'bot-1');
    expect(bot1Row && [FAV, UND]).toContain(bot1Row?.advancingTeamId);
  });

  it('LÄMNAR ett ogiltigt tips när replaceInvalid=false (fyller bara saknade)', () => {
    const existing: ExistingBracketRow[] = [
      { roomId: 'R1', slotId: 'M73', userId: 'bot-1', advancingTeamId: 'ZZZ' },
    ];
    const plan = planBotBracketSeeding({
      bots,
      seedableSlots: seedable,
      existingBracket: existing,
      config: { favoriteCap: 0.85, replaceInvalid: false },
    });
    expect(plan.summary.invalidReplaced).toBe(0);
    expect(plan.summary.invalidLeft).toBe(1);
    expect(plan.summary.missingFilled).toBe(1); // bara bot-2
    expect(plan.rows.every((r) => r.userId === 'bot-2')).toBe(true);
  });

  it('lämnar ett redan GILTIGT tips orört (även om favorit kontra skräll)', () => {
    const existing: ExistingBracketRow[] = [
      { roomId: 'R1', slotId: 'M73', userId: 'bot-1', advancingTeamId: UND }, // giltigt (skrällen)
      { roomId: 'R1', slotId: 'M73', userId: 'bot-2', advancingTeamId: FAV }, // giltigt
    ];
    const plan = planBotBracketSeeding({
      bots,
      seedableSlots: seedable,
      existingBracket: existing,
    });
    expect(plan.rows).toEqual([]);
    expect(plan.summary.alreadyValid).toBe(2);
  });

  it('BOT-ISOLERING: rör aldrig icke-bot-rader och räknar dem bara (nonBotExistingCount)', () => {
    const existing: ExistingBracketRow[] = [
      // En RIKTIG spelare med ett tips i SAMMA seedbara slot, t.o.m. ett ogiltigt:
      { roomId: 'R1', slotId: 'M73', userId: 'real-user', advancingTeamId: 'ZZZ' },
      { roomId: 'R1', slotId: 'M73', userId: 'real-user-2', advancingTeamId: FAV },
    ];
    const plan = planBotBracketSeeding({
      bots,
      seedableSlots: seedable,
      existingBracket: existing,
    });
    expect(plan.nonBotExistingCount).toBe(2);
    // INGEN planerad rad pekar på en riktig spelare:
    expect(plan.rows.some((r) => r.userId.startsWith('real-user'))).toBe(false);
    // Botarna seedas fortfarande (saknade rader):
    expect(plan.rows.map((r) => r.userId).sort()).toEqual(['bot-1', 'bot-2']);
  });

  it('separerar per RUM: ett giltigt tips i R1 öppnar inte för att hoppa R2', () => {
    const multiRoom: BotForSeeding[] = [
      { userId: 'bot-1', roomId: 'R1', skillTier: 1, seedKey: 'vm2026#1' },
      { userId: 'bot-1', roomId: 'R2', skillTier: 1, seedKey: 'vm2026#1' }, // samma konto, annat rum
    ];
    const existing: ExistingBracketRow[] = [
      { roomId: 'R1', slotId: 'M73', userId: 'bot-1', advancingTeamId: FAV }, // giltigt i R1
    ];
    const plan = planBotBracketSeeding({
      bots: multiRoom,
      seedableSlots: seedable,
      existingBracket: existing,
    });
    // R1 är redan giltigt (orört), R2 saknas (fylls): exakt en rad, för R2.
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ roomId: 'R2', userId: 'bot-1', slotId: 'M73' });
  });

  it('fail-loud på ogiltig favoriteCap', () => {
    const tooHigh = () =>
      planBotBracketSeeding({
        bots,
        seedableSlots: seedable,
        existingBracket: [],
        config: { favoriteCap: 1, replaceInvalid: true },
      });
    const tooLow = () =>
      planBotBracketSeeding({
        bots,
        seedableSlots: seedable,
        existingBracket: [],
        config: { favoriteCap: 0.5, replaceInvalid: true },
      });
    expect(tooHigh).toThrow(/favoriteCap/);
    expect(tooLow).toThrow(/favoriteCap/);
  });
});
