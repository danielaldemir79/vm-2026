// Tester för STREAK- + MÄRKES-härledningen (T19, #19). Bevisar reglerna OCH deras
// fel-vägar/edge-fall: streak bryts korrekt, exakt-träff-kravet, den NEGATIVA skräll-
// kontrollen (ingen skräll-badge på en favorit-vinst), perfekt-omgång-tröskeln.

import { describe, expect, it } from 'vitest';
import type { Match, Team } from '../../domain/types';
import type { Prediction } from '../../data/predictions';
import { deriveMemberBadges, PERFECT_ROUND_MIN_MATCHES } from './derive-badges';

// ---- Testdata-fabriker (minsta giltiga former) -------------------------------

const USER = 'u1';

/** Två lag med FIFA-ranking: BRA bäst (1), BIH sämre (70). Lägre tal = bättre. */
const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A', fifaRanking: 1 },
  { id: 'bih', name: 'Bosnien', code: 'BIH', group: 'A', fifaRanking: 70 },
  { id: 'arg', name: 'Argentina', code: 'ARG', group: 'B', fifaRanking: 2 },
  { id: 'fra', name: 'Frankrike', code: 'FRA', group: 'B', fifaRanking: 3 },
  // Ett lag UTAN ranking (för fail-safe-testet).
  { id: 'xxx', name: 'Okändia', code: 'XXX', group: 'C' },
  { id: 'yyy', name: 'Testland', code: 'YYY', group: 'C', fifaRanking: 50 },
];

function finished(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  homeGoals: number,
  awayGoals: number,
  kickoff: string
): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId,
    awayTeamId,
    kickoff,
    venue: 'Test Arena',
    status: 'finished',
    result: { homeGoals, awayGoals },
  };
}

function scheduled(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'bra',
    awayTeamId: 'bih',
    kickoff,
    venue: 'Test Arena',
    status: 'scheduled',
    result: null,
  };
}

function tip(matchId: string, homeGoals: number, awayGoals: number): Prediction {
  return { matchId, userId: USER, homeGoals, awayGoals, updatedAt: '2026-06-01T00:00:00.000Z' };
}

// ---- STREAK ------------------------------------------------------------------

describe('deriveMemberBadges, streak', () => {
  it('räknar nuvarande + längsta streak av raka rätt-tips i avsparks-ordning', () => {
    // Tre matcher i tid: rätt (exakt), rätt (utfall), rätt (exakt) -> streak 3.
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-11T18:00:00Z'),
      finished('g-A-2', 'arg', 'fra', 1, 0, '2026-06-12T18:00:00Z'),
      finished('g-A-3', 'bra', 'arg', 3, 1, '2026-06-13T18:00:00Z'),
    ];
    const preds = [
      tip('g-A-1', 2, 0),
      tip('g-A-2', 2, 1) /* rätt utfall, ej exakt */,
      tip('g-A-3', 3, 1),
    ];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.streak).toEqual({ current: 3, longest: 3 });
  });

  it('BRYTER streaken på en miss och nollställer nuvarande, men behåller längsta', () => {
    // rätt, rätt, MISS, rätt -> längsta 2, nuvarande 1.
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-11T18:00:00Z'),
      finished('g-A-2', 'arg', 'fra', 1, 0, '2026-06-12T18:00:00Z'),
      finished('g-A-3', 'bra', 'arg', 0, 2, '2026-06-13T18:00:00Z'), // facit borta-vinst
      finished('g-A-4', 'bra', 'fra', 1, 0, '2026-06-14T18:00:00Z'),
    ];
    const preds = [
      tip('g-A-1', 2, 0), // rätt
      tip('g-A-2', 1, 0), // rätt
      tip('g-A-3', 2, 0), // MISS (tippade hemmavinst, blev borta)
      tip('g-A-4', 1, 0), // rätt
    ];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.streak).toEqual({ current: 1, longest: 2 });
  });

  it('nuvarande streak = 0 när SENASTE avgjorda matchen var en miss', () => {
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-11T18:00:00Z'),
      finished('g-A-2', 'arg', 'fra', 0, 2, '2026-06-12T18:00:00Z'),
    ];
    const preds = [tip('g-A-1', 2, 0) /* rätt */, tip('g-A-2', 2, 0) /* miss */];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.streak).toEqual({ current: 0, longest: 1 });
  });

  it('ignorerar OAVGJORDA matcher och OTIPPADE matcher (inga länkar i streaken)', () => {
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-11T18:00:00Z'),
      scheduled('g-A-2', '2026-06-12T18:00:00Z'), // ej avgjord
      finished('g-A-3', 'bra', 'arg', 1, 0, '2026-06-13T18:00:00Z'), // OTIPPAD
    ];
    const preds = [tip('g-A-1', 2, 0)]; // bara g-A-1 tippad
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.streak).toEqual({ current: 1, longest: 1 });
  });

  it('streak är 0/0 utan några avgjorda tips', () => {
    const badges = deriveMemberBadges([], [scheduled('g-A-1', '2026-06-12T18:00:00Z')], TEAMS);
    expect(badges.streak).toEqual({ current: 0, longest: 0 });
  });
});

// ---- KALLADE SKRÄLLEN --------------------------------------------------------

describe('deriveMemberBadges, kallade skrällen', () => {
  it('GES när exakt-träff på match där tippad vinnare var SÄMRE rankad och vann', () => {
    // BIH (rank 70) slår BRA (rank 1) med 2-1, medlemmen tippade EXAKT 2-1 (BIH-vinst).
    const matches = [finished('g-A-1', 'bih', 'bra', 2, 1, '2026-06-11T18:00:00Z')];
    const preds = [tip('g-A-1', 2, 1)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.calledUpset).toBe(true);
  });

  it('NEGATIV: GES INTE på en FAVORIT-vinst (bättre rankad vann), även med exakt-träff', () => {
    // BRA (rank 1) slår BIH (rank 70) 2-0, exakt tippat. Favoriten vann -> ingen skräll.
    const matches = [finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-11T18:00:00Z')];
    const preds = [tip('g-A-1', 2, 0)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.calledUpset).toBe(false);
  });

  it('NEGATIV: GES INTE på RÄTT UTFALL utan exakt resultat, även om det var en skräll', () => {
    // BIH (70) slår BRA (1) 2-1, men medlemmen tippade 1-0 (rätt utfall BIH-vinst, ej exakt).
    const matches = [finished('g-A-1', 'bih', 'bra', 2, 1, '2026-06-11T18:00:00Z')];
    const preds = [tip('g-A-1', 1, 0)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.calledUpset).toBe(false);
  });

  it('FAIL-SAFE: GES INTE när ett lag saknar FIFA-ranking (ingen underdog-gissning)', () => {
    // XXX (ingen ranking) slår YYY (50) 1-0, exakt tippat. Ranking okänd -> ingen skräll.
    const matches = [finished('g-C-1', 'xxx', 'yyy', 1, 0, '2026-06-11T18:00:00Z')];
    const preds = [tip('g-C-1', 1, 0)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.calledUpset).toBe(false);
  });
});

// ---- PERFEKT OMGÅNG ----------------------------------------------------------

describe('deriveMemberBadges, perfekt omgång', () => {
  it('GES när alla tippade (>=2) matcher SAMMA svenska dag gav poäng', () => {
    // Två matcher 2026-06-12 (svensk tid), båda rätt.
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-12T16:00:00Z'),
      finished('g-A-2', 'arg', 'fra', 1, 0, '2026-06-12T19:00:00Z'),
    ];
    const preds = [tip('g-A-1', 2, 0), tip('g-A-2', 1, 0)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.perfectRound).toBe(true);
  });

  it('GES INTE när bara EN match tippades den dagen (under tröskeln)', () => {
    expect(PERFECT_ROUND_MIN_MATCHES).toBe(2);
    const matches = [finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-12T16:00:00Z')];
    const preds = [tip('g-A-1', 2, 0)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.perfectRound).toBe(false);
  });

  it('GES INTE när en av dagens tippade matcher var en MISS', () => {
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-12T16:00:00Z'),
      finished('g-A-2', 'arg', 'fra', 0, 2, '2026-06-12T19:00:00Z'), // borta-vinst
    ];
    const preds = [tip('g-A-1', 2, 0) /* rätt */, tip('g-A-2', 2, 0) /* miss */];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.perfectRound).toBe(false);
  });

  it('kräver att dagens tippade matcher är AVGJORDA (en oavgjord dag räknas inte)', () => {
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-12T16:00:00Z'),
      scheduled('g-A-2', '2026-06-12T19:00:00Z'), // ej avgjord -> bara 1 avgjort tips den dagen
    ];
    const preds = [tip('g-A-1', 2, 0), tip('g-A-2', 1, 0)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.perfectRound).toBe(false); // bara 1 avgjort, under tröskeln
  });

  it('hanterar svensk midnatts-gräns: en match strax före midnatt UTC tillhör nästa svenska dag', () => {
    // 2026-06-12T22:30Z = 2026-06-13 00:30 svensk sommartid (CEST). De två matcherna nedan
    // ligger då på OLIKA svenska dagar, så de bildar inte en perfekt omgång ihop.
    const matches = [
      finished('g-A-1', 'bra', 'bih', 2, 0, '2026-06-12T18:00:00Z'), // 12 juni svensk
      finished('g-A-2', 'arg', 'fra', 1, 0, '2026-06-12T22:30:00Z'), // 13 juni svensk
    ];
    const preds = [tip('g-A-1', 2, 0), tip('g-A-2', 1, 0)];
    const badges = deriveMemberBadges(preds, matches, TEAMS);
    expect(badges.perfectRound).toBe(false); // 1 match per svensk dag, ingen når tröskeln
  });
});
