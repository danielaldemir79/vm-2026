// REN HÄRLEDNING av AVSTÄNGDA SPELARE (T99, #200). Ingen IO, inget React, ingen Date.now()
// (klockan injiceras) , rent in (alla matchers kort + den resolvade matchplanen + nu) -> rent
// ut (en post per aktiv avstängning), så reglerna är trivialt enhetstestbara (samma anda som
// scorer-table.ts / tournament-stats-events.ts).
//
// ÅTERANVÄNDNING (PRINCIPLES §4, DRY): vi parsar ALDRIG events själva. Den DELADE projektionen
// (match-stats: extractCards) äger "vad är ett kort, vilken färg, vilken spelare/lag", redan
// hårt testad. Vi AGGREGERAR bara dess utdata över matcherna och korsar den med matchplanen
// (lag-sekvens + spelad-status) , exakt som T87/T88 aggregerar kort/mål, en nivå till.
//
// INGEN NY DATAKÄLLA (Daniels direktiv): avstängningarna HÄRLEDS ur kort-datan vi redan har
// (T86 extractCards via T87 useCrossMatchEvents) + den källåkrade matchplanen. SKADOR byggs
// INTE (kräver API-Footballs injuries-endpoint = en ny låg-frekvent poll); medvetet utelämnat
// nu för att hålla det rent, se docs/decisions.md 2026-06-16 (T99).
//
// =====================================================================================
// DOMÄNREGLER , AVSTÄNGNING (KÄLLHÄNVISADE, gissas ALDRIG; lessons "lattgissad-domanregel";
// se även docs/decisions.md 2026-06-16 T99). VM 2026:s disciplinregler skiljer sig från
// tidigare VM (kort-nollställning i två steg), så de är extra lätta att gissa fel , de är
// korsverifierade mot TVÅ oberoende källor (mat-på-riktigt/korsverifiera-mot-oberoende-källa):
//   - MLSSoccer.com, "2026 FIFA World Cup yellow card and suspension rules"
//   - Yahoo/Athlon, "World Cup 2026 Yellow Card Rules: When Do Cards Reset"
//
//  S1. RÖTT KORT (utvisning) -> avstängd NÄSTA match. "If a player receives a red card ... they're
//      suspended for ... the following contest." Ett rött kort i parse-live täcker BÅDE ett
//      direkt rött OCH en utvisning för andra gult i SAMMA match (båda blir ett 'red'-event på
//      spelaren), så denna gren fångar även "två gula i en match"-utvisningen. KÄLLA: MLSSoccer.
//
//  S2. TVÅ ACKUMULERADE GULA (i SKILDA matcher) -> avstängd nästa match. "Players can ... be
//      suspended after accumulating two yellow cards across separate matches." Vi räknar därför
//      gula PER MATCH (max ett ackumulerings-gult per match per spelare, så ett "andra gult i
//      samma match" inte dubbelräknas , det är en utvisning, S1-grenen). Var 2:a ackumulerade
//      gult utlöser en ny en-matchs-avstängning. KÄLLA: MLSSoccer + Yahoo/Athlon.
//
//  S3. GUL-NOLLSTÄLLNING i TVÅ steg (VM 2026:s NYHET, lätt att gissa fel): ackumulerade gula
//      nollställs EFTER gruppspelet OCH igen EFTER kvartsfinalerna. "Following the Group Stage,
//      all yellow cards will be reset, and then reset again after the quarterfinals." En redan
//      UTLÖST avstängning raderas dock INTE av nollställningen (Yahoo: "The reset only removes
//      single pending yellows, not completed suspensions"). Vi nollställer alltså bara den
//      PENDING gul-räknaren vid steg-gränsen, aldrig en redan skapad post. KÄLLA: Yahoo/Athlon.
//      Faserna (för nollställnings-gränsen): gruppspel | {R32, R16, kvart} | {semi, brons, final}.
//
//  S4. LÄNGD = UPPSKATTAD 1 match (default). Vi VET INTE disciplinnämndens exakta beslut (ett
//      grovt rött kan ge fler matcher), så vi visar default 1 match och MÄRKER posten som
//      uppskattad i UI:t (Daniels direktiv: håll det enkelt + var tydlig att det är en
//      uppskattning). Ingen gissning om längre straff.
//
//  S5. FRÅN-MATCH + AUTO-BORT NÄR AVTJÄNAD. Avstängningen UTLÖSES i en match (den röda/2:a gula)
//      och gäller lagets NÄSTA match (kronologiskt). När den matchen är SPELAD (live, färdig,
//      eller avspark passerad relativt `nowMs`) är avstängningen AVTJÄNAD -> posten försvinner.
//      Är lagets nästa match ännu inte spelad är posten AKTIV. Saknar laget en nästa match (den
//      utlösande matchen var lagets sista) finns ingen match att avtjäna i -> ingen post (edge).
//      KÄLLA: härlett ur S1/S2 + matchplanens kronologi (gissas ej , ren tidsordning).
// =====================================================================================

import { extractCards } from '../../data/match-stats';
import type { MatchCardEvent } from '../../data/match-stats';
import type { LiveMatchEvents } from '../../data/livescore';
import { resolveAppTeamId } from '../../data/livescore';
import type { Match, MatchStage } from '../../domain/types';

/** Vad som utlöste avstängningen (för en ärlig UI-notering). */
export type SuspensionReason = 'red-card' | 'two-yellows';

/**
 * En aktiv avstängning: en spelare som (enligt vår härledning) sitter ute en kommande match.
 * EN post per (spelare, utlösande match). Auto-borttagen när matchen den gäller är spelad (S5).
 */
export interface SuspensionPost {
  /** Spelarens stabila API-id (grupperings-nyckel, samma som skytteligan). */
  playerId: number;
  /** Spelarens namn (senast sedda stavning). */
  playerName: string;
  /** Lagets app-id (gemen FIFA-kod) för flagg-disc, null när bryggan inte känner laget. */
  teamId: string | null;
  /** Lagets API-id (bevarat, för stabil nyckel även när app-id saknas). */
  teamApiId: number;
  /** Lagets namn (för visning). */
  teamName: string;
  /** Vad som utlöste avstängningen (S1/S2). */
  reason: SuspensionReason;
  /** Matchplanens id för matchen avstängningen UTLÖSTES i (den röda/2:a gula). */
  fromMatchId: string;
  /** Matchplanens id för matchen avstängningen GÄLLER (lagets nästa match efter from-matchen). */
  servesMatchId: string;
  /** Uppskattad längd i matcher (default 1, S4). Alltid uppskattad , vi vet ej nämndens beslut. */
  estimatedMatches: number;
}

/** En fas-etikett för gul-nollställningen (S3). Tre block, två nollställnings-gränser. */
type ResetPhase = 'group' | 'r32-to-quarter' | 'semi-to-final';

/**
 * Vilken nollställnings-fas ett `stage` tillhör (S3). Gruppspel; sedan {R32, R16, kvart} (gula
 * nollställs EFTER gruppspelet); sedan {semi, brons, final} (nollställs EFTER kvartsfinalerna).
 * En stängd switch så ett tillagt stage blir ett kompileringsfel i stället för en tyst miss.
 */
function resetPhaseOf(stage: MatchStage): ResetPhase {
  switch (stage) {
    case 'group':
      return 'group';
    case 'round-of-32':
    case 'round-of-16':
    case 'quarter-final':
      return 'r32-to-quarter';
    case 'semi-final':
    case 'third-place':
    case 'final':
      return 'semi-to-final';
  }
}

/** Är en match SPELAD relativt nu? Live/färdig, eller avspark passerad (S5: auto-bort-villkoret). */
function isMatchPlayed(match: Match, nowMs: number): boolean {
  if (match.status === 'live' || match.status === 'finished') {
    return true;
  }
  // En 'scheduled' match vars avspark redan passerat räknas som spelad (auto-bort-skydd även
  // när status ännu inte hunnit uppdateras , klockan är sanningen för "har den startat").
  return Date.parse(match.kickoff) <= nowMs;
}

/** En match i ETT lags kronologiska sekvens (de fält härledningen behöver). */
interface TeamMatchSlot {
  match: Match;
  phase: ResetPhase;
}

/**
 * Bygg varje lags kronologiska match-sekvens ur den resolvade matchplanen (app-id-nyckad). Ett
 * lag deltar i en match om det är hemma- ELLER bortalag (app-id). Slutspelsmatcher utan seedat
 * lag (homeTeamId/awayTeamId null) bidrar inte (laget okänt , gissa aldrig). Sorteras på
 * avspark (kronologi = den ordning avstängningar avtjänas i, S5).
 */
function buildTeamSequences(matchPlan: readonly Match[]): Map<string, TeamMatchSlot[]> {
  const byTeam = new Map<string, TeamMatchSlot[]>();
  const sorted = [...matchPlan].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  for (const match of sorted) {
    const slot: TeamMatchSlot = { match, phase: resetPhaseOf(match.stage) };
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (teamId === null) {
        continue; // oseedat slutspel , laget okänt, ingen sekvens-post
      }
      const seq = byTeam.get(teamId) ?? [];
      seq.push(slot);
      byTeam.set(teamId, seq);
    }
  }
  return byTeam;
}

/** Ett korts plats i ETT lags sekvens (vilken match-slot, så vi vet from-/nästa-match). */
interface CardInSequence {
  card: MatchCardEvent;
  /** Index i lagets kronologiska sekvens (TeamMatchSlot[]). */
  slotIndex: number;
}

/** Föränderlig per-spelare-ackumulator medan vi går igenom ett lags matcher i ordning. */
interface PlayerAcc {
  playerId: number;
  playerName: string;
  teamApiId: number;
  teamName: string;
  /** Antal PENDING ackumulerade gula sedan senaste nollställning/utlösning (S2/S3). */
  pendingYellows: number;
}

/**
 * Härled alla AKTIVA avstängningar ur korten + matchplanen + nu (S1-S5). Ren funktion.
 *
 * @param matches    events per match (useCrossMatchEvents.matches). Kort plockas via extractCards.
 * @param matchPlan  den RESOLVADE matchplanen (useResultsStore.matches): app-lag-id + status +
 *                   kickoff. Bär lag-sekvens (from-/nästa-match) + spelad-status (auto-bort).
 * @param nowMs      nuvarande tid i ms (injiceras för testbarhet, default = Date.now()).
 */
export function deriveSuspensions(
  matches: readonly LiveMatchEvents[],
  matchPlan: readonly Match[],
  nowMs: number = Date.now()
): SuspensionPost[] {
  const teamSequences = buildTeamSequences(matchPlan);
  // Snabb uppslagning: matchplanens id -> dess kronologiska index i lagets sekvens, byggs per lag.
  const posts: SuspensionPost[] = [];

  // 1) Gruppera korten per LAG (app-id) och per match-slot i lagets sekvens. Ett kort vars match
  //    inte finns i planen (t.ex. fixtures 'api-<id>' utan app-koppling) HOPPAS , vi kan inte
  //    placera det i en lag-sekvens och får aldrig gissa en from-/nästa-match (honest, lessons).
  const cardsByTeam = new Map<string, CardInSequence[]>();
  for (const { matchId, events } of matches) {
    for (const card of extractCards(events)) {
      const appTeamId = resolveAppTeamId(card.teamApiId);
      if (appTeamId === null) {
        continue; // okänt lag (ej i VM-bryggan, t.ex. en testfixtur) , gissa aldrig
      }
      const seq = teamSequences.get(appTeamId);
      if (!seq) {
        continue; // laget har ingen match i planen , kan inte placera kortet
      }
      const slotIndex = seq.findIndex((s) => s.match.id === matchId);
      if (slotIndex < 0) {
        continue; // kortets match är inte i lagets plan-sekvens (t.ex. fixtures-id) , hoppa
      }
      const list = cardsByTeam.get(appTeamId) ?? [];
      list.push({ card, slotIndex });
      cardsByTeam.set(appTeamId, list);
    }
  }

  // 2) Per lag: gå igenom matcherna i KRONOLOGISK ordning, ackumulera gula per spelare (max ett
  //    ackumulerings-gult per match), nollställ vid fas-gräns (S3), och utlös en avstängning vid
  //    rött (S1) eller var 2:a ackumulerade gult (S2). Posten gäller lagets NÄSTA match (S5).
  for (const [appTeamId, cardEntries] of cardsByTeam) {
    const seq = teamSequences.get(appTeamId);
    if (!seq) {
      continue; // försvarsdjup; cardsByTeam fylls bara för lag med en sekvens
    }
    // Gruppera kortet per match-slot, behåll matchordningen.
    const cardsBySlot = new Map<number, MatchCardEvent[]>();
    for (const { card, slotIndex } of cardEntries) {
      const arr = cardsBySlot.get(slotIndex) ?? [];
      arr.push(card);
      cardsBySlot.set(slotIndex, arr);
    }

    const byPlayer = new Map<number, PlayerAcc>();
    let prevPhase: ResetPhase | null = null;

    // Gå igenom HELA lag-sekvensen i ordning (även matcher utan kort), så fas-nollställningen
    // (S3) sker vid rätt gräns oavsett om laget fick kort den matchen.
    for (let i = 0; i < seq.length; i++) {
      const phase = seq[i].phase;
      if (prevPhase !== null && phase !== prevPhase) {
        // Fas-gräns passerad (gruppspel -> slutspel, eller kvart -> semi): nollställ PENDING gula
        // (S3). En redan UTLÖST avstängning (= redan en post) raderas INTE , vi rör bara räknaren.
        for (const acc of byPlayer.values()) {
          acc.pendingYellows = 0;
        }
      }
      prevPhase = phase;

      const cards = cardsBySlot.get(i);
      if (!cards) {
        continue; // ingen kort-händelse denna match
      }

      // Per spelare i DENNA match: räkna högst ETT ackumulerings-gult (S2), och ett rött utlöser
      // direkt (S1). Spelare utan känt id/namn hoppas (gissa aldrig, samma R3 som skytteligan).
      const yellowThisMatch = new Set<number>();
      for (const card of cards) {
        if (card.playerId === null || card.playerName === null) {
          continue;
        }
        const acc = ensurePlayer(byPlayer, card);
        if (card.color === 'red') {
          // S1: rött kort -> avstängd nästa match. (Täcker även andra-gult-utvisningen: den blir
          // ett 'red'-event på spelaren i parse-live.) Nollställ pending gula , en ny "ren tavla"
          // efter avtjänat (vi modellerar inte staplade gula ovanpå ett rött).
          acc.pendingYellows = 0;
          pushPostIfServable(posts, acc, seq, i, 'red-card', nowMs);
        } else if (!yellowThisMatch.has(acc.playerId)) {
          // S2: max ETT ackumulerings-gult per match (ett andra gult samma match är en utvisning,
          // ett 'red'-event ovan, inte ett andra ackumulerings-steg).
          yellowThisMatch.add(acc.playerId);
          acc.pendingYellows += 1;
          if (acc.pendingYellows >= 2) {
            acc.pendingYellows = 0; // avstängningen "konsumerar" de två gula (nästa par kan ge ett nytt)
            pushPostIfServable(posts, acc, seq, i, 'two-yellows', nowMs);
          }
        }
      }
    }
  }

  // Stabil, deterministisk ordning: lagnamn, sedan spelarnamn (så listan aldrig flimrar).
  posts.sort(
    (a, b) =>
      a.teamName.localeCompare(b.teamName, 'sv') ||
      a.playerName.localeCompare(b.playerName, 'sv') ||
      a.fromMatchId.localeCompare(b.fromMatchId)
  );
  return posts;
}

/** Hämta/skapa spelar-ackumulatorn (id-nyckel). Bevarar senast sedda namn/lag (renare form vinner). */
function ensurePlayer(byPlayer: Map<number, PlayerAcc>, card: MatchCardEvent): PlayerAcc {
  // Anroparen har redan garanterat playerId/playerName icke-null (vi narrowar här för typen).
  const playerId = card.playerId as number;
  const playerName = card.playerName as string;
  const existing = byPlayer.get(playerId);
  if (existing) {
    existing.playerName = playerName;
    existing.teamName = card.teamName;
    return existing;
  }
  const fresh: PlayerAcc = {
    playerId,
    playerName,
    teamApiId: card.teamApiId,
    teamName: card.teamName,
    pendingYellows: 0,
  };
  byPlayer.set(playerId, fresh);
  return fresh;
}

/**
 * Skapa en post för en utlöst avstängning OM den ännu inte är avtjänad (S5). Avstängningen
 * gäller lagets NÄSTA match efter den utlösande (slotIndex + 1). Finns ingen nästa match
 * (utlösande var lagets sista) -> ingen post. Är nästa match redan SPELAD -> avtjänad, ingen
 * post. Annars (nästa match ej spelad än) -> en AKTIV post.
 */
function pushPostIfServable(
  posts: SuspensionPost[],
  acc: PlayerAcc,
  seq: readonly TeamMatchSlot[],
  triggerIndex: number,
  reason: SuspensionReason,
  nowMs: number
): void {
  const fromMatch = seq[triggerIndex].match;
  const next = seq[triggerIndex + 1];
  if (!next) {
    return; // ingen kommande match att avtjäna i (edge: utlösande var lagets sista match)
  }
  if (isMatchPlayed(next.match, nowMs)) {
    return; // avstängningen är AVTJÄNAD (laget har spelat matchen den gällde) , auto-bort (S5)
  }
  posts.push({
    playerId: acc.playerId,
    playerName: acc.playerName,
    teamId: resolveAppTeamId(acc.teamApiId),
    teamApiId: acc.teamApiId,
    teamName: acc.teamName,
    reason,
    fromMatchId: fromMatch.id,
    servesMatchId: next.match.id,
    estimatedMatches: 1, // S4: uppskattad default, märks "uppskattad" i UI:t
  });
}
