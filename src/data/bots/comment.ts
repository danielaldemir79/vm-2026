// Kommentars-generator för bot-liv-lagret (T82 del 2, #173). REN, deterministisk, inget I/O.
//
// SYFTE: producera room_comments SPARSAMT, så rummet känns levande utan att spamma. Detta
// är liv-lagrets KRYDDA (reaktioner är primärt + billigt, react.ts); kommentarer ska vara
// SÄLLSYNTA och naturliga. Ägarens regel (HARD): kommenterar ibland, inte för mycket, och
// blir en kommentar inte naturlig är det BÄTTRE att boten är tyst (bara reagerar).
//
// TYSTHETS-DEFAULT (HARD, byggd som beteende + testad): en bot kommenterar en match BARA om
//   (a) den hör till new-room (de "var med" matchen och har en åsikt , vm2026/fsu har inte
//       sett facit, så de kommenterar inte spelade matcher), OCH
//   (b) en dragning < en HÅRT nedskalad sannolikhet (commentChance * COMMENT_SCALE) faller.
// Annars genereras INGEN kommentar (boten är tyst, ev. bara en reaktion). COMMENT_SCALE
// gör kommentarer mycket sällsyntare än reaktioner. Bevisat i comment.test.ts: lågbenägna
// personas i en "tråkig" (mållös) match ger 0 kommentarer, och andelen kommenterade matcher
// hålls låg (sparsamhet bevisad, inte påstådd).
//
// VARIATION (inte mekaniska mallar): fras-poolerna (comment-pools.ts) är indexerade på
// (mood, tone) med FLERA varianter per kombination. Boten väljer EN deterministiskt ur sin
// (mood, tone)-pool, så samma bot inte upprepar identisk text och två botar i olika ton om
// samma match säger olika saker.
//
// SVAR (replik-approximation): se planReplies nedan + comment-pools.ts modul-doc. Schemat
// har INGEN parent_id (bekräftat i migrationerna), så ett "svar" är en kort följd-fras i
// SAMMA match-tråd, inte en rad-till-rad-referens. Ärligt dokumenterat i decisions.md.

import { createRng, type Rng } from './prng';
import type { BotPersona } from './personas';
import type { Match } from '../../domain/types';
import type { PoolFacit } from '../../features/leaderboard/derive-facit';
import { moodFromScoreline } from './match-mood';
import { COMMENT_POOLS, REPLY_POOLS } from './comment-pools';

/** En planerad kommentar (room_id/user_id sätts vid exekvering, samma anda som tipsen). */
export interface PlannedComment {
  /** Match-tråden kommentaren hör till (match_id satt = match-tråd, T77). */
  matchId: string;
  /** Kommentar-texten (1..500 tecken, DB-CHECK , våra pooler är korta så gränsen aldrig nås). */
  body: string;
  /** Är detta en FÖLJD-fras (svar-approximation) på en annan bots kommentar i samma tråd? */
  isReply: boolean;
}

/**
 * SKALNING av kommentar-sannolikheten. commentChance är redan låg (0..0.30, personas.ts);
 * vi skalar ner den HÅRT så kommentarer blir SÄLLSYNTA (kryddan), inte var-tredje-match.
 * Källa: T82-designval (ägarens "hellre tyst än spammig"), dokumenterat i decisions.md.
 */
export const COMMENT_SCALE = 0.35;

/**
 * Andel av en bots kommentarer som (max) får bli följd-fraser i en tråd (svar-approx).
 * Hålls låg: svar ska vara SÄLLSYNTA, inte varje kommentar. Se planReplies.
 */
export const REPLY_CHANCE = 0.5;

/**
 * Generera en bots PRIMÄRA kommentarer (dess egna första inlägg i match-trådar), sparsamt.
 * Rena, deterministiska. En lågbenägen bot, eller en bot i en mood-fattig "tråkig" match,
 * ger få eller inga , det är tysthets-defaulten, byggd som beteende.
 *
 * @param persona  boten (commentChance + tone + index + kohort).
 * @param matches  matchlistan (match-id + kända lag).
 * @param facit    facit (vilka matcher spelats + ställning för mood).
 * @returns        botens primära kommentarer (ofta TOM , det är meningen).
 */
export function generateBotComments(
  persona: BotPersona,
  matches: readonly Match[],
  facit: PoolFacit
): PlannedComment[] {
  // Egen seed-rymd (skild från tips 0x9e3779b9 och reaktioner 0x85ebca6b) så kommentarer
  // inte korrelerar med en bots övriga beteende.
  const rng = createRng(0xc2b2ae35 ^ persona.index);
  const facitByMatch = new Map(facit.matches.map((f) => [f.matchId, f]));

  // TYSTHETS-DEFAULT (a): bara new-room kommenterar spelade matcher (de var med). vm2026/fsu
  // har inte sett facit -> de kommenterar inte (tysta tills matcherna spelas).
  if (persona.cohort !== 'new-room') {
    return [];
  }

  const effectiveChance = persona.personality.commentChance * COMMENT_SCALE;

  const out: PlannedComment[] = [];
  for (const match of matches) {
    if (match.homeTeamId === null || match.awayTeamId === null) {
      continue;
    }
    const facitMatch = facitByMatch.get(match.id);
    if (facitMatch === undefined) {
      continue; // bara spelade matcher har en mood att kommentera
    }

    // TYSTHETS-DEFAULT (b): dras FÖRST (stabil determinism), och bara om den faller väljs
    // en fras. Annars är boten tyst om just den här matchen.
    if (rng() >= effectiveChance) {
      continue;
    }

    const mood = moodFromScoreline(facitMatch.actual);
    const variants = COMMENT_POOLS[mood][persona.personality.tone];
    const body = variants[Math.floor(rng() * variants.length)];
    out.push({ matchId: match.id, body, isReply: false });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Svar-approximation (följd-fraser i samma match-tråd).
 * ------------------------------------------------------------------ */

/** En primär kommentar med vem som skrev den (input till svars-planeringen). */
export interface PrimaryComment {
  personaKey: string;
  persona: BotPersona;
  matchId: string;
}

/** En planerad svars-fras: vem svarar, i vilken tråd (matchId). */
export interface PlannedReply {
  personaKey: string;
  matchId: string;
  body: string;
  isReply: true;
}

/**
 * Planera SPARSAMMA svar (följd-fraser) på primära kommentarer. En "svar" är en kort
 * medhålls-fras i SAMMA match-tråd (schemat saknar parent_id, se modul-doc), så en svarande
 * bot pekar på TRÅDEN (matchId), inte en specifik rad , men den läggs BARA där minst en
 * ANNAN bot redan kommenterat, så det alltid finns något att svara på (en giltig befintlig
 * konversation, inte ett påklistrat svar i en tom tråd). Bevisat i comment.test.ts.
 *
 * Determinism: en gemensam seed (svar-rymd) + en stabil ordning (primaries in-ordning) ger
 * samma svar varje körning. Få svar (REPLY_CHANCE, och bara en svarare per tråd) , sällsynt.
 *
 * @param primaries  alla primära kommentarer (med författar-persona), i en stabil ordning.
 * @param seed       svar-rymdens seed (samma -> samma svar).
 * @returns          planerade svar (ofta få/inga , svar ska vara sällsynta).
 */
export function planReplies(primaries: readonly PrimaryComment[], seed: number): PlannedReply[] {
  const rng = createRng(0x27d4eb2f ^ seed);

  // Gruppera primära kommentarer per match-tråd (bevarad in-ordning per tråd).
  const byThread = new Map<string, PrimaryComment[]>();
  for (const c of primaries) {
    const list = byThread.get(c.matchId);
    if (list) {
      list.push(c);
    } else {
      byThread.set(c.matchId, [c]);
    }
  }

  const replies: PlannedReply[] = [];
  for (const [matchId, comments] of byThread) {
    // En tråd behöver minst TVÅ olika botar för ett naturligt svar: en som sa något, och en
    // ANNAN som kan hålla med. En tråd med bara en bots kommentar(er) får inget svar.
    const distinctAuthors = new Set(comments.map((c) => c.personaKey));
    if (distinctAuthors.size < 2) {
      continue;
    }
    // SPARSAMT: bara ibland (REPLY_CHANCE) blir det ett svar alls i tråden.
    if (rng() >= REPLY_CHANCE) {
      continue;
    }
    // Svararen = en bot som INTE var den som senast kommenterade (svarar på någon annan).
    // Vi tar en bot ur tråden vars nyckel skiljer sig från den sista kommentarens författare.
    const last = comments[comments.length - 1];
    const responder = pickResponder(rng, comments, last.personaKey);
    if (responder === null) {
      continue;
    }
    const variants = REPLY_POOLS[responder.persona.personality.tone];
    const body = variants[Math.floor(rng() * variants.length)];
    replies.push({ personaKey: responder.personaKey, matchId, body, isReply: true });
  }
  return replies;
}

/**
 * Välj en svarande bot ur trådens kommentatorer som INTE är `excludeKey` (svarar på någon
 * annan, inte sig själv). Deterministiskt. null om ingen annan finns (ska inte hända efter
 * distinctAuthors >= 2-kontrollen, men en total funktion fail-safe:ar hellre än kraschar).
 */
function pickResponder(
  rng: Rng,
  comments: readonly PrimaryComment[],
  excludeKey: string
): PrimaryComment | null {
  const candidates = comments.filter((c) => c.personaKey !== excludeKey);
  if (candidates.length === 0) {
    return null;
  }
  return candidates[Math.floor(rng() * candidates.length)];
}
