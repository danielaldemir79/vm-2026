// Datalagrets miljö-gating (fixtures-först, SPEC §12 + Agent Kit-playbookens
// "fixtures-forst-mot-externt-cms-eller-api").
//
// EN gata väljer datakälla utifrån TVÅ villkor:
//   1. Är Supabase-env satt? (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
//   2. Är live-klienten faktiskt byggd? (LIVE_READY, se nedan)
// Live väljs bara när BÅDA är sanna. Annars fixtures, alltid med en synlig logg
// (fail loud) så övergången till live aldrig glöms bort.
//
// Varför två villkor och inte bara env (#37, hotfix): supabase-client.ts VAR en
// MEDVETEN fail-loud-stub tills T14 byggde den. Env-variablerna sattes redan i
// Cloudflare (2026-06-09) inför T14, så enbart en env-gate hade tänt live-grenen i
// produktion mot stubben -> fel-alerts i varje vy. LIVE_READY-flaggan höll smällen
// borta tills klienten fanns. T14 har nu byggt den riktiga klienten OCH flippat
// LIVE_READY = true, så live tänds när env är satt (Cloudflare). Tvåstegs-gaten
// finns kvar som princip: env utan LIVE_READY skulle fortfarande falla till fixtures.
//
// Samma kod tänds live UTAN ändring: konsumenter (T6-T11) anropar bara
// getDataSource() och får samma kontrakt (DataSource) oavsett källa. Det är
// hela poängen med fixtures-först, resten av appen byggs och testas fristående
// innan Supabase-kontot finns.
//
// INGA secrets i repot (PRINCIPLES §7): env läses via import.meta.env, värdena
// sätts i .env.local (gitignorerad) eller Cloudflare-dashboarden, aldrig i kod.

import type { Group, Match, Team } from '../domain/types';
import { fixtureGroups, fixtureMatches, fixtureTeams } from './fixtures';

/**
 * Är live-Supabase-klienten byggd och redo att användas?
 *
 * `true` sedan T14 byggt den riktiga Supabase-klienten (supabase-client.ts +
 * supabase-browser.ts + rooms-lagret). Live tänds nu när env är satt (Cloudflare).
 *
 * Konstanten är en in-kod-flagga med FLIT (inte en env-variabel): att flippa
 * den krävde en kod-ändring som gick genom review + bygge ihop med T14:s faktiska
 * klient, så live aldrig tändes av enbart en miljö-konfiguration (#37, hotfix-
 * principen). Tvåstegs-gaten består: env UTAN LIVE_READY hade fallit till fixtures.
 */
export const LIVE_READY = true;

/**
 * Kontraktet varje datakälla (fixtures eller live) uppfyller. Async med flit:
 * live-källan (Supabase) gör nätverksanrop, så signaturen är async redan i
 * fixtures-läge för att inte ändra call-sites när live tänds.
 */
export interface DataSource {
  getTeams(): Promise<Team[]>;
  getGroups(): Promise<Group[]>;
  getMatches(): Promise<Match[]>;
}

/** Vilken källa som är aktiv, exponerad så UI kan visa ett "demo-data"-märke. */
export type DataSourceMode = 'fixtures' | 'live';

/**
 * Är Supabase-miljön konfigurerad? Båda variablerna måste finnas och vara
 * icke-tomma, en halv-konfiguration (bara URL, ingen nyckel) räknas som EJ
 * konfigurerad och faller till fixtures, hellre det än ett tyst trasigt live-
 * läge. Trimmar för att inte luras av enbart whitespace.
 *
 * Detta är VILLKOR 1 av gaten (env satt). Live kräver dessutom VILLKOR 2,
 * att klienten är byggd (LIVE_READY), se isLiveActive.
 */
export function isSupabaseConfigured(env: ImportMetaEnv): boolean {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  return Boolean(url) && Boolean(key);
}

/**
 * Den SAMMANSATTA gaten: live är aktivt bara när Supabase-env är satt OCH
 * live-klienten är byggd (LIVE_READY). En enda sanning som både getDataSource
 * och getDataSourceMode läser, så källan och UI-märkningen aldrig kan säga
 * olika saker (annars hade UI:t kunnat märka demo-data som "live").
 *
 * @param liveReady  injicerbar (default LIVE_READY) så testet kan verifiera
 *                   live-grenen utan att flippa den globala konstanten (KISS).
 */
function isLiveActive(env: ImportMetaEnv, liveReady: boolean): boolean {
  return isSupabaseConfigured(env) && liveReady;
}

/** Datakälla byggd på de typade fixtures-objekten. */
function createFixtureDataSource(): DataSource {
  return {
    getTeams: () => Promise.resolve(fixtureTeams),
    getGroups: () => Promise.resolve(fixtureGroups),
    getMatches: () => Promise.resolve(fixtureMatches),
  };
}

/**
 * Datakälla mot live-Supabase. Klienten byggs i T14 (kontot finns inte än), så
 * detta är en TUNN stub bakom dynamisk import: gaten och kontraktet är på
 * plats nu, T14 fyller bara implementationen. Dynamisk import (i stället för
 * top-level) gör att Rollup inte måste lösa ett Supabase-paket som ännu inte
 * är installerat, fixtures-bygget förblir rent.
 */
function createLiveDataSource(env: ImportMetaEnv): DataSource {
  // Lat SINGLETON: skapa klienten högst EN gång per gate-instans. Den dynamiska
  // importen cachas av modulsystemet, men fabriken (createSupabaseDataSource)
  // kördes tidigare vid varje anrop, vilket skulle bygga flera klienter i T14.
  // Vi memoiserar därför PROMISEN: första anropet startar init, resten
  // återanvänder samma promise. Fail-loud bevaras: en rejected init-promise
  // förblir rejected (cachat), så ett trasigt live-läge smäller varje gång i
  // stället för att tyst maskeras.
  let clientPromise: Promise<DataSource> | null = null;
  const loadClient = (): Promise<DataSource> => {
    if (clientPromise === null) {
      clientPromise = import('./supabase-client').then((m) => m.createSupabaseDataSource(env));
    }
    return clientPromise;
  };
  return {
    getTeams: () => loadClient().then((ds) => ds.getTeams()),
    getGroups: () => loadClient().then((ds) => ds.getGroups()),
    getMatches: () => loadClient().then((ds) => ds.getMatches()),
  };
}

/**
 * Välj och returnera den aktiva datakällan utifrån gaten.
 *
 * Två fall (fail-loud, PRINCIPLES §8):
 *   - Live aktivt (env satt + LIVE_READY): live-källan, ingen logg behövs.
 *   - Annars (env saknas): fixtures + en synlig "env saknas"-varning, så att man
 *     inte tyst kör platshållar-data utan att märka det. (Interims-grenen från
 *     #37, env satt men LIVE_READY false, togs bort i T14 när LIVE_READY flippades
 *     till true; den är inte längre nåbar i produktion. Drivs den i test, t.ex.
 *     liveReady=false med env satt, faller den hit och loggar "env saknas"-formen,
 *     vilket är ett rimligt fixtures-besked.)
 *
 * @param env        import.meta.env (injiceras för testbarhet, default = riktiga).
 * @param liveReady  injicerbar live-flagga (default LIVE_READY), så fixtures-grenen
 *                   kan testas utan att flippa den globala konstanten.
 */
export function getDataSource(
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): DataSource {
  if (isLiveActive(env, liveReady)) {
    return createLiveDataSource(env);
  }
  console.warn(
    '[VM2026] Datalager kör i FIXTURES-läge (platshållar-data). ' +
      'Supabase-env saknas eller är inte aktiv (VITE_SUPABASE_URL / ' +
      'VITE_SUPABASE_ANON_KEY). Sätt dem för att växla till live.'
  );
  return createFixtureDataSource();
}

/**
 * Vilket läge som FAKTISKT är aktivt (för UI-märkning / diagnostik). Speglar
 * gaten exakt: 'live' bara när live-källan verkligen körs, annars 'fixtures'.
 * Avgörande att detta följer isLiveActive (inte bara env): annars hade UI:t
 * märkt interims-lägets demo-data som "live".
 */
export function getDataSourceMode(
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): DataSourceMode {
  return isLiveActive(env, liveReady) ? 'live' : 'fixtures';
}
