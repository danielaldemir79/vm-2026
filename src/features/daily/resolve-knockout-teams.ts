// Lös knockout-matchernas lag i den DAGLIGA matchvyn (2026-06-28, Daniels fråga
// "varför står det Ej klart, de är ju klara").
//
// VARFÖR: slutspelsmatchernas lag (homeTeamId/awayTeamId) är null i den seedade
// matchlistan tills T4-seedningen fyllt dem. Slutspelsträdet (deriveBracket) HÄRLEDER
// dem reaktivt ur grupp-ställningen, men den dagliga vyn läste matchlistan rakt av och
// visade därför "Ej klart" för knockout-matcher ÄVEN efter att grupperna avgjorts. Den
// här rena funktionen lägger samma härledning som trädet OVANPÅ matchlistan: för en
// slutspelsmatch vars BÅDA lag är slutgiltigt RESOLVED (grupperna färdigspelade +
// seedade, eller en föregångar-match avgjord) fyller vi i de riktiga lag-id:na, så
// Idag-vyn visar de faktiska lagen (med flaggor) i stället för "Ej klart".
//
// ÄRLIGT: BARA 'resolved' (slutgiltigt) övervägs, ALDRIG 'preliminary' (nuvarande
// ledare under gruppspelet). Idag-kortet har ingen "nuvarande ställning"-märkning, så
// att visa ett preliminärt lag där vore ett falskt facit. Under gruppspelet förblir
// knockout-matcher därför "Ej klart" här (sant: lagen är inte avgjorda än); det LEVANDE,
// ärligt märkta läget bor i trädet (Turnering). Kräver alltså att gruppresultaten är
// inmatade (admin-facit) , då, och bara då, blir slotarna resolved och lagen syns.
//
// REN funktion (ingen React, inget I/O), enhetstestbar fristående, körs memoiserat i
// hooken. Importerar bara de RENA härledningarna (deriveGroupTables + deriveBracket),
// inga React-/vy-moduler, så ingen cirkulär feature-koppling uppstår (derive-bracket
// importerar inte daily).

import type { Group, Match } from '../../domain/types';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { deriveBracket, type BracketState } from '../bracket/derive-bracket';

/**
 * REN overlay: givet matchlistan + ett HÄRLETT slutspelsträd, fyll i lag-id:n på de
 * slutspelsmatcher vars BÅDA slots är slutgiltigt RESOLVED. Skild från härledningen så
 * den kan testas med ett handbyggt träd-tillstånd (bevisar att SENARE rundor fylls).
 *
 * INKREMENTELLT (Daniels krav 2026-06-28): varje match behandlas FÖR SIG , en
 * åttondels-/kvarts-/semi-/final-match fylls SÅ FORT dess två lag är kända (dess feeders
 * avgjorda), oberoende av om andra matcher i samma runda är klara. Vi väntar alltså
 * ALDRIG på att hela rundan ska bli klar. (deriveBracket sätter en match-progressions-
 * slot till 'resolved' i samma stund dess feeder-match fått ett utfall, så kedjan
 * r32 -> r16 -> kvart -> semi -> final löses match för match.)
 */
export function overlayResolvedKnockoutTeams(
  matches: readonly Match[],
  bracket: BracketState
): readonly Match[] {
  const resolvedById = new Map<string, { home: string; away: string }>();
  for (const m of bracket.matches) {
    if (
      m.home.resolution === 'resolved' &&
      m.away.resolution === 'resolved' &&
      m.home.teamId !== null &&
      m.away.teamId !== null
    ) {
      resolvedById.set(m.matchId, { home: m.home.teamId, away: m.away.teamId });
    }
  }

  // Inget upplöst (t.ex. gruppspelet pågår, eller resultat ej inmatade) -> identitet.
  if (resolvedById.size === 0) {
    return matches;
  }

  return matches.map((match) => {
    // Bara slutspelsmatcher UTAN redan ifyllda lag berörs; gruppmatcher orörda.
    if (match.stage === 'group' || (match.homeTeamId !== null && match.awayTeamId !== null)) {
      return match;
    }
    const resolved = resolvedById.get(match.id);
    if (!resolved) {
      return match;
    }
    return { ...match, homeTeamId: resolved.home, awayTeamId: resolved.away };
  });
}

/**
 * Returnerar matchlistan där slutspelsmatcher med BÅDA lag slutgiltigt kända har fått
 * sina riktiga lag-id:n ifyllda (annars oförändrade). Gruppmatcher och redan ifyllda
 * matcher rörs aldrig. Returnerar samma referens när inget kunde lösas (vanligt under
 * gruppspelet), så React-memoisering inte triggar i onödan.
 */
export function resolveKnockoutTeams(
  groups: readonly Group[],
  matches: readonly Match[]
): readonly Match[] {
  // Härled trädet (samma sanning som Turnering-vyn), lägg sedan dess resolved-lag
  // ovanpå matchlistan via den rena overlayn ovan.
  const tables = deriveGroupTables(groups, matches);
  const bracket = deriveBracket(tables, matches);
  return overlayResolvedKnockoutTeams(matches, bracket);
}
