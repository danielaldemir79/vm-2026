// Tester för DEMO-fixtures (T82 del 3, #173). Bevisar att demon producerar en FYLLD,
// realistisk total: ~240 deltagare, spridda poäng, INGEN bot toppar (spelaren är 1:a),
// och att fixtures uppfyller KÄLLANS schema-typer (RoomMember + MemberPredictions), så de
// matar aggregeringen utan en mappnings-drift (lessons: fixtures mot källans schema).

import { describe, expect, it } from 'vitest';
import { buildDemoTotalContributions, DEMO_SELF_USER_ID } from './demo-total-fixtures';
import { buildTotalLeaderboard, deriveTotalSelfSummary } from './aggregate-total';

describe('buildDemoTotalContributions', () => {
  const demo = buildDemoTotalContributions();
  const total = buildTotalLeaderboard(demo.rooms, demo.facit);

  it('producerar ~240 distinkta deltagare över flera rum', () => {
    // Bot-fördelningen är ~240 + demo-spelaren. Vi accepterar ett band (deterministiskt,
    // men det exakta talet beror på dubletter över rum); bara att det är en STOR lista.
    expect(total.length).toBeGreaterThan(220);
    expect(total.length).toBeLessThan(260);
    expect(demo.rooms.length).toBeGreaterThan(10); // många rum (20 nya + kohort-rum)
  });

  it('sprider poängen (inte alla samma), och INGEN bot toppar (spelaren är 1:a)', () => {
    const points = total.map((e) => e.points);
    const distinct = new Set(points).size;
    expect(distinct).toBeGreaterThan(10); // tydlig spridning, inte en platt vägg
    // Spelaren (currentUserId) ska vara 1:a , bot-taket (capAccuracy 0.62) håller botar
    // under en stark spelare (T82 del 1), så atmosfär-botarna aldrig går om en riktig.
    expect(total[0].userId).toBe(demo.currentUserId);
    expect(total[0].userId).toBe(DEMO_SELF_USER_ID);
  });

  it('spelaren är med i FLERA rum (summan över rum demonstreras)', () => {
    const self = total.find((e) => e.userId === DEMO_SELF_USER_ID);
    expect(self).toBeDefined();
    expect(self!.roomCount).toBeGreaterThanOrEqual(2);
  });

  it('deriveTotalSelfSummary ger en hjälte-sammanfattning för demo-spelaren', () => {
    const summary = deriveTotalSelfSummary(total, demo.currentUserId);
    expect(summary).not.toBeNull();
    expect(summary!.rank).toBe(1);
    expect(summary!.totalParticipants).toBe(total.length);
    expect(summary!.roomCount).toBeGreaterThanOrEqual(2);
    expect(summary!.points).toBeGreaterThan(0);
  });

  it('är DETERMINISTISK (samma seed -> samma total)', () => {
    const again = buildDemoTotalContributions();
    const totalAgain = buildTotalLeaderboard(again.rooms, again.facit);
    expect(totalAgain.map((e) => [e.userId, e.points, e.rank])).toEqual(
      total.map((e) => [e.userId, e.points, e.rank])
    );
  });

  it('rum-bidragen uppfyller KÄLLANS schema (RoomMember + MemberPredictions med userId-stämplade tips)', () => {
    const room = demo.rooms[0];
    // RoomMember-form: userId + displayName.
    expect(room.members[0]).toMatchObject({
      userId: expect.any(String),
      displayName: expect.any(String),
    });
    // MemberPredictions-form: tips-raderna bär RÄTT userId (inte tomt '' som bot-motorn
    // genererar), annars kan aggregeringen inte keya dem , just den mappnings-skarven.
    const firstMember = room.members[0];
    const preds = room.predictionsByUser.get(firstMember.userId);
    expect(preds).toBeDefined();
    for (const p of preds!.matchPredictions) {
      expect(p.userId).toBe(firstMember.userId);
    }
  });
});
