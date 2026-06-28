// AUTO-MAPPNING: koppla en live-fixture (API-Football) till appens match-id UTAN att
// någon rad behöver seedas för hand i fixture_match_map. Pollaren kör denna för varje
// live-fixture som SAKNAR en rad i fixture_match_map; en entydig träff insertas, en
// tvetydig eller saknad träff HOPPAS och loggas (gissa ALDRIG en koppling).
//
// REN + testbar (ingen IO, ingen Date.now): in = live-fixtures lag-id + kickoff +
// matchplanen, ut = en resolution (resolved/unresolved + reason). Edge-pollaren
// (Deno, deployar bara functions-trädet) importerar inte src/, så samma logik
// speglas i `supabase/functions/_shared/livescore-core.ts` (resolveFixtureToMatch),
// synk-märkt , medvetna kopior, inte två sanningar.
//
// STRATEGI (gissar aldrig):
//   - GRUPPMATCH (schemarad MED lag): översätt fixturens API-team-id -> app-id via
//     bryggan (OMVÄNT), hitta schemarad vars {home,away} matchar PARET (oavsett
//     hemma/borta-ordning) OCH vars kickoff ligger inom ett rimligt fönster. Exakt
//     EN träff -> resolved. Noll/flera -> unresolved (hoppas + loggas).
//   - SLUTSPELSMATCH (schemarad UTAN lag, null tills seedat): kan inte lag-matchas.
//     En RIKTIG slutspelsmatch har dock KÄNDA lag (de spelade gruppspel), så den faller
//     in i lag-par-grenen utan träff , då matchas den på sin UNIKA avsparkstid mot en
//     oseedad slutspels-rad inom fönstret (slutspel ligger >=3,5 h isär, fönstret fångar
//     som mest en). Är BÅDA lagen okända i bryggan matchas på EXAKT kickoff om den är unik.
//     Noll/flera kandidater -> unresolved (gissa aldrig).
//
// Samma identitets-anda som resolveAppMatch (Bit 1), men driven av matchplanen
// (match_id + kickoff + app-lag-id) i stället för hela Match-objektet, så den kan
// delas med edge-funktionen via den inbäddade kompakta planen (embedded-match-plan).

import { resolveAppTeamId } from './team-bridge';

/**
 * En kompakt schemarad: appens match-id + kickoff + lag-paret (app-lag-id). Lagen är
 * null för slutspelsmatcher (M73-M104) tills seedningen löst dem. Detta är formen som
 * bäddas in i edge-funktionen (embedded-match-plan), genererad ur WC2026_MATCHES.
 */
export interface MatchPlanEntry {
  matchId: string;
  /** Avspark i ISO 8601 (UTC). */
  kickoffUtc: string;
  /** Hemmalag (app-lag-id), null i oseedat slutspel. */
  homeAppId: string | null;
  /** Bortalag (app-lag-id), null i oseedat slutspel. */
  awayAppId: string | null;
}

/** En live-fixture som ska auto-mappas (det pollaren har ur live=all). */
export interface LiveFixtureRef {
  apiFixtureId: number;
  homeTeamApiId: number;
  awayTeamApiId: number;
  /** Avspark i ISO 8601 (UTC). */
  kickoffUtc: string;
}

/** Resultatet av ett auto-mappnings-försök. Diskriminerad union, fail-loud-vänlig. */
export type FixtureMapResolution =
  | { kind: 'resolved'; appMatchId: string; apiFixtureId: number }
  | { kind: 'unresolved'; apiFixtureId: number; reason: string };

/**
 * Hur nära i tid en live-fixtures avspark måste ligga schemaradens kickoff. Samma
 * resonemang som resolve-match.ts KICKOFF_MATCH_WINDOW_MS: TV-tablå vs API kan drifta
 * några minuter, men VM-matcher ligger normalt minst 3 h isär, så ett par timmar är
 * rymligt nog för drift men snävt nog att inte fånga nästa avspark.
 */
export const AUTO_MAP_KICKOFF_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Tids-skillnaden i ms mellan två ISO-instanter, eller null om någon är ogiltig. */
function kickoffDeltaMs(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return null;
  }
  return Math.abs(a - b);
}

/** Sant om schemaradens lag-par matchar app-paret (hemma/borta ELLER omvänt). */
function teamPairMatches(entry: MatchPlanEntry, appHome: string, appAway: string): boolean {
  if (entry.homeAppId === null || entry.awayAppId === null) {
    return false; // oseedad slutspelsrad kan inte lag-matchas
  }
  const sameOrder = entry.homeAppId === appHome && entry.awayAppId === appAway;
  const swapped = entry.homeAppId === appAway && entry.awayAppId === appHome;
  return sameOrder || swapped;
}

/**
 * Auto-mappa EN live-fixture till en schemarad. Returnerar 'resolved' bara vid EXAKT
 * en entydig träff , annars 'unresolved' med en läsbar orsak (gissa aldrig).
 *
 * @param fixture  live-fixturen (API-lag-id + kickoff).
 * @param plan     matchplanen (kompakta schemarader, default-injiceras av anroparen).
 * @param windowMs kickoff-fönstret för gruppmatcher (default AUTO_MAP_KICKOFF_WINDOW_MS).
 */
export function resolveFixtureToMatch(
  fixture: LiveFixtureRef,
  plan: readonly MatchPlanEntry[],
  windowMs: number = AUTO_MAP_KICKOFF_WINDOW_MS
): FixtureMapResolution {
  const appHome = resolveAppTeamId(fixture.homeTeamApiId);
  const appAway = resolveAppTeamId(fixture.awayTeamApiId);

  // --- Fall 1: båda lagen i bryggan -> GRUPPMATCH-matchning (lag-par + kickoff) ---
  if (appHome !== null && appAway !== null) {
    const candidates = plan.filter((entry) => {
      if (!teamPairMatches(entry, appHome, appAway)) {
        return false;
      }
      const delta = kickoffDeltaMs(entry.kickoffUtc, fixture.kickoffUtc);
      return delta !== null && delta <= windowMs;
    });
    if (candidates.length === 1) {
      return {
        kind: 'resolved',
        appMatchId: candidates[0].matchId,
        apiFixtureId: fixture.apiFixtureId,
      };
    }
    if (candidates.length === 0) {
      // FALLBACK , OSEEDAT SLUTSPEL: en känd-lags slutspelsmatch (båda lagen spelade
      // gruppspel, så de finns i bryggan) vars bracket-plats ÄNNU är oseedad. M73-M104
      // bär null lag tills seedningen fyllt dem, så lag-paret ovan kan aldrig matcha en
      // null-lags-rad , men fixturens UNIKA avsparkstid identifierar slutspels-platsen
      // entydigt. Slutspels-raderna ligger minst 3,5 h isär i planen (källa: matches.ts
      // M73-M104, låst i invariant-testet), så ett 2h-fönster fångar som mest EN oseedad
      // rad. Mappa på tid OM exakt en oseedad rad ligger i fönstret; 0 eller >1 -> gissa
      // ALDRIG, behåll unresolved. Detta är den AVSEDDA "slutspel mappas på unik
      // avsparkstid"-logiken (se modul-headern), bara felgrindad tidigare. Se docs/decisions.md.
      const unseededKnockout = plan.filter((entry) => {
        if (entry.homeAppId !== null || entry.awayAppId !== null) {
          return false; // bara HELT oseedade slutspels-rader (grupprader har alltid lag)
        }
        const delta = kickoffDeltaMs(entry.kickoffUtc, fixture.kickoffUtc);
        return delta !== null && delta <= windowMs;
      });
      if (unseededKnockout.length === 1) {
        return {
          kind: 'resolved',
          appMatchId: unseededKnockout[0].matchId,
          apiFixtureId: fixture.apiFixtureId,
        };
      }
      if (unseededKnockout.length > 1) {
        return {
          kind: 'unresolved',
          apiFixtureId: fixture.apiFixtureId,
          reason: `tvetydigt: ${unseededKnockout.length} oseedade slutspels-rader inom kickoff-fönstret för lag ${appHome}/${appAway} (${fixture.kickoffUtc})`,
        };
      }
      return {
        kind: 'unresolved',
        apiFixtureId: fixture.apiFixtureId,
        reason: `ingen schemarad med lag ${appHome}/${appAway} eller oseedad slutspels-plats inom kickoff-fönstret (${fixture.kickoffUtc})`,
      };
    }
    return {
      kind: 'unresolved',
      apiFixtureId: fixture.apiFixtureId,
      reason: `tvetydigt: ${candidates.length} schemarader matchar lag ${appHome}/${appAway} inom fönstret`,
    };
  }

  // --- Fall 2: BÅDA lagen okända -> SLUTSPELS-matchning på EXAKT unik kickoff ---
  // Bara en HELT oseedad slutspelsmatch (båda lag null i API:t = okända id) får
  // matchas på enbart tid. Är BARA ETT lag okänt är det en gruppmatch/seedad match
  // vars koppling vi INTE kan bekräfta via bryggan -> unresolved (gissa ALDRIG en
  // koppling bara för att tiden råkar stämma, då kunde vi mappa fel match).
  if (appHome !== null || appAway !== null) {
    const known = appHome ?? appAway;
    return {
      kind: 'unresolved',
      apiFixtureId: fixture.apiFixtureId,
      reason:
        `ett lag känt (${known}) men det andra saknas i bryggan ` +
        `(API-id ${fixture.homeTeamApiId}/${fixture.awayTeamApiId}); kan inte bekräfta kopplingen`,
    };
  }

  // Här är båda lagen okända (oseedat slutspel). Kräv en EXAKT kickoff-träff som
  // dessutom är UNIK i planen, annars gissar vi (unresolved).
  const exactKickoffMatches = plan.filter((entry) => {
    const delta = kickoffDeltaMs(entry.kickoffUtc, fixture.kickoffUtc);
    return delta === 0;
  });
  if (exactKickoffMatches.length === 1) {
    return {
      kind: 'resolved',
      appMatchId: exactKickoffMatches[0].matchId,
      apiFixtureId: fixture.apiFixtureId,
    };
  }
  if (exactKickoffMatches.length === 0) {
    return {
      kind: 'unresolved',
      apiFixtureId: fixture.apiFixtureId,
      reason:
        `lag saknas i bryggan (API-id ${fixture.homeTeamApiId}/${fixture.awayTeamApiId}) ` +
        `och ingen schemarad med exakt kickoff ${fixture.kickoffUtc}`,
    };
  }
  return {
    kind: 'unresolved',
    apiFixtureId: fixture.apiFixtureId,
    reason: `tvetydigt: ${exactKickoffMatches.length} schemarader har exakt kickoff ${fixture.kickoffUtc}`,
  };
}
