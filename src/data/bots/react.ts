// Reaktions-generator för bot-liv-lagret (T82 del 2, #173). REN, deterministisk, inget I/O.
//
// SYFTE: givet en persona + matchlista + facit, producera emoji-REAKTIONER (room_reactions)
// som får rummet att kännas levande UTAN att spamma. Reaktioner är liv-lagrets PRIMÄRA,
// billiga signal (en knapptryckning, ingen text): är en kommentar inte naturlig är det
// bättre att boten bara reagerar (ägarens regel: hellre tyst/en emoji än spammig text).
//
// MODELL (speglar schemat, gissas inte , migrationen 20260612160000_t24_room_reactions):
//   * EN reaktion per (rum, användare, match): PK (room_id, user_id, match_id). Vi
//     itererar varje match EN gång per bot, så en bot kan aldrig få två reaktioner på
//     samma match (samma invariant som PK:n, bevisad i react.test.ts).
//   * emoji LÅST till den kurerade 8-listan (room_reactions_emoji_allowed-CHECK). Vi
//     speglar klientens REACTION_EMOJIS (reactions-api.ts) som EN sanning , väljer aldrig
//     en emoji utanför listan (annars nekar DB:ns CHECK skrivningen, fail loud).
//   * match_id är matchens id ur den statiska planen (samma format-CHECK som tipsen).
//
// KADENS (diskret): en bot reagerar på en match med sannolikhet `reactionChance` (0..0.5,
// satt MÅTTLIGT i personas.ts). Spritt: olika botar reagerar på olika matcher (seed per
// persona.index), inte alla på allt. EMOJI-VALET styrs av matchens MOOD (react på utfallet,
// målfest -> ⚽/🎉, mållöst -> 🧊 osv.), med en ton-nyans, så reaktionerna känns menade.
//
// KOHORT-SCOPNING (samma som tipsen, predict.ts): new-room reagerar på SPELADE matcher
// (de "var med"); vm2026/fsu reagerar bara på KOMMANDE matcher (de har inte sett facit än,
// och en reaktion på en match de inte tippat skulle se konstig ut). Kommande matcher har
// ingen mood (inget facit) -> en neutral "het match"-reaktion (🔥), inte en utfalls-emoji.

import { createRng, type Rng } from './prng';
import type { BotPersona } from './personas';
import type { Match } from '../../domain/types';
import type { PoolFacit } from '../../features/leaderboard/derive-facit';
import { REACTION_EMOJIS, type ReactionEmoji } from '../rooms/reactions-api';
import { moodFromScoreline, type MatchMood } from './match-mood';

/** En planerad reaktion (user_id/room_id sätts vid exekvering, samma anda som tipsen). */
export interface PlannedReaction {
  /** Matchen reaktionen sitter på (id ur den statiska planen). */
  matchId: string;
  /** Den valda emojin (en av de 8 i REACTION_EMOJIS, DB-CHECK-säker). */
  emoji: ReactionEmoji;
}

/**
 * Emoji-PALETT per mood: en liten viktad lista ur den kurerade 8-listan. Reaktionen
 * speglar utfallet (en målfest får jubel-emojier, ett mållöst möte en iskall). Vi väljer
 * ALLTID ur REACTION_EMOJIS (en sanning med DB-CHECK:en), aldrig en egen sträng.
 *
 * `null`-grenen (kommande match, inget facit) hanteras separat (🔥, "het match").
 */
const MOOD_EMOJIS: Record<MatchMood, readonly ReactionEmoji[]> = {
  // Målfest: jubel + fotboll. ⚽ mål, 🎉 fira, 🔥 het.
  goalfest: ['⚽', '🎉', '🔥', '⚽'],
  // Mållöst: iskallt/avgjort lugn, en uttråkad humor-knorr.
  goalless: ['🧊', '😂', '🧊'],
  // Oavgjort med mål: rättvist, lite humor.
  draw: ['😂', '👏', '🧊'],
  // Rafflande: chock + applåd, det satt.
  thriller: ['😱', '🔥', '👏', '😱'],
  // Klar seger: applåd för bra spel, lite sorg för förloraren.
  comfortable: ['👏', '⚽', '😭'],
  // Knapp seger: applåd, en gnutta nerv.
  narrow: ['👏', '🔥', '😱'],
};

/** Reaktion på en KOMMANDE match (inget facit än): "het match"-förväntan, inte ett utfall. */
const UPCOMING_EMOJI: ReactionEmoji = '🔥';

/**
 * Ton-nyans: vissa toner drar mot vissa emojier. Liten påverkan (en extra dragning mot
 * tonens favorit), så personligheten SYNS utan att överstyra mood:en. Skämtsam drar mot
 * 😂, peppig mot 🎉, lugn mot 🧊, analytisk mot 👏 (saklig respekt).
 */
const TONE_FAVORITE: Record<BotPersona['personality']['tone'], ReactionEmoji> = {
  skämtsam: '😂',
  peppig: '🎉',
  lugn: '🧊',
  analytisk: '👏',
};

/**
 * Generera en bots reaktioner deterministiskt. `now`-fri och I/O-fri: vilka matcher som
 * är spelade avgörs HELT av facit (samma modell som predict.ts), så funktionen är testbar.
 *
 * @param persona  boten (reactionChance + tone + index + kohort).
 * @param matches  hela matchlistan (för match-id + vilka lag som är kända).
 * @param facit    facit (vad som spelats + ställningen, för mood).
 * @returns        botens planerade reaktioner (kan vara tom: en lågbenägen bot reagerar inte).
 */
export function generateBotReactions(
  persona: BotPersona,
  matches: readonly Match[],
  facit: PoolFacit
): PlannedReaction[] {
  // Egen seed-rymd per bot (skild från tips-seeden 0x9e3779b9 så reaktioner och tips inte
  // korrelerar inom samma bot). XOR med index ger oberoende följder mellan botar.
  const rng = createRng(0x85ebca6b ^ persona.index);
  const facitByMatch = new Map(facit.matches.map((f) => [f.matchId, f]));
  const reactsOnPlayed = persona.cohort === 'new-room';

  const out: PlannedReaction[] = [];
  for (const match of matches) {
    // Bara matcher där båda lag är kända (slutspel före seedning har null-lag, går ej att
    // reagera meningsfullt på , samma skydd som tipsen).
    if (match.homeTeamId === null || match.awayTeamId === null) {
      continue;
    }
    const facitMatch = facitByMatch.get(match.id);
    const isPlayed = facitMatch !== undefined;

    // KOHORT-SCOPNING: new-room reagerar på spelade matcher, vm2026/fsu bara på kommande.
    if (isPlayed !== reactsOnPlayed) {
      continue;
    }

    // KADENS: reagerar boten på just den här matchen? En dragning mot reactionChance.
    // (Dras FÖRST, så emoji-dragningarna inte förskjuter beslutet , stabil determinism.)
    if (rng() >= persona.personality.reactionChance) {
      continue;
    }

    const emoji = isPlayed
      ? pickMoodEmoji(rng, moodFromScoreline(facitMatch.actual), persona.personality.tone)
      : UPCOMING_EMOJI;
    out.push({ matchId: match.id, emoji });
  }
  return out;
}

/**
 * Välj en emoji för en mood, med en liten ton-nyans. Två dragningar: en ur mood-paletten,
 * och med en låg sannolikhet ton-favoriten i stället (om den hör hemma i mood:en eller är
 * en allmänt rimlig krydda). Alltid en giltig REACTION_EMOJI (DB-CHECK-säker).
 */
function pickMoodEmoji(
  rng: Rng,
  mood: MatchMood,
  tone: BotPersona['personality']['tone']
): ReactionEmoji {
  const palette = MOOD_EMOJIS[mood];
  const base = palette[Math.floor(rng() * palette.length)];
  // ~20 % chans att tonen färgar valet (men bara om favoriten är en av de 8 , den ÄR det
  // per typen TONE_FAVORITE, så detta kan aldrig välja en otillåten emoji).
  if (rng() < 0.2) {
    return TONE_FAVORITE[tone];
  }
  return base;
}

/** Är emojin garanterat en av de tillåtna 8? (intern invariant-vakt, används i test.) */
export function isAllowedReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}
