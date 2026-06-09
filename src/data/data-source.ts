// Datalagrets miljö-gating (fixtures-först, SPEC §12 + Agent Kit-playbookens
// "fixtures-forst-mot-externt-cms-eller-api").
//
// EN gata väljer datakälla utifrån miljön:
//   - Saknas Supabase-env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
//     -> fixtures-läge (typad platshållar-data), med en FAIL-LOUD-logg så
//        övergången till live aldrig glöms bort.
//   - Finns env-variablerna -> live-läge (Supabase-klienten, byggs i T14).
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
 */
export function isSupabaseConfigured(env: ImportMetaEnv): boolean {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  return Boolean(url) && Boolean(key);
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
  // Lat init: skapa klienten först vid första anropet, inte vid modul-laddning.
  const loadClient = () => import('./supabase-client').then((m) => m.createSupabaseDataSource(env));
  return {
    getTeams: () => loadClient().then((ds) => ds.getTeams()),
    getGroups: () => loadClient().then((ds) => ds.getGroups()),
    getMatches: () => loadClient().then((ds) => ds.getMatches()),
  };
}

/**
 * Välj och returnera den aktiva datakällan utifrån miljön.
 *
 * Fail-loud i fixtures-läge: en synlig console.warn säkerställer att vi inte
 * tyst kör på platshållar-data i tron att det är live. Detta är medvetet en
 * WARNING (inte en error), fixtures-läge är ett giltigt utvecklings-/preview-
 * tillstånd, men det ska SYNAS, inte gömma sig (PRINCIPLES §8, fail loud).
 *
 * @param env  import.meta.env (injiceras för testbarhet, default = den riktiga).
 */
export function getDataSource(env: ImportMetaEnv = import.meta.env): DataSource {
  if (isSupabaseConfigured(env)) {
    return createLiveDataSource(env);
  }
  console.warn(
    '[VM2026] Datalager kör i FIXTURES-läge (platshållar-data). ' +
      'Supabase-env saknas (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
      'Sätt dem för att växla till live (Supabase byggs i T14).'
  );
  return createFixtureDataSource();
}

/** Vilket läge som är aktivt utifrån miljön (för UI-märkning / diagnostik). */
export function getDataSourceMode(env: ImportMetaEnv = import.meta.env): DataSourceMode {
  return isSupabaseConfigured(env) ? 'live' : 'fixtures';
}
