// Publik yta för den verifierade VM 2026-datan (slutspelslottningen 2025-12-05).
// Konsumenter importerar lag/grupper/matcher härifrån.
//
// Matchplanen (WC2026_MATCHES, T4b/#31) är nu med: 72 gruppmatcher + 32
// slutspelsmatcher (M73-M104) med avsparkstid (UTC), svensk TV-kanal och verifierad
// arena/stad, GENERERAD ur den committade svenska TV-tablån (tv-schedule-source.txt,
// tid + kanal) + arena-källan (venue-source.txt, arena + stad, T4c/#35) och värde-låst
// mot källorna i CI. Arenan kommer ur FIFA:s spelschema (16 arenor), korskollad mot en
// andra oberoende källa (gissas aldrig), se matches.ts + docs/decisions.md (T4c).

// Lag-profiler (T10/#10): FIFA-ranking + stjärnspelare + kuriosa per lag, källånkrad
// (genererad ur team-profiles-source.txt, värde-låst i CI). Vävs redan in i
// WC2026_TEAMS (Team.fifaRanking/starPlayers/trivia), tabellen exponeras för
// direktuppslag (t.ex. profil-vyn) och tester.
export { WC2026_TEAMS, WC2026_GROUPS } from './teams';
export { WC2026_MATCHES } from './matches';
export { WC2026_TEAM_PROFILES } from './team-profiles';
export type { TeamProfile, TeamProfileTable } from './team-profiles-parser';
