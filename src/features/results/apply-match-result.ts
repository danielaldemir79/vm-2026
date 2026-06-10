// Tillämpa en validerad resultatinmatning på matchlistan (REN funktion).
//
// Detta är skrivlagret i T6:s härledda-state-arkitektur: den enda sanningen är
// matchlistan, tabeller/träd HÄRLEDS ur den (SPEC §6). En inmatning ska därför
// ge en NY matchlista (immutabelt), inte mutera den gamla, så att React ser en
// ny referens och de härledda vyerna (useGroupData -> deriveGroupTables) räknar
// om automatiskt. Funktionen är ren och React-fri så den enhetstestas fristående.
//
// VARFÖR separat från store och validering: store äger I/O + React-state,
// valideringen äger fel-vägen, denna modul äger STATE-TRANSITIONEN (gammal lista
// + edit -> ny lista) med rätt diskriminerad Match-form. Tre små ansvar i stället
// för en stor (SOLID, en fil ett ansvar).

import type { Match } from '../../domain/types';
import type { ResultEntry } from './validate-result';
import { toMatchResult, validateResultEntry } from './validate-result';

/** Bara de fält som är gemensamma för alla Match-varianter (utan status/result). */
type MatchCommon = Omit<Match, 'status' | 'result'>;

/**
 * Plocka bort status/result ur en match och behåll resten. Undviker en
 * destructuring-rest (`const { status, result, ...rest }`) vars oanvända
 * bindningar bryter mot noUnusedLocals; här bygger vi de gemensamma fälten
 * explicit, vilket också är robust om ett nytt gemensamt fält tillkommer
 * (TS failar då här tills det adderats, i stället för att tyst tappa det).
 */
function toCommon(match: Match): MatchCommon {
  return {
    id: match.id,
    stage: match.stage,
    groupId: match.groupId,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    kickoff: match.kickoff,
    venue: match.venue,
    tvChannel: match.tvChannel,
    trivia: match.trivia,
  };
}

/**
 * Bygg den nya, diskriminerat korrekta Match ur de gemensamma fälten + den
 * inmatade statusen/resultatet. Att gå via Match-unionen (inte ett spread över
 * den gamla matchen) garanterar att en 'scheduled'/'live'-match ALDRIG bär ett
 * resultat och att en 'finished'-match ALLTID gör det, även om status ändras
 * (t.ex. backa finished -> live ska nolla resultatet, inte lämna det kvar).
 */
function buildMatch(common: MatchCommon, entry: ResultEntry): Match {
  if (entry.status === 'finished') {
    return { ...common, status: 'finished', result: toMatchResult(entry) };
  }
  if (entry.status === 'live') {
    return { ...common, status: 'live', result: null };
  }
  return { ...common, status: 'scheduled', result: null };
}

/**
 * Tillämpa en resultatinmatning på matchen med id `matchId` i `matches`.
 *
 * VALIDERAR först (fail loud, PRINCIPLES §8): en ogiltig inmatning (negativa mål,
 * finished utan resultat, ogiltig övergång) KASTAR med ett tydligt fel i stället
 * för att tyst producera en trasig matchlista. Anroparen (store-mutatorn) har
 * redan validerat för UI:t, men denna koll är det sista skyddsnätet så ett
 * felaktigt programflöde aldrig korrumperar den enda sanningen.
 *
 * @returns En NY array (samma ordning) där bara den träffade matchen bytts ut.
 *          Övriga element behåller sin referens. Ett okänt matchId kastar (en
 *          inmatning mot en match som inte finns är ett programmeringsfel).
 */
export function applyMatchResult(
  matches: readonly Match[],
  matchId: string,
  entry: ResultEntry
): Match[] {
  const target = matches.find((m) => m.id === matchId);
  if (!target) {
    throw new Error(`applyMatchResult: ingen match med id "${matchId}" finns i listan.`);
  }

  // Stage med: en slutspelsmatch med lika ordinarie ställning kräver straffar
  // (FIFA Article 14), vilket valideringen bara kan avgöra med matchens stage.
  const validation = validateResultEntry(target.status, entry, target.stage);
  if (!validation.ok) {
    // Samla fel-koderna i meddelandet så ett brutet flöde är spårbart i loggen.
    const codes = validation.errors.map((e) => e.code).join(', ');
    throw new Error(`applyMatchResult: ogiltig inmatning för match "${matchId}" (${codes}).`);
  }

  // Plocka ut de gemensamma fälten utan status/result, så buildMatch sätter den
  // diskriminerade formen från grunden (ingen stale result-rest vid status-backning).
  const common = toCommon(target);
  const updated = buildMatch(common, entry);

  return matches.map((m) => (m.id === matchId ? updated : m));
}
