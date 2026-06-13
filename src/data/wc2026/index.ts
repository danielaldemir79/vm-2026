// Publik yta för den verifierade VM 2026-datan (slutspelslottningen 2025-12-05).
// Konsumenter importerar lag/grupper/matcher härifrån.
//
// Matchplanen (WC2026_MATCHES, T4b/#31) är nu med: 72 gruppmatcher + 32
// slutspelsmatcher (M73-M104) med avsparkstid (UTC), svensk TV-kanal och verifierad
// arena/stad/land, GENERERAD ur den committade svenska TV-tablån (tv-schedule-source.txt,
// tid + kanal) + arena-källan (venue-source.txt, arena + stad + land, T4c/#35 + T4d/#147)
// och värde-låst mot källorna i CI. Arenan kommer ur FIFA:s spelschema (16 arenor),
// korskollad mot en andra oberoende källa (gissas aldrig); värdlandet (T4d) är entydigt
// ur värdstaden, se matches.ts + docs/decisions.md (T4c + T4d).

// Lag-profiler (T10/#10): FIFA-ranking + stjärnspelare + kuriosa per lag, källånkrad
// (genererad ur team-profiles-source.txt, värde-låst i CI). Vävs redan in i
// WC2026_TEAMS (Team.fifaRanking/starPlayers/trivia), tabellen exponeras för
// direktuppslag (t.ex. profil-vyn) och tester.
export { WC2026_TEAMS, WC2026_GROUPS } from './teams';
export { WC2026_MATCHES } from './matches';
export { WC2026_TEAM_PROFILES } from './team-profiles';
export type { TeamProfile, TeamProfileTable } from './team-profiles-parser';

// Åskådarkapacitet per arena (T4e/#149): källånkrad (FIFA:s turnerings-kapaciteter,
// Wikipedia "2026 FIFA World Cup", korskoll-bekräftad), genererad ur venue-source.txt
// och värde-låst i CI. Per ARENA (16 värden), inte per match. Matchkortet slår upp
// matchens arena -> kapacitet och visar den diskret. Se venue-capacities.ts.
export { WC2026_VENUE_CAPACITIES } from './venue-capacities';
export type { VenueCapacityTable } from './venue-parser';
