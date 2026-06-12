// Tester för käll-detaljens rad-härledning (T58, #99). FOKUS: raderna täcker alla fyra
// källor i rätt ordning, läser värdena TROGET ur bySource, och radernas summa === totalen
// (mutations-vakt: detaljen kan aldrig motsäga summeringen överst).

import { describe, expect, it } from 'vitest';
import { buildSourceBreakdownRows } from './source-breakdown-rows';
import {
  scoreMemberBreakdown,
  type MemberPredictions,
  type ScoreBySource,
} from './aggregate-scores';
import { CHAMPION_SLOT_ID } from './derive-facit';
import type { PoolFacit } from './derive-facit';
import { asTeamCode, type TeamCode } from '../../domain/team-code';

function code(c: string): TeamCode {
  return asTeamCode(c);
}

describe('buildSourceBreakdownRows', () => {
  const bySource: ScoreBySource = { match: 3, group: 5, bracket: 1, champion: 20 };

  it('ger fyra rader i visnings-ordning: match, grupp, slutspel, VM-vinnare', () => {
    const rows = buildSourceBreakdownRows(bySource);
    expect(rows.map((r) => r.id)).toEqual(['match', 'group', 'bracket', 'champion']);
  });

  it('läser varje källas poäng TROGET ur bySource (ingen omräkning)', () => {
    const rows = buildSourceBreakdownRows(bySource);
    expect(rows.map((r) => r.points)).toEqual([3, 5, 1, 20]);
  });

  it('bär klartext-etiketter i svenska (matchar Daniels källnamn)', () => {
    const rows = buildSourceBreakdownRows(bySource);
    expect(rows.map((r) => r.label)).toEqual([
      'Matchtips',
      'Grupptippning',
      'Slutspelsträd',
      'VM-vinnare',
    ]);
  });

  // MUTATIONS-VAKT (HARD, #99): radernas summa MÅSTE vara totalen. Vi härleder bySource
  // ur scoreMemberBreakdown (samma väg som topplistan) och bevisar att detaljraderna
  // summerar till exakt den totalen, så käll-detaljen aldrig kan drifta från summeringen.
  it('radernas summa === scoreMemberBreakdown.total (käll-detalj == totalen)', () => {
    const facit: PoolFacit = {
      matches: [{ matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } }],
      groups: [
        { groupId: 'A', actual: { winnerTeamId: code('MEX'), runnerUpTeamId: code('KOR') } },
      ],
      bracketSlots: [{ slotId: 'M73', stage: 'round-of-32', advancingTeam: code('BRA') }],
      champion: code('ARG'),
    };
    const preds: MemberPredictions = {
      userId: 'u1',
      matchPredictions: [
        { matchId: 'g-A-1', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
      ],
      groupPredictions: [
        {
          groupId: 'A',
          userId: 'u1',
          winnerTeamId: code('MEX'),
          runnerUpTeamId: code('KOR'),
          updatedAt: '',
        },
      ],
      bracketPredictions: [
        { slotId: 'M73', userId: 'u1', advancingTeamId: code('BRA'), updatedAt: '' },
        { slotId: CHAMPION_SLOT_ID, userId: 'u1', advancingTeamId: code('ARG'), updatedAt: '' },
      ],
    };
    const { bySource: derived, total } = scoreMemberBreakdown(preds, facit);
    const rows = buildSourceBreakdownRows(derived);
    const rowsSum = rows.reduce((sum, r) => sum + r.points, 0);
    expect(rowsSum).toBe(total);
    expect(rowsSum).toBe(29);
  });

  it('alla källor 0 ger fyra 0-rader (summa 0)', () => {
    const rows = buildSourceBreakdownRows({ match: 0, group: 0, bracket: 0, champion: 0 });
    expect(rows.every((r) => r.points === 0)).toBe(true);
    expect(rows.reduce((s, r) => s + r.points, 0)).toBe(0);
  });
});
