// Tester för match-stämnings-klassningen (T82 del 2, #173).
//
// Bevisar: (a) varje mood-gren träffas av ett DISKRIMINERANDE resultat (en fixtur där en
// annan tröskel/prioritet skulle ge en ANNAN mood, lessons "invariant-test-vars-fixtur-
// kollapsar-operatorn"), (b) totaliteten (varje giltig Scoreline ger en mood), och (c)
// SKARVEN: moodFromScoreline körd på ett RIKTIGT derivePoolFacit (källans Scoreline-form),
// inte en handrullad konsument-form, så en form-drift i facit rödnar.

import { describe, expect, it } from 'vitest';
import {
  moodFromScoreline,
  GOALFEST_TOTAL,
  COMFORTABLE_MARGIN,
  type MatchMood,
} from './match-mood';
import { derivePoolFacit } from '../../features/leaderboard/derive-facit';
import { WC2026_GROUPS, WC2026_TEAM_BASES } from '../wc2026/team-refs';
import { WC2026_MATCHES } from '../wc2026/matches';
import type { Team, Match } from '../../domain/types';

describe('moodFromScoreline (utfalls-klassning, diskriminerande fixturer)', () => {
  // Varje rad: ett resultat valt så att FEL tröskel/prioritet skulle ge en annan mood.
  const cases: { score: { homeGoals: number; awayGoals: number }; expected: MatchMood }[] = [
    // Målfest: 5 totalt (precis GOALFEST_TOTAL). En 3-2 (margin 1, båda mål) vore annars
    // 'thriller' , det är prioritets-ordningen vi bevisar (målfest FÖRE thriller).
    { score: { homeGoals: 3, awayGoals: 2 }, expected: 'goalfest' },
    { score: { homeGoals: 4, awayGoals: 1 }, expected: 'goalfest' },
    // Mållöst vs oavgjort med mål (skiljer 0-0 från 1-1, inte samma gren).
    { score: { homeGoals: 0, awayGoals: 0 }, expected: 'goalless' },
    { score: { homeGoals: 2, awayGoals: 2 }, expected: 'draw' },
    // Klar seger: margin 3 (precis COMFORTABLE_MARGIN), total 3 (< målfest). En 3-0.
    { score: { homeGoals: 3, awayGoals: 0 }, expected: 'comfortable' },
    // Rafflande: margin 1, BÅDA gjorde mål, total 3 (< målfest). En 2-1.
    { score: { homeGoals: 2, awayGoals: 1 }, expected: 'thriller' },
    // Knapp/mållåst seger: margin 1-2 men förloraren gjorde 0 mål (inte thriller). 1-0, 2-0.
    { score: { homeGoals: 1, awayGoals: 0 }, expected: 'narrow' },
    { score: { homeGoals: 2, awayGoals: 0 }, expected: 'narrow' },
  ];

  for (const { score, expected } of cases) {
    it(`${score.homeGoals}-${score.awayGoals} -> ${expected}`, () => {
      expect(moodFromScoreline(score)).toBe(expected);
    });
  }

  it('tröskel-konstanterna är de förväntade (gränsen gissas inte)', () => {
    expect(GOALFEST_TOTAL).toBe(5);
    expect(COMFORTABLE_MARGIN).toBe(3);
  });

  it('prioritet: en 4-3 (margin 1, båda mål) klassas som målfest, INTE thriller', () => {
    // Diskriminerande för prioritets-ordningen: om målfest INTE gick före thriller skulle
    // detta bli 'thriller'. Bevisar VAL-invarianten (lessons om kollapsad operator).
    expect(moodFromScoreline({ homeGoals: 4, awayGoals: 3 })).toBe('goalfest');
  });

  it('är total: alla rimliga målställningar ger en (definierad) mood', () => {
    for (let h = 0; h <= 6; h++) {
      for (let a = 0; a <= 6; a++) {
        expect(moodFromScoreline({ homeGoals: h, awayGoals: a })).toBeTypeOf('string');
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * SKARVEN mot RIKTIGT facit (källans Scoreline-form, inte en handrullad konsument-form).
 * ------------------------------------------------------------------ */

describe('skarv mot derivePoolFacit (källans form)', () => {
  const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    group: b.group,
  }));

  it('moodFromScoreline läser facit.matches[i].actual utan mappning (form-drift rödnar)', () => {
    // En grupp A-match satt till 5-1 (en KÄND målfest). Vi går via derivePoolFacit, så om
    // facit-formen (actual: Scoreline) driftar bryts detta i stället för att tyst falla
    // till default-moodet. Det är skarven, inte en happy-path-fixtur.
    const matches: Match[] = WC2026_MATCHES.map((m): Match => {
      if (m.stage === 'group' && m.groupId === 'A') {
        return { ...m, status: 'finished', result: { homeGoals: 5, awayGoals: 1 } };
      }
      return m;
    });
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, matches);
    expect(facit.matches.length).toBeGreaterThan(0);
    for (const m of facit.matches) {
      // Alla satta till 5-1 -> total 6 -> målfest. Om actual inte vore Scoreline skulle
      // moodFromScoreline ge NaN-baserat skräp -> inte 'goalfest'.
      expect(moodFromScoreline(m.actual)).toBe('goalfest');
    }
  });
});
