// Skicklighets-skiktad tips-generator för bot-seedningen (T82, #173). REN,
// deterministisk, inget I/O.
//
// SYFTE: givet en persona + matchlista + (för poängsättning) facit, producera bot-tips
// (match-, grupp- och bracket-tips + mästar-tips) deterministiskt, så att:
//   * högre skill_tier => fler rätt, MEN spritt så botarna hamnar över HELA topplistan,
//   * INGEN bot toppar: ett konfigurerbart TAK håller varje bots träffsäkerhet under vad
//     en stark RIKTIG spelare rimligen når (annars skulle en bot kunna gå om vännerna),
//   * 'new-room'-botar tippar ALLT inkl. redan spelade matcher (i facit) => får poäng,
//   * 'vm2026'/'fsu'-botar tippar BARA kommande matcher (EJ i facit) => börjar på 0.
//
// HUR "RÄTT" MODELLERAS (källmedvetet, gissas inte): vi BYGGER tips genom att, per
// poängsatt enhet, med sannolikhet `accuracy` kopiera FACIT (rätt svar) och annars
// generera ett rimligt FEL. accuracy härleds ur skill_tier skalat in i ett konfigurerbart
// band [floorAccuracy, capAccuracy]. capAccuracy < 1 är TAKET: även den vassaste boten
// missar tillräckligt för att inte kunna toppa (verifierat i predict.test.ts mot en
// referens-"stark spelare"). Determinismen kommer ur en seed härledd ur persona.index,
// så samma persona + samma facit -> exakt samma tips (en sanning för planen).
//
// POÄNGSÄTTNING ÅTERANVÄNDER MOTORN (DRY, HARD): vi bygger BARA tipsen här. Hur de blir
// poäng mot facit ägs av den befintliga motorn (buildLeaderboard / scoreMemberBreakdown
// + score.ts/bonus-score.ts). predict.test.ts bevisar SKARVEN mot den riktiga motorn
// (inte en parallell poäng-beräkning), exakt lärdomen "bevisa skarven, inte happy-path".

import { createRng, randomInt, type Rng } from './prng';
import type { BotPersona } from './personas';
import type { Prediction } from '../predictions/predictions-api';
import type { GroupPrediction } from '../predictions/group-predictions-api';
import type { BracketPrediction } from '../predictions/bracket-predictions-api';
import { CHAMPION_SLOT_ID } from '../predictions/bracket-predictions-api';
import { asTeamCode, type TeamCode } from '../../domain/team-code';
import type { PoolFacit } from '../../features/leaderboard/derive-facit';
import type { Match, Group } from '../../domain/types';
import { BRACKET_MATCHES } from '../../domain/bracket/bracket-structure';

/** En bots färdiga tips i ett rum, i exakt den form aggregeringen (MemberPredictions) tar. */
export interface BotPredictions {
  matchPredictions: Prediction[];
  groupPredictions: GroupPrediction[];
  bracketPredictions: BracketPrediction[];
}

/** Konfiguration för tips-skiktningen. Default håller botar UNDER en stark spelare. */
export interface PredictConfig {
  /**
   * Lägsta träffsäkerhet (skill_tier 0). > 0 så även svaga botar prickar NÅGOT
   * (annars vore de bevisligen botar med 0 rätt). Default 0.15.
   */
  floorAccuracy: number;
  /**
   * TAKET: högsta träffsäkerhet (skill_tier 1). MÅSTE vara < 1 så ingen bot blir
   * perfekt. Satt under vad en stark riktig spelare rimligen når, så en bot aldrig
   * toppar topplistan. Default 0.62. Konfigurerbart + testat.
   */
  capAccuracy: number;
}

/** Default-skiktning: floor 0.15, TAK 0.62 (under en stark spelare, se predict.test.ts). */
export const DEFAULT_PREDICT_CONFIG: PredictConfig = {
  floorAccuracy: 0.15,
  capAccuracy: 0.62,
};

/** Stage per bracket-slot (en sanning ur strukturen, så tips bär rätt slot-id). */
const BRACKET_SLOT_IDS: readonly string[] = BRACKET_MATCHES.map((m) => m.id);

/**
 * Härled en bots träffsäkerhet ur dess skill_tier, skalad in i [floor, cap]. cap < 1
 * är taket som hindrar en bot från att toppa. Linjär: tier 0 -> floor, tier 1 -> cap.
 */
function accuracyFor(persona: BotPersona, config: PredictConfig): number {
  const span = config.capAccuracy - config.floorAccuracy;
  return config.floorAccuracy + persona.skillTier * span;
}

/**
 * Generera en bots tips. `now`-fri och I/O-fri: vilka matcher som är "spelade" avgörs
 * HELT av facit (en match i facit.matches är avgjord), inte av en klocka, så funktionen
 * är deterministisk och testbar.
 *
 * @param persona  boten (skill_tier + index för determinismen + kohort).
 * @param matches  hela matchlistan (för att veta vilka matcher/lag som finns).
 * @param groups   grupperna (för grupp-tipsen).
 * @param facit    det härledda facit (rätt svar att kopiera/avvika från + vad som spelats).
 * @param config   skiktnings-konfig (floor/cap). Default DEFAULT_PREDICT_CONFIG.
 * @returns        botens match-, grupp- och bracket-tips, scopade efter kohort.
 */
export function generateBotPredictions(
  persona: BotPersona,
  matches: readonly Match[],
  groups: readonly Group[],
  facit: PoolFacit,
  config: PredictConfig = DEFAULT_PREDICT_CONFIG
): BotPredictions {
  validateConfig(config);
  // Seed härledd ur persona.index: stabil per bot, oberoende mellan botar.
  const rng = createRng(0x9e3779b9 ^ persona.index);
  const accuracy = accuracyFor(persona, config);

  // Snabb-uppslag i facit (vad är spelat + rätt svar).
  const facitMatch = new Map(facit.matches.map((f) => [f.matchId, f]));
  const facitGroup = new Map(facit.groups.map((f) => [f.groupId, f]));
  const facitSlot = new Map(facit.bracketSlots.map((f) => [f.slotId, f]));

  // Lagkoder per grupp (för rimliga grupp-/mästar-gissningar). Code-rymden (versal).
  const codesByGroup = buildCodesByGroup(matches, groups);
  const allCodes = [...new Set([...codesByGroup.values()].flat())];

  // KOHORT-SCOPNING (krav): new-room tippar ALLT (inkl. spelat => poäng); vm2026/fsu
  // tippar BARA kommande (ej i facit => 0 poäng). `tipsPlayed` styr om de spelade
  // enheterna inkluderas.
  const tipsPlayed = persona.cohort === 'new-room';

  return {
    matchPredictions: buildMatchPredictions(rng, accuracy, matches, facitMatch, tipsPlayed),
    groupPredictions: buildGroupPredictions(
      rng,
      accuracy,
      groups,
      facitGroup,
      codesByGroup,
      tipsPlayed
    ),
    bracketPredictions: buildBracketPredictions(
      rng,
      accuracy,
      facitSlot,
      allCodes,
      facit.champion,
      tipsPlayed
    ),
  };
}

/* ------------------------------------------------------------------ *
 * Match-tips: per match, kopiera facit (rätt) eller avvik (fel) m. accuracy.
 * ------------------------------------------------------------------ */

function buildMatchPredictions(
  rng: Rng,
  accuracy: number,
  matches: readonly Match[],
  facitMatch: Map<string, PoolFacit['matches'][number]>,
  tipsPlayed: boolean
): Prediction[] {
  const out: Prediction[] = [];
  for (const match of matches) {
    // Bara matcher där båda lag är kända kan tippas (slutspel före seedning har null-lag).
    if (match.homeTeamId === null || match.awayTeamId === null) {
      continue;
    }
    const facit = facitMatch.get(match.id);
    const isPlayed = facit !== undefined;
    // Kohort-scopning: vm2026/fsu hoppar över spelade matcher (tippar bara kommande).
    if (isPlayed && !tipsPlayed) {
      continue;
    }
    const score =
      isPlayed && rng() < accuracy
        ? // Rätt: kopiera facit-ställningen (ger 3p exakt).
          { homeGoals: facit.actual.homeGoals, awayGoals: facit.actual.awayGoals }
        : // Fel ELLER kommande match (inget facit): generera en rimlig egen ställning.
          plausibleScore(rng);
    out.push({
      matchId: match.id,
      userId: '', // sätts av seed-planeraren (boten har inget user_id än)
      homeGoals: score.homeGoals,
      awayGoals: score.awayGoals,
      updatedAt: SEED_TS,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Grupp-tips: per grupp, rätt 1:a/2:a (facit) eller rimligt fel.
 * ------------------------------------------------------------------ */

function buildGroupPredictions(
  rng: Rng,
  accuracy: number,
  groups: readonly Group[],
  facitGroup: Map<string, PoolFacit['groups'][number]>,
  codesByGroup: Map<string, TeamCode[]>,
  tipsPlayed: boolean
): GroupPrediction[] {
  const out: GroupPrediction[] = [];
  for (const group of groups) {
    const facit = facitGroup.get(group.id);
    const isDecided = facit !== undefined;
    if (isDecided && !tipsPlayed) {
      continue; // vm2026/fsu tippar inte avgjorda grupper
    }
    const codes = codesByGroup.get(group.id) ?? [];
    if (codes.length < 2) {
      continue; // skydd: en grupp utan minst 2 kända lag kan inte tippas
    }
    let winner: TeamCode;
    let runnerUp: TeamCode;
    if (facit !== undefined && rng() < accuracy) {
      // Rätt: kopiera facit (ger full grupp-poäng). GroupOutcome-fälten är typade
      // `string` (bonus-score) men bär versal CODE (derive-facit mappade dit), så de
      // brandas utan re-validering (betrodd facit-gräns, samma som group-predictions-api).
      winner = asTeamCode(facit.actual.winnerTeamId);
      runnerUp = asTeamCode(facit.actual.runnerUpTeamId);
    } else {
      // Fel eller oavgjord grupp: två DISTINKTA lag ur gruppen som gissning.
      [winner, runnerUp] = pickTwoDistinct(rng, codes);
    }
    out.push({
      groupId: group.id,
      userId: '',
      winnerTeamId: winner,
      runnerUpTeamId: runnerUp,
      updatedAt: SEED_TS,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Bracket-tips: per avgjord slot rätt/fel, + mästar-tips.
 * ------------------------------------------------------------------ */

function buildBracketPredictions(
  rng: Rng,
  accuracy: number,
  facitSlot: Map<string, PoolFacit['bracketSlots'][number]>,
  allCodes: readonly TeamCode[],
  champion: TeamCode | null,
  tipsPlayed: boolean
): BracketPrediction[] {
  const out: BracketPrediction[] = [];
  for (const slotId of BRACKET_SLOT_IDS) {
    const facit = facitSlot.get(slotId);
    const isDecided = facit !== undefined;
    if (isDecided && !tipsPlayed) {
      continue; // vm2026/fsu tippar inte avgjorda slots
    }
    if (isDecided && rng() < accuracy) {
      out.push(bracketPick(slotId, facit.advancingTeam));
    } else if (allCodes.length > 0) {
      out.push(bracketPick(slotId, pickCode(rng, allCodes)));
    }
  }

  // Mästar-tipset (slot 'champion'): rätt mästare (om finalen avgjord + träff) eller gissa.
  const championDecided = champion !== null;
  if (!(championDecided && !tipsPlayed) && allCodes.length > 0) {
    const advancing = championDecided && rng() < accuracy ? champion : pickCode(rng, allCodes);
    out.push(bracketPick(CHAMPION_SLOT_ID, advancing));
  }
  return out;
}

function bracketPick(slotId: string, advancingTeamId: TeamCode): BracketPrediction {
  return { slotId, userId: '', advancingTeamId, updatedAt: SEED_TS };
}

/* ------------------------------------------------------------------ *
 * Hjälpare (rena).
 * ------------------------------------------------------------------ */

/** Fast tidsstämpel för bot-tips (de har ingen "riktig" inmatningstid). */
const SEED_TS = '2026-06-01T00:00:00.000Z';

/**
 * En rimlig egen målställning (0-3 mål per lag), för ett FEL/kommande tips. Vi håller
 * den låg och realistisk så fel-tipsen ser ut som riktiga gissningar, inte brus.
 */
function plausibleScore(rng: Rng): { homeGoals: number; awayGoals: number } {
  return { homeGoals: randomInt(rng, 0, 4), awayGoals: randomInt(rng, 0, 4) };
}

/** Lag-koder (versal CODE) per grupp ur matcherna (homeTeamId/awayTeamId är gemen id). */
function buildCodesByGroup(
  matches: readonly Match[],
  groups: readonly Group[]
): Map<string, TeamCode[]> {
  // Gruppens teamIds är gemen id; code är versal id. Vi mappar id -> CODE via versalisering
  // (samma id<->code-relation som team-code.ts: code = id.toUpperCase()). Det undviker att
  // dra in hela team-listan; relationen är garanterad (teamId(code)=code.toLowerCase()).
  const byGroup = new Map<string, TeamCode[]>();
  for (const group of groups) {
    const codes = group.teamIds.map((id) => asTeamCode(id.toUpperCase()));
    byGroup.set(group.id, codes);
  }
  // Skydd mot en grupp utan matcher i listan rör inte detta (vi går på group.teamIds).
  void matches;
  return byGroup;
}

/** Två DISTINKTA koder ur en lista (för en grupp-gissning som inte sätter samma lag två ggr). */
function pickTwoDistinct(rng: Rng, codes: readonly TeamCode[]): [TeamCode, TeamCode] {
  const first = randomInt(rng, 0, codes.length);
  let second = randomInt(rng, 0, codes.length);
  if (second === first) {
    second = (second + 1) % codes.length; // garantera distinkt
  }
  return [codes[first], codes[second]];
}

/** En kod ur en icke-tom lista (anroparen har redan kollat length > 0). */
function pickCode(rng: Rng, codes: readonly TeamCode[]): TeamCode {
  return codes[randomInt(rng, 0, codes.length)];
}

/** Fail loud på en orimlig skiktnings-config (tak ska vara < 1 och > floor). */
function validateConfig(config: PredictConfig): void {
  if (config.floorAccuracy < 0 || config.capAccuracy > 1) {
    throw new Error('[VM2026] träffsäkerhet måste ligga i [0,1].');
  }
  if (config.capAccuracy >= 1) {
    throw new Error(
      `[VM2026] capAccuracy (${config.capAccuracy}) måste vara < 1: en bot får aldrig bli ` +
        `perfekt (då kunde den toppa topplistan).`
    );
  }
  if (config.capAccuracy <= config.floorAccuracy) {
    throw new Error(
      `[VM2026] capAccuracy (${config.capAccuracy}) måste vara större än floorAccuracy ` +
        `(${config.floorAccuracy}) annars finns ingen skiktning.`
    );
  }
}
