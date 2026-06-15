// Tester för DEMO-fixtures (T82 del 3, #173; RÄTTVIS modell T90, #183). Bevisar att demon
// producerar en FYLLD, realistisk total: ~240 deltagare, spridda poäng, INGEN bot toppar
// (spelaren är 1:a), och att fixtures uppfyller KÄLLANS schema-typer (RoomMember +
// MemberPredictions), så de matar aggregeringen utan en mappnings-drift (lessons: fixtures
// mot källans schema).
//
// T90 (#183): demon kör NU den RÄTTVISA modellen (bästa rum, inte summa) , SAMMA aggregering
// (buildTotalLeaderboard) som live-vägen. Vi bevisar SEAM-en: spelaren är injicerad i flera
// demo-rum med IDENTISKA tips, och får då EXAKT samma poäng som av sitt enskilda bästa rum
// (antal rum ger ingen fördel, precis som live). Det är just det fixtures-vs-live-seam som
// annars kan dölja en rättvise-bugg (lessons: bevisa skarven).

import { describe, expect, it } from 'vitest';
import { buildDemoTotalContributions, DEMO_SELF_USER_ID } from './demo-total-fixtures';
import { buildLeaderboard } from '../leaderboard';
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

  it('RÄTTVIST: spelaren är i FLERA rum men får sitt BÄSTA enskilda rums poäng (ingen rum-antals-fördel)', () => {
    // Spelaren är injicerad i flera demo-rum. Beräkna spelarens poäng i VARJE rum hen är med
    // i, ta MAX, och bekräfta att den globala raden bär exakt det (inte en summa). Detta är
    // fixtures-vägens motsvarighet till live-fairness-testet , samma rättvise-regel i båda.
    const selfRoomScores = demo.rooms
      .filter((r) => r.members.some((m) => m.userId === DEMO_SELF_USER_ID))
      .map((r) => {
        const board = buildLeaderboard(r.members, r.predictionsByUser, demo.facit);
        return board.find((e) => e.userId === DEMO_SELF_USER_ID)!.points;
      });
    expect(selfRoomScores.length).toBeGreaterThanOrEqual(2); // injicerad i flera rum
    const bestSingleRoom = Math.max(...selfRoomScores);
    const sumOfRooms = selfRoomScores.reduce((a, b) => a + b, 0);
    const self = total.find((e) => e.userId === DEMO_SELF_USER_ID);
    expect(self).toBeDefined();
    // Global poäng = bästa rum, INTE summan (diskriminerande: summan > bästa när >1 rum ger poäng).
    expect(self!.points).toBe(bestSingleRoom);
    expect(self!.points).toBeLessThan(sumOfRooms);
  });

  it('deriveTotalSelfSummary ger en hjälte-sammanfattning för demo-spelaren', () => {
    const summary = deriveTotalSelfSummary(total, demo.currentUserId);
    expect(summary).not.toBeNull();
    expect(summary!.rank).toBe(1);
    expect(summary!.totalParticipants).toBe(total.length);
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
