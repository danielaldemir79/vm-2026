// Live-Supabase-datakälla (T14, #14).
//
// VIKTIGT designval (dokumenterat i docs/decisions.md T14 + supabase/README.md):
// DataSource-kontraktet (getTeams/getGroups/getMatches) bär den STATISKA
// turneringsbasen, lag, grupper och hela spelschemat. Den datan är KÄLLÅKRAD och
// verifierad i Fas 1 (T4/T4b/T10), ändras aldrig av användare, och bor i
// klient-bundlen. Att spegla den i Supabase hade bara dubblerat en redan låst
// sanning (och skapat en drift-risk). Därför returnerar live-datakällan SAMMA
// statiska data som fixtures-läget för dessa tre metoder.
//
// Det DELADE, MUTERBARA tillståndet (rum, medlemmar, delade matchresultat) går
// INTE via DataSource utan via rooms-API:t (src/data/rooms/), som är auth- +
// RLS-skyddat. Så fixtures-till-live-växlingen för tracker-basen sker UTAN
// kod-ändring i konsumenterna (kravet): de anropar getTeams/getGroups/getMatches
// som förr och får samma form, medan rums-lagret är ett separat, additivt seam.
//
// VARFÖR ändå en "live"-datakälla och inte bara fixtures: gaten (LIVE_READY +
// env) ska vara ÄRLIG, i live-läge SKA en riktig Supabase-klient initieras (så
// auth-sessionen + rums-lagret är på plats), även om bas-datan är statisk. Vi
// rör därför klienten (getSupabaseClient) för att fail-loud:a tidigt om env är
// trasig, men läser bas-datan ur den committade källan.

import type { DataSource } from './data-source';
import type { Group, Match, Team } from '../domain/types';
import { fixtureGroups, fixtureMatches, fixtureTeams } from './fixtures';
import { getSupabaseClient } from './supabase-browser';

/**
 * Skapa live-datakällan. Initierar den riktiga Supabase-klienten ur env (fail
 * loud om den saknas, gaten i data-source.ts har redan verifierat den men vi
 * läser den här som explicit kontrakt + tidig smäll vid felanvändning).
 *
 * Bas-datan (lag/grupper/matcher) är statisk och källåkrad, så de tre metoderna
 * returnerar den committade datan. Det delade/muterbara tillståndet (rum m.m.)
 * nås via rooms-API:t med samma klient.
 */
export function createSupabaseDataSource(env: ImportMetaEnv): DataSource {
  // Initiera (och validera) klienten tidigt. Kastar fail-loud om env är trasig.
  // Vi behåller inte referensen här, rooms-API:t hämtar singletonen via
  // getSupabaseClient(env) när det behövs (en sanning, en klient).
  getSupabaseClient(env);

  return {
    // Statisk, källåkrad bas-data, samma sanning i fixtures- och live-läge.
    getTeams: (): Promise<Team[]> => Promise.resolve(fixtureTeams),
    getGroups: (): Promise<Group[]> => Promise.resolve(fixtureGroups),
    getMatches: (): Promise<Match[]> => Promise.resolve(fixtureMatches),
  };
}
