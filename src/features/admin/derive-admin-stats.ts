// Härled admin-överblicken (T45, #76): kombinera per-rum-statistiken + de AVSLÖJADE
// tipsen + det PUBLIKA globala facit till (a) en rum-lista med medlemmar/engagemang
// och (b) topplistor , per rum OCH en global "vem tippar bäst" över hela ligan.
// REN funktion, inget I/O, ingen React, fristående testbar.
//
// ============================================================================
// EN SANNING FÖR POÄNGEN (HARD): vi RÄKNAR INTE om poänglogiken. Vi delegerar till
// den redan testade buildLeaderboard (aggregate-scores.ts), exakt som rummens egen
// topplista (T17). Servern (admin_revealed_predictions) levererar bara den SÄKRA
// delmängden (tips vars deadline passerat, samma gräns som RLS), och facit är det
// PUBLIKA globala facit (derivePoolFacit). Admin ser alltså aldrig en poäng räknad
// på ett hemligt tips, och aldrig en parallell poäng-motor som kan drifta.
//
// LAG-IDENTITET: tipsen är CODE (versal, DB-constraint ^[A-Z]{3}$ + RPC ger code).
// buildLeaderboard/derive-facit hanterar code<->id-seamen (T16 F1). Vi brandar
// CODE-strängarna via asTeamCode vid gränsen (betrodd intern källa, DB-validerad).
// ============================================================================

import type { Group, Team, Match } from '../../domain/types';
import { asTeamCode } from '../../domain/team-code';
import type { AdminRoomStat, AdminRevealedPrediction } from '../../data/admin';
import type { Prediction, GroupPrediction, BracketPrediction } from '../../data/predictions';
import { derivePoolFacit } from '../leaderboard/derive-facit';
import {
  buildLeaderboard,
  type LeaderboardEntry,
  type MemberPredictions,
} from '../leaderboard/aggregate-scores';

/** En rum-rad i admin-överblicken: rummets statistik + dess egen topplista. */
export interface AdminRoomOverview {
  roomId: string;
  name: string;
  code: string;
  createdAt: string;
  memberCount: number;
  matchPredictionCount: number;
  groupPredictionCount: number;
  bracketPredictionCount: number;
  /** Rummets topplista (medlemmar rangordnade mot facit). Tom medlemslista -> tom. */
  leaderboard: LeaderboardEntry[];
}

/** En rad i den GLOBALA "vem tippar bäst": en (rum, medlem)-post över hela ligan. */
export interface GlobalTipsterEntry {
  userId: string;
  displayName: string;
  /** Vilket rum posten gäller (samma person kan finnas i flera rum med olika tips). */
  roomId: string;
  roomName: string;
  points: number;
  /** Antal exakta match-träffar (3-poängare), tiebreak-måttet. */
  exactHits: number;
  /** 1-baserad global placering (delad vid lika poäng). */
  rank: number;
}

/** Hela admin-överblicken: ligastatistik + per-rum-topplistor + global topplista. */
export interface AdminStatsOverview {
  /** Totalt antal rum i hela appen. */
  totalRooms: number;
  /**
   * Totalt antal UNIKA tippare (distinkta user_id över alla rum). En person i flera
   * rum räknas EN gång (det är "hur många människor använder appen", inte rum-poster).
   */
  totalTipsters: number;
  /** Per-rum-överblicken (sorterad: nyaste/störst först är design-frontends val). */
  rooms: AdminRoomOverview[];
  /** Global "vem tippar bäst" (alla (rum, medlem)-poster, högsta poäng först). */
  topTipsters: GlobalTipsterEntry[];
}

/* ------------------------------------------------------------------ *
 * Gruppera avslöjade tips per (rum, medlem) för poäng-motorn.
 * ------------------------------------------------------------------ */

/**
 * Bygg en Map roomId -> (Map userId -> MemberPredictions) ur de avslöjade tipsen.
 * Tipsen projiceras till EXAKT de former buildLeaderboard tar (Prediction/
 * GroupPrediction/BracketPrediction), code:n brandas via asTeamCode (DB-validerad).
 */
function groupRevealedByRoomUser(
  revealed: readonly AdminRevealedPrediction[]
): Map<string, Map<string, MemberPredictions>> {
  const byRoom = new Map<string, Map<string, MemberPredictions>>();

  const ensure = (roomId: string, userId: string): MemberPredictions => {
    let users = byRoom.get(roomId);
    if (!users) {
      users = new Map();
      byRoom.set(roomId, users);
    }
    let member = users.get(userId);
    if (!member) {
      member = { userId, matchPredictions: [], groupPredictions: [], bracketPredictions: [] };
      users.set(userId, member);
    }
    return member;
  };

  for (const tip of revealed) {
    const member = ensure(tip.roomId, tip.userId);
    if (tip.kind === 'match') {
      const p: Prediction = {
        matchId: tip.matchId,
        userId: tip.userId,
        homeGoals: tip.homeGoals,
        awayGoals: tip.awayGoals,
        // updatedAt används inte i poängsättningen; en stabil platshållare räcker.
        updatedAt: '',
      };
      (member.matchPredictions as Prediction[]).push(p);
    } else if (tip.kind === 'group') {
      const p: GroupPrediction = {
        groupId: tip.groupId,
        userId: tip.userId,
        winnerTeamId: asTeamCode(tip.winnerTeamId),
        runnerUpTeamId: asTeamCode(tip.runnerUpTeamId),
        updatedAt: '',
      };
      (member.groupPredictions as GroupPrediction[]).push(p);
    } else {
      const p: BracketPrediction = {
        slotId: tip.slotId,
        userId: tip.userId,
        advancingTeamId: asTeamCode(tip.advancingTeamId),
        updatedAt: '',
      };
      (member.bracketPredictions as BracketPrediction[]).push(p);
    }
  }

  return byRoom;
}

/* ------------------------------------------------------------------ *
 * Global rangordning (delad placering, samma 1224-stil som topplistan).
 * ------------------------------------------------------------------ */

/**
 * Sortera + tilldela DELAD global placering till (rum, medlem)-posterna. Samma
 * regler som rummens topplista (aggregate-scores.compareEntries/assignRanks):
 * poäng fallande, sedan fler exakta träffar, sedan namn (sv) , och lika POÄNG ger
 * samma rank (1224-stilen). Vi återskapar regeln här eftersom dessa rader är en
 * ANNAN entitet (rum+medlem-poster), men låser oss till SAMMA ordnings-/rank-regel.
 */
function rankGlobal(lines: readonly Omit<GlobalTipsterEntry, 'rank'>[]): GlobalTipsterEntry[] {
  const sorted = [...lines].sort((a, b) => {
    if (a.points !== b.points) {
      return b.points - a.points;
    }
    if (a.exactHits !== b.exactHits) {
      return b.exactHits - a.exactHits;
    }
    return a.displayName.localeCompare(b.displayName, 'sv');
  });

  const entries: GlobalTipsterEntry[] = [];
  let previousPoints: number | null = null;
  let currentRank = 0;
  sorted.forEach((line, index) => {
    if (previousPoints === null || line.points !== previousPoints) {
      currentRank = index + 1;
      previousPoints = line.points;
    }
    entries.push({ ...line, rank: currentRank });
  });
  return entries;
}

/* ------------------------------------------------------------------ *
 * Publik härledning.
 * ------------------------------------------------------------------ */

/**
 * Härled hela admin-överblicken ur server-statistiken + avslöjade tips + facit.
 *
 * @param roomStats  per-rum-statistiken (admin_room_stats), grupperad per rum.
 * @param revealed   de AVSLÖJADE tipsen över alla rum (admin_revealed_predictions).
 * @param teams      lag-listan (för facit-härledningen + id->code-mappningen).
 * @param groups     grupperna (för grupp-/bracket-facit).
 * @param matches    den globala matchlistan MED officiella facit invävt (poäng-källan).
 */
export function deriveAdminStats(
  roomStats: readonly AdminRoomStat[],
  revealed: readonly AdminRevealedPrediction[],
  teams: readonly Team[],
  groups: readonly Group[],
  matches: readonly Match[]
): AdminStatsOverview {
  const facit = derivePoolFacit(teams, groups, matches);
  const revealedByRoomUser = groupRevealedByRoomUser(revealed);

  const rooms: AdminRoomOverview[] = roomStats.map((room) => {
    const members = room.members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
    }));
    const preds = revealedByRoomUser.get(room.roomId) ?? new Map<string, MemberPredictions>();
    return {
      roomId: room.roomId,
      name: room.name,
      code: room.code,
      createdAt: room.createdAt,
      memberCount: room.memberCount,
      matchPredictionCount: room.matchPredictionCount,
      groupPredictionCount: room.groupPredictionCount,
      bracketPredictionCount: room.bracketPredictionCount,
      // Rummets egen topplista, samma motor som T17 (en sanning).
      leaderboard: buildLeaderboard(members, preds, facit),
    };
  });

  // Global "vem tippar bäst": platta ut varje rums topplista till (rum, medlem)-rader
  // och rangordna globalt. Vi återanvänder rummens redan poängsatta rader (ingen
  // omräkning), bara en global sortering + delad rank ovanpå.
  const globalLines = rooms.flatMap((room) =>
    room.leaderboard.map((entry) => ({
      userId: entry.userId,
      displayName: entry.displayName,
      roomId: room.roomId,
      roomName: room.name,
      points: entry.points,
      exactHits: entry.exactHits,
    }))
  );

  // Unika tippare (distinkta user_id över alla rum): "hur många människor", inte poster.
  const uniqueTipsters = new Set<string>();
  for (const room of roomStats) {
    for (const m of room.members) {
      uniqueTipsters.add(m.userId);
    }
  }

  return {
    totalRooms: roomStats.length,
    totalTipsters: uniqueTipsters.size,
    rooms,
    topTipsters: rankGlobal(globalLines),
  };
}
