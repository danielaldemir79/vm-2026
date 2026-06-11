// Tester för den TIPS-härledda slutspelsbilden (T51, #88).
//
// Testerna vaktar de FAKTISKA invarianterna (inte en svagare form, jfr lessons
// "uttömmande-test-vaktar-svagare-invariant"):
//   - en tippad 1:a/2:a hamnar i EXAKT den slot bracket-strukturen säger,
//   - varje bästa-trea-slot förblir ÖPPEN (gissas aldrig), oavsett tips,
//   - åttondel och framåt är TBD (tips ger ingen match-vinnare),
//   - ett fullständigt grupp-tips ger ett komplett träd MINUS treplats-slotsen,
//   - identitets-rymden (code -> Team.id) översätts rätt vid seamen.
//
// Slot-id:n korskollas mot den källhänvisade bracket-structure.ts (FIFA Article
// 12.6): M73-home = 2:a grupp A, M74-home = 1:a grupp E, M74-away = bästa trea,
// M79-home = 1:a grupp A osv. Vi assertar mot de RIKTIGA strukturella positionerna,
// inte mot en parallell hårdkodning.

import { describe, expect, it } from 'vitest';
import type { Team } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { WC2026_TEAM_BASES, teamId } from '../../data/wc2026/team-refs';
import { deriveTipsBracket, type GroupTipPick } from './derive-tips-bracket';

/** Bas-lagen räcker för denna rena funktion (den läser bara id/code). */
const TEAMS: readonly Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

/** Slå upp en match i den härledda bilden (kastar om den saknas, så testet är skarpt). */
function matchOf(state: ReturnType<typeof deriveTipsBracket>, matchId: string) {
  const match = state.matches.find((m) => m.matchId === matchId);
  if (!match) {
    throw new Error(`Testfel: match ${matchId} saknas i den härledda bilden`);
  }
  return match;
}

/** Code -> Team.id (gemen), så testet kan asserta i id-rymden trädet bär. */
function id(code: string): string {
  return teamId(code);
}

/** Bygg ett FULLSTÄNDIGT tips för alla 12 grupper: position 1 -> 1:a, position 2 -> 2:a. */
function fullTips(): Map<string, GroupTipPick> {
  const groupTeams = new Map<string, Team[]>();
  for (const group of GROUP_IDS) {
    groupTeams.set(
      group,
      TEAMS.filter((t) => t.group === group)
    );
  }
  const picks = new Map<string, GroupTipPick>();
  for (const group of GROUP_IDS) {
    const teams = groupTeams.get(group)!;
    picks.set(group, { winnerCode: teams[0].code, runnerUpCode: teams[1].code });
  }
  return picks;
}

describe('deriveTipsBracket, tippad 1:a/2:a hamnar i rätt slot', () => {
  it('placerar en grupps tippade 1:a och 2:a i de slots strukturen anger för dem', () => {
    // Grupp A: 1:a grupp A -> M79-home (Winner A), 2:a grupp A -> M73-home (Runner-up A).
    // Källa: bracket-structure.ts (M79 home=w('A'), M73 home=ru('A')).
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
    ]);
    const state = deriveTipsBracket(picks, TEAMS);

    const m79Home = matchOf(state, 'M79').home;
    expect(m79Home.resolution).toBe('tipped');
    expect(m79Home.teamId).toBe(id('MEX')); // tippad 1:a grupp A
    expect(m79Home.label).toBe('1:a grupp A');

    const m73Home = matchOf(state, 'M73').home;
    expect(m73Home.resolution).toBe('tipped');
    expect(m73Home.teamId).toBe(id('RSA')); // tippad 2:a grupp A
    expect(m73Home.label).toBe('2:a grupp A');
  });

  it('översätter tippad CODE (versal) till Team.id (gemen) vid seamen, inte rå code', () => {
    // Identitets-rymd-vakten (T16/F1): slot.teamId måste vara gemen Team.id,
    // inte den versala koden tipset bär, annars matchar inget lag-uppslag i UI:t.
    const picks = new Map<string, GroupTipPick>([
      ['C', { winnerCode: 'BRA', runnerUpCode: 'MAR' }],
    ]);
    const state = deriveTipsBracket(picks, TEAMS);
    // 1:a grupp C -> M76-home (Winner C). 2:a grupp C -> M75-away (Runner-up C).
    expect(matchOf(state, 'M76').home.teamId).toBe('bra'); // gemen, inte "BRA"
    expect(matchOf(state, 'M75').away.teamId).toBe('mar');
  });

  it('matar Daniels exempel: 1A mot 2B möts i M73 (sextondelen)', () => {
    // M73 = 2:a grupp A v 2:a grupp B. Daniels kärnvärde: SE vilka som möts.
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
      ['B', { winnerCode: 'CAN', runnerUpCode: 'SUI' }],
    ]);
    const state = deriveTipsBracket(picks, TEAMS);
    const m73 = matchOf(state, 'M73');
    expect(m73.home.teamId).toBe(id('RSA')); // 2:a grupp A
    expect(m73.away.teamId).toBe(id('SUI')); // 2:a grupp B
    expect(m73.stage).toBe('round-of-32');
  });
});

describe('deriveTipsBracket, bästa-trea-slots gissas ALDRIG', () => {
  it('lämnar varje bästa-trea-slot ÖPPEN med behörighets-etikett, även med fullt tips', () => {
    const state = deriveTipsBracket(fullTips(), TEAMS);
    // De 8 matcher som har en bästa trea (bracket-structure.ts, Article 12.6).
    const bestThirdMatches = ['M74', 'M77', 'M79', 'M80', 'M81', 'M82', 'M85', 'M87'];
    for (const matchId of bestThirdMatches) {
      const match = matchOf(state, matchId);
      // Den ena sidan är en bästa trea (away för alla 8, men vi letar robust).
      const thirdSlot = [match.home, match.away].find((s) => s.resolution === 'open-third');
      expect(thirdSlot, `${matchId} ska ha en open-third-slot`).toBeDefined();
      expect(thirdSlot!.teamId).toBeNull(); // ALDRIG ett gissat lag
      expect(thirdSlot!.label).toMatch(/^3:a [A-L/]+$/); // behörighets-etikett
    }
  });

  it('placerar ALDRIG ett tippat lag i en bästa-trea-slot ens om laget är tippat 1:a/2:a', () => {
    // Hela trädet med fullt tips: ingen open-third-slot får bära ett teamId.
    const state = deriveTipsBracket(fullTips(), TEAMS);
    const thirdSlots = state.matches
      .flatMap((m) => [m.home, m.away])
      .filter((s) => s.resolution === 'open-third');
    expect(thirdSlots.length).toBe(8); // 8 bästa treor i sextondelen
    for (const slot of thirdSlots) {
      expect(slot.teamId).toBeNull();
    }
  });
});

describe('deriveTipsBracket, propageringen stannar ärligt vid sextondelen', () => {
  it('lämnar åttondel och framåt TBD (tips ger ingen match-vinnare)', () => {
    const state = deriveTipsBracket(fullTips(), TEAMS);
    // Åttondelar (M89-M96) och framåt: alla slots är 'tbd' med struktur-etikett.
    const laterMatches = state.matches.filter((m) => m.stage !== 'round-of-32');
    expect(laterMatches.length).toBeGreaterThan(0);
    for (const match of laterMatches) {
      for (const slot of [match.home, match.away]) {
        expect(slot.resolution, `${slot.id} ska vara tbd`).toBe('tbd');
        expect(slot.teamId).toBeNull();
        // Etiketten är strukturell ("Vinnare Mxx" / "Förlorare Mxx").
        expect(slot.label).toMatch(/^(Vinnare|Förlorare) M\d+$/);
      }
    }
  });

  it('finalen (M104) är två TBD-slots: ingen finallag-gissning ur tipsen', () => {
    const state = deriveTipsBracket(fullTips(), TEAMS);
    const final = matchOf(state, 'M104');
    expect(final.stage).toBe('final');
    expect(final.home.resolution).toBe('tbd');
    expect(final.away.resolution).toBe('tbd');
  });
});

describe('deriveTipsBracket, fullständighet + delvis tips', () => {
  it('ett fullständigt grupp-tips ger ett komplett träd MINUS treplats-slotsen', () => {
    const state = deriveTipsBracket(fullTips(), TEAMS);
    // Sextondelen (M73-M88) = 16 matcher, 32 slots. 24 av dem är grupp 1:a/2:a
    // (tippade), 8 är bästa treor (öppna). Inga tbd i sextondelen med fullt tips.
    const r32 = state.matches.filter((m) => m.stage === 'round-of-32');
    expect(r32.length).toBe(16);
    const r32Slots = r32.flatMap((m) => [m.home, m.away]);
    const tipped = r32Slots.filter((s) => s.resolution === 'tipped');
    const openThird = r32Slots.filter((s) => s.resolution === 'open-third');
    const tbd = r32Slots.filter((s) => s.resolution === 'tbd');
    expect(tipped.length).toBe(24); // 16 matcher * 2 - 8 treor = 24 grupp-positioner
    expect(openThird.length).toBe(8);
    expect(tbd.length).toBe(0); // fullt tips: ingen okänd grupp-position
    expect(state.tippedGroupCount).toBe(12);
  });

  it('en grupp UTAN tips ger tbd-slots för den gruppens positioner (ingen gissning)', () => {
    // Tippa allt UTOM grupp A. Grupp A:s positioner (M79-home 1:a, M73-home 2:a)
    // ska bli 'tbd' med kvar-stående positions-etikett, inte gissade lag.
    const picks = fullTips();
    picks.delete('A');
    const state = deriveTipsBracket(picks, TEAMS);

    const m79Home = matchOf(state, 'M79').home;
    expect(m79Home.resolution).toBe('tbd');
    expect(m79Home.teamId).toBeNull();
    expect(m79Home.label).toBe('1:a grupp A'); // positionen är känd, laget inte

    const m73Home = matchOf(state, 'M73').home;
    expect(m73Home.resolution).toBe('tbd');
    expect(m73Home.teamId).toBeNull();

    expect(state.tippedGroupCount).toBe(11);
  });

  it('räknar inte ett delvis tips (bara 1:a, ingen 2:a) som fullständigt', () => {
    const picks = new Map<string, GroupTipPick>([['A', { winnerCode: 'MEX', runnerUpCode: '' }]]);
    const state = deriveTipsBracket(picks, TEAMS);
    expect(state.tippedGroupCount).toBe(0);
    // 1:an är ändå placerad (vi har den), 2:an blir tbd.
    expect(matchOf(state, 'M79').home.teamId).toBe(id('MEX'));
    expect(matchOf(state, 'M73').home.resolution).toBe('tbd');
  });

  it('tomma tips ger ett helt strukturellt träd (inga placerade lag), tippedGroupCount 0', () => {
    const state = deriveTipsBracket(new Map(), TEAMS);
    expect(state.tippedGroupCount).toBe(0);
    const allSlots = state.matches.flatMap((m) => [m.home, m.away]);
    // Inget lag placerat, men strukturen finns (alla 32 slutspelsmatcher = 64 slots).
    expect(allSlots.every((s) => s.teamId === null)).toBe(true);
    expect(allSlots.some((s) => s.resolution === 'open-third')).toBe(true);
  });
});

describe('deriveTipsBracket, robusthet + renhet', () => {
  it('en okänd code i ett tips placerar inget lag (ingen obekräftad identitet)', () => {
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'ZZZ', runnerUpCode: 'RSA' }],
    ]);
    const state = deriveTipsBracket(picks, TEAMS);
    // 1:an (ZZZ, finns inte) -> tbd. 2:an (RSA) -> placerad.
    expect(matchOf(state, 'M79').home.resolution).toBe('tbd');
    expect(matchOf(state, 'M73').home.teamId).toBe(id('RSA'));
  });

  it('muterar inte sina argument', () => {
    const picks = fullTips();
    const picksSnapshot = JSON.stringify([...picks.entries()]);
    const teamsSnapshot = JSON.stringify(TEAMS);
    deriveTipsBracket(picks, TEAMS);
    expect(JSON.stringify([...picks.entries()])).toBe(picksSnapshot);
    expect(JSON.stringify(TEAMS)).toBe(teamsSnapshot);
  });

  it('producerar alla 32 slutspelsmatcher i officiell ordning (M73 -> M104)', () => {
    const state = deriveTipsBracket(fullTips(), TEAMS);
    expect(state.matches.length).toBe(32);
    expect(state.matches[0].matchId).toBe('M73');
    expect(state.matches[state.matches.length - 1].matchId).toBe('M104');
  });
});
