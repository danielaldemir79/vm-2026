// PRODUCENT-FORMNINGEN för frysta livescore-snapshots (skarven mot läs-lagret).
//
// SKARV-BUGGEN (Bit 3a fann den): pollarens freeze sparade tidigare blobbarna som
// BARA arrayen ur `fixtures?id`-svaret (`events: rich.events ?? null`), men läs-
// lagrets parsers (parseEvents/parseStatistics/parseLineups, parse-live.ts) vill ha
// API:ts KUVERT-form `{ response: [...], errors: [] }` , de kallar
// `requireResponseArray(payload)` som läser `payload.response` + `payload.errors`.
// En array i stället för ett kuvert -> parsern kastar -> sektionen blir tom (en
// frusen match hade visats utan events/statistik/laguppställning).
//
// FIXEN (denna modul, REN + testbar): linda varje array i ett RawApiResponse-kuvert
// vid lagring, så producent-formen (det pollaren skriver) exakt matchar konsument-
// formen (det läs-lagret tar). Edge-pollaren importerar inte src/, så denna logik
// speglas i `supabase/functions/_shared/livescore-core.ts` (wrapApiEnvelope),
// synk-märkt , de är medvetna kopior, inte två sanningar.
//
// KÄLLHÄNVISAD form (gissas ALDRIG): `fixtures?id=<id>` returnerar events/statistics/
// lineups INLINE som arrayer på response[0] (verifierat mot riktig data, ned-jpn gav
// 17 events/2 statistics/2 lineups; samma inline-form i __fixtures__/fixture-aet-pen.json:
// response[0].events/.statistics/.lineups). Att linda dem sparar 3 separata endpoint-
// anrop , fixtures?id har allt. Kuvert-formen är källhänvisad i live-read.ts +
// docs/decisions.md 2026-06-15 (det läs-lagret förväntar sig). Se decisions.md 2026-06-15.

import type { RawApiResponse } from './api-football-types';

/**
 * Linda en array (eller null) i ett minimalt RawApiResponse-KUVERT, exakt den form
 * läs-lagrets parsers (requireResponseArray) tar. En null/undefined array (blobben
 * saknas i svaret) lindas som ett tomt kuvert (`response: []`), så läs-lagret ger
 * en tom sektion i stället för att kasta , aldrig en gissad/påhittad post.
 *
 * `errors: []` (tom array) signalerar "inget fel", samma kontrakt som API-Football
 * och requireResponseArray (icke-tom errors => fail loud). `get`/`results` sätts så
 * kuvertet är en komplett, ärlig spegling av API-formen (results = antal poster).
 *
 * @param items  den INLINE-arrayen ur fixtures?id-svaret (rich.events/.statistics/.lineups).
 * @param get    endpoint-etiketten för kuvertets `get`-fält (spårbarhet, default 'fixtures').
 */
export function wrapApiEnvelope<T>(
  items: readonly T[] | null | undefined,
  get = 'fixtures'
): RawApiResponse<T> {
  const response = Array.isArray(items) ? [...items] : [];
  return {
    get,
    results: response.length,
    response,
    errors: [],
  };
}

/** De tre rika blobbarna en frusen snapshot bär, var och en kuvert-lindad för läs-lagret. */
export interface FrozenRichBlobs {
  events: RawApiResponse<unknown>;
  statistics: RawApiResponse<unknown>;
  lineups: RawApiResponse<unknown>;
}

/** Den INLINE-formen fixtures?id-svaret bär (arrayer direkt på response[0]). */
export interface RichFixtureInline {
  events?: readonly unknown[] | null;
  statistics?: readonly unknown[] | null;
  lineups?: readonly unknown[] | null;
}

/**
 * Forma de tre rika blobbarna för LAGRING (freeze): ta de inline-arrayer
 * fixtures?id-svaret bär (rich.events/.statistics/.lineups) och linda var och en i
 * ett kuvert. Resultatet är EXAKT vad läs-lagret (projectLiveData/parseBlob) kan
 * parsa , skarven producent->konsument hålls av denna enda funktion.
 *
 * @param rich  response[0] ur ett fixtures?id-svar (en avgjord match).
 */
export function shapeFrozenBlobs(rich: RichFixtureInline): FrozenRichBlobs {
  return {
    events: wrapApiEnvelope(rich.events ?? [], 'fixtures/events'),
    statistics: wrapApiEnvelope(rich.statistics ?? [], 'fixtures/statistics'),
    lineups: wrapApiEnvelope(rich.lineups ?? [], 'fixtures/lineups'),
  };
}
