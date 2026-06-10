// Datalagrets miljö-gating (fixtures-först, SPEC §12 + Agent Kit-playbookens
// "fixtures-forst-mot-externt-cms-eller-api").
//
// EN gata väljer datakälla utifrån TVÅ villkor:
//   1. Är Supabase-env satt? (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
//   2. Är live-klienten faktiskt byggd? (LIVE_READY, se nedan)
// Live väljs bara när BÅDA är sanna. Annars fixtures, alltid med en synlig logg
// (fail loud) så övergången till live aldrig glöms bort.
//
// Varför två villkor och inte bara env (#37, hotfix): supabase-client.ts är en
// MEDVETEN fail-loud-stub tills T14 bygger den. Env-variablerna sattes redan i
// Cloudflare (2026-06-09) inför T14, så enbart en env-gate tände live-grenen i
// produktion -> stubben kastade i varje vy och Daniels vänner såg fel-alerts i
// stället för matchdata. LIVE_READY behåller fail-loud-principen (env utan
// fungerande klient SKA inte tyst se ut som live) men flyttar smällen från
// användarens ansikte till en console.warn tills T14 tänder live på riktigt.
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
 * `false` tills T14 fyller supabase-client.ts (stubben kastar fortfarande, se
 * den filen). Detta är T14:s ENDA extra kod-steg för att tända live:
 *   T14: sätt LIVE_READY = true OCH ta bort interims-varningen i getDataSource.
 * (Pinnat i docs/decisions.md, #37, så T14 inte missar det.)
 *
 * Konstanten är en in-kod-flagga med FLIT (inte en env-variabel): att flippa
 * den till true kräver en kod-ändring som går genom review + bygge ihop med
 * T14:s faktiska klient, så live aldrig tänds av enbart en miljö-konfiguration.
 */
export const LIVE_READY = false;

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
 * Tre fall, alla fail-loud (PRINCIPLES §8, en synlig logg så ingen tyst kör fel
 * data, men en WARNING, inte error, eftersom fixtures är ett giltigt läge):
 *   - Live aktivt (env satt + LIVE_READY): live-källan, ingen logg behövs.
 *   - Env satt men LIVE_READY false (interims-läget, #37): fixtures + en EGEN
 *     varning som förklarar att env finns men klienten väntar på T14. T14 tar
 *     bort just denna varning när LIVE_READY flippas.
 *   - Env saknas: fixtures + den vanliga "env saknas"-varningen.
 *
 * @param env        import.meta.env (injiceras för testbarhet, default = riktiga).
 * @param liveReady  injicerbar live-flagga (default LIVE_READY), så live-grenen
 *                   kan testas utan att flippa den globala konstanten.
 */
export function getDataSource(
  env: ImportMetaEnv = import.meta.env,
  liveReady: boolean = LIVE_READY
): DataSource {
  if (isLiveActive(env, liveReady)) {
    return createLiveDataSource(env);
  }
  if (isSupabaseConfigured(env)) {
    // Interims-läget (#37): env satt, men klienten inte byggd än. Kör fixtures
    // och förklara varför, så detta inte förväxlas med "env saknas".
    // T14: ta bort denna gren när LIVE_READY blir true.
    console.warn(
      '[VM2026] Datalager kör i FIXTURES-läge trots att Supabase-env är satt. ' +
        'Live-klienten är inte byggd än (LIVE_READY=false, byggs i T14). ' +
        'Detta är avsiktligt tills T14 tänder live.'
    );
  } else {
    console.warn(
      '[VM2026] Datalager kör i FIXTURES-läge (platshållar-data). ' +
        'Supabase-env saknas (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
        'Sätt dem för att växla till live (Supabase byggs i T14).'
    );
  }
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
