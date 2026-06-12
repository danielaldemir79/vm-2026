// Tester för treplats-seedningen UR match-tipsen (T64, #118).
//
// Testerna vaktar de FAKTISKA invarianterna (inte en svagare form, jfr lessons
// "uttömmande-test-vaktar-svagare-invariant" + "tyst-maskerande-fallback"):
//   - KOMPLETT tippat (alla 72 gruppmatcher) -> 8 treor seedade, IDENTISKT med den
//     källlåsta motorn (rankThirdPlaces Article 13 + seedThirdPlaces Annexe C),
//   - OFULLSTÄNDIGT tippat (en enda gruppmatch otippad) -> ingen seedning (complete
//     false, tom map), alla treplats-slots ärligt öppna, INGEN gissning,
//   - NOLL tips -> ingen seedning (den farliga fällan: computeStandings ger en
//     rank-3-rad även utan tips, men det får ALDRIG seedas),
//   - seedningen RÖR SIG med tipsen (ändra ett resultat -> annan trea-mängd),
//   - funktionen muterar inte sina argument.

import { describe, expect, it } from 'vitest';
import type { GroupId, Group, Match } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { WC2026_GROUPS, WC2026_MATCHES } from '../../data/wc2026';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { preliminaryThirdSeeding } from '../../domain/bracket/preliminary-third-seeding';
import { COLUMN_MATCH_IDS } from '../../domain/bracket/seed-third-places';
import { deriveTipsThirdSeeding, type MatchTipScore } from './derive-tips-thirds';

const GROUPS: readonly Group[] = WC2026_GROUPS;
const MATCHES: readonly Match[] = WC2026_MATCHES;

/** Alla gruppmatcher i matchplanen (de som tippas och räknas in i tabellen). */
const GROUP_MATCHES = MATCHES.filter((m) => m.stage === 'group' && m.groupId !== null);

/**
 * Bygg ett KOMPLETT match-tips-set (alla 72 gruppmatcher) med en deterministisk
 * scoreline-regel som ger en TYDLIG, styrbar tabell:
 *   - position-1-laget (gruppens första lag i lottningen) vinner sina matcher stort,
 *   - position-2-laget näst bäst, osv, så rank 1>2>3>4 blir entydig per grupp.
 * Treans STYRKA (poäng/MS) skiljs mellan grupper via `strongThirdGroups`: grupper i
 * det settet får sin trea en EXTRA seger (mot 4:an), så de rankas högre bland treorna.
 * Det låter testet bestämma vilka 8 grupper som ska leda trea-rankningen.
 */
function fullTips(strongThirdGroups: ReadonlySet<GroupId> = new Set()): Map<string, MatchTipScore> {
  // teamId -> dess lottnings-position (1-4) inom gruppen, ur grupp-medlemskapet.
  const positionByTeam = new Map<string, number>();
  for (const group of GROUPS) {
    group.teamIds.forEach((teamId, index) => positionByTeam.set(teamId, index + 1));
  }

  const tips = new Map<string, MatchTipScore>();
  for (const match of GROUP_MATCHES) {
    const home = match.homeTeamId!;
    const away = match.awayTeamId!;
    const homePos = positionByTeam.get(home)!;
    const awayPos = positionByTeam.get(away)!;
    const group = match.groupId!;
    const strong = strongThirdGroups.has(group);

    // Lägre position = starkare lag = vinner. Trean (pos 3) får i "strong"-grupper en
    // EXTRA marginal mot 4:an (pos 4) så dess poäng/MS lyfts bland treorna.
    let homeGoals: number;
    let awayGoals: number;
    if (homePos < awayPos) {
      homeGoals = strong && homePos === 3 && awayPos === 4 ? 3 : 2;
      awayGoals = 0;
    } else if (awayPos < homePos) {
      homeGoals = 0;
      awayGoals = strong && awayPos === 3 && homePos === 4 ? 3 : 2;
    } else {
      homeGoals = 1;
      awayGoals = 1;
    }
    tips.set(match.id, { homeGoals, awayGoals });
  }
  return tips;
}

describe('deriveTipsThirdSeeding, komplett tippat seedar de 8 bästa treorna', () => {
  it('seedar 8 treor i de 8 Annexe C-matcherna när alla 72 gruppmatcher är tippade', () => {
    const seeding = deriveTipsThirdSeeding(GROUPS, MATCHES, fullTips());
    expect(seeding.complete).toBe(true);
    expect(seeding.seedingByMatchId.size).toBe(8);
    // Exakt de 8 Annexe C-matcherna (COLUMN_MATCH_IDS), inga andra.
    expect(new Set(seeding.seedingByMatchId.keys())).toEqual(new Set(COLUMN_MATCH_IDS));
    // 8 distinkta grupper, och varje seedad grupp har ett känt trea-lag-id.
    const seededGroups = [...seeding.seedingByMatchId.values()];
    expect(new Set(seededGroups).size).toBe(8);
    for (const group of seededGroups) {
      expect(seeding.thirdTeamIdByGroup.get(group)).toBeDefined();
    }
  });

  it('är IDENTISK med den källlåsta motorn (samma deriveGroupTables -> preliminaryThirdSeeding)', () => {
    // Oberoende uträkning DIREKT via den källlåsta kedjan: bygg samma tippade tabeller
    // och seeda med preliminaryThirdSeeding (rankThirdPlaces + seedThirdPlaces/Annexe C).
    // T64 får INTE avvika en kolumn (ingen parallell seedning).
    const tips = fullTips();
    const synthetic: Match[] = GROUP_MATCHES.map((m) => ({
      id: m.id,
      stage: 'group',
      groupId: m.groupId,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      kickoff: m.kickoff,
      venue: m.venue,
      status: 'finished',
      result: tips.get(m.id)!,
    }));
    const tables = deriveGroupTables(GROUPS, synthetic);
    const expected = preliminaryThirdSeeding(tables);

    const seeding = deriveTipsThirdSeeding(GROUPS, MATCHES, tips);
    expect(new Map(seeding.seedingByMatchId)).toEqual(new Map(expected));

    // Och trea-lag-id:t per seedad grupp är gruppens rank-3 i den tippade tabellen.
    const tablesByGroup = new Map(tables.map((t) => [t.groupId, t]));
    for (const [, group] of seeding.seedingByMatchId) {
      const rank3 = tablesByGroup.get(group)!.standings.find((r) => r.rank === 3)!.teamId;
      expect(seeding.thirdTeamIdByGroup.get(group)).toBe(rank3);
    }
  });

  it('seedar de 8 grupper vars treor är starkast (rörlig mängd, styrd av tipsen)', () => {
    // Gör A-H:s treor starka (extra seger) -> de ska leda trea-rankningen och seedas.
    const strong = new Set<GroupId>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const seeding = deriveTipsThirdSeeding(GROUPS, MATCHES, fullTips(strong));
    expect(seeding.complete).toBe(true);
    expect([...seeding.seedingByMatchId.values()].sort()).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
    ]);
  });

  it('RÖR SIG: en annan stark-mängd ger en annan seedad trea-mängd', () => {
    const before = deriveTipsThirdSeeding(
      GROUPS,
      MATCHES,
      fullTips(new Set<GroupId>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']))
    );
    const after = deriveTipsThirdSeeding(
      GROUPS,
      MATCHES,
      fullTips(new Set<GroupId>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I']))
    );
    expect([...before.seedingByMatchId.values()].sort()).toContain('H');
    const afterGroups = [...after.seedingByMatchId.values()].sort();
    expect(afterGroups).toContain('I');
    expect(afterGroups).not.toContain('H');
  });
});

describe('deriveTipsThirdSeeding, ofullständiga tips ger ÄRLIGT inga treor (gissa aldrig)', () => {
  it('NOLL tips -> ingen seedning, trots att computeStandings ger en rank-3-rad per grupp', () => {
    // Den farliga fällan (probe-bevisad): med 0 matcher ger computeStandings ändå en
    // rank-3-rad (alfabetisk fallback). Den FÅR ALDRIG seedas, det vore en gissning.
    const seeding = deriveTipsThirdSeeding(GROUPS, MATCHES, new Map());
    expect(seeding.complete).toBe(false);
    expect(seeding.seedingByMatchId.size).toBe(0);
    expect(seeding.thirdTeamIdByGroup.size).toBe(0);
  });

  it('EN enda otippad gruppmatch -> ingen seedning (alla treplats-slots öppna)', () => {
    const tips = fullTips();
    // Ta bort tipset på EN gruppmatch (grupp A:s första). Då är grupp A inte längre
    // helt tippad, och hela trea-seedningen faller (Annexe C kräver hela 8-mängden).
    tips.delete('g-A-1');
    const seeding = deriveTipsThirdSeeding(GROUPS, MATCHES, tips);
    expect(seeding.complete).toBe(false);
    expect(seeding.seedingByMatchId.size).toBe(0);
  });

  it('11 helt tippade grupper men den 12:e helt otippad -> ingen seedning', () => {
    // Tippa allt UTOM grupp L:s 6 matcher. 11 kompletta grupper räcker inte:
    // Annexe C behöver de 8 bästa av ALLA 12 gruppers treor.
    const tips = fullTips();
    for (const match of GROUP_MATCHES) {
      if (match.groupId === 'L') {
        tips.delete(match.id);
      }
    }
    const seeding = deriveTipsThirdSeeding(GROUPS, MATCHES, tips);
    expect(seeding.complete).toBe(false);
    expect(seeding.seedingByMatchId.size).toBe(0);
  });
});

describe('deriveTipsThirdSeeding, robusthet + renhet', () => {
  it('ignorerar tips på matcher utanför gruppspelet (bara gruppmatcher räknas)', () => {
    // Lägg ett tips på en slutspelsmatch (M73) ovanpå det kompletta gruppspels-tipset.
    // Det får INTE påverka tabellerna/seedningen (computeStandings räknar bara grupp).
    const tips = fullTips();
    tips.set('M73', { homeGoals: 5, awayGoals: 0 });
    const withExtra = deriveTipsThirdSeeding(GROUPS, MATCHES, tips);
    const baseline = deriveTipsThirdSeeding(GROUPS, MATCHES, fullTips());
    expect(new Map(withExtra.seedingByMatchId)).toEqual(new Map(baseline.seedingByMatchId));
  });

  it('muterar inte sina argument', () => {
    const tips = fullTips();
    const tipsSnapshot = JSON.stringify([...tips.entries()]);
    const groupsSnapshot = JSON.stringify(GROUPS);
    const matchesSnapshot = JSON.stringify(MATCHES);
    deriveTipsThirdSeeding(GROUPS, MATCHES, tips);
    expect(JSON.stringify([...tips.entries()])).toBe(tipsSnapshot);
    expect(JSON.stringify(GROUPS)).toBe(groupsSnapshot);
    expect(JSON.stringify(MATCHES)).toBe(matchesSnapshot);
  });

  it('alla 12 grupper måste finnas i matchplanen (en saknad grupp -> ofullständig)', () => {
    // En matchplan utan grupp L:s matcher: grupp L kan aldrig vara "helt tippad"
    // (0 matcher), så seedningen uteblir oavsett hur mycket annat som tippats.
    const withoutL = MATCHES.filter((m) => m.groupId !== 'L');
    const tips = fullTips(); // bär även L-tips, men L saknas i matchplanen
    const seeding = deriveTipsThirdSeeding(GROUPS, withoutL, tips);
    expect(seeding.complete).toBe(false);
    expect(seeding.seedingByMatchId.size).toBe(0);
    // Sanity: GROUP_IDS täcker fortfarande L (vi tog bort matcher, inte gruppdefinitionen).
    expect(GROUP_IDS).toContain('L');
  });
});
