// Typad fixtures-data för datalagret (fixtures-först, SPEC §12).
//
// LAG + GRUPPER här är den VERIFIERADE VM 2026-datan (T4: de 48 lagen och
// grupperna A-L ur FIFA:s slutspelslottning 2025-12-05), återanvänd via
// WC2026_TEAMS / WC2026_GROUPS, inte påhittade platshållare.
//
// MATCHERNA är nu den RIKTIGA matchplanen (T4b/#31): 72 gruppmatcher + 32
// slutspelsmatcher (M73-M104) med avsparkstid (UTC) och svensk TV-kanal,
// genererad ur den committade svenska TV-tablån och värde-låst mot källan i CI
// (src/data/wc2026/matches.ts). Detta ERSATTE de tidigare demo-resultaten: hela
// appen (gruppspelsvyn T5, matchtablån m.fl.) demonstreras nu mot den verkliga
// matchplanen redan i fixtures-läge, innan Supabase-kontot (T14) finns.
//
// STATUS: alla matcher är 'scheduled' (resultat null), vilket är det SANNA
// läget, VM 2026 har inte börjat (dagens datum 2026-06-09, första avspark 11
// juni). Grupptabellerna är därmed nollställda tills resultat matas in (T6),
// vilket är ett giltigt och viktigt UI-läge (vyn hanterar det redan, T5). Arena
// saknas i källan (känd lucka, venue = "ej verifierad", gissas aldrig).
//
// VIKTIGT (lärdom): fixtures uppfyller EXAKT samma typer som live-datan (samma
// fältnamn, samma form), annars döljs en mappnings-drift i den otestade live-
// grenen. Typerna nedan är importerade och annoterade så TS failar bygget om
// formen avviker.

import type { Group, Match, Team } from '../domain/types';
import { WC2026_GROUPS, WC2026_MATCHES, WC2026_TEAMS } from './wc2026';

// Lag + grupper + matcher = den verifierade VM 2026-datan (T4 + T4b).
// Re-exporteras under fixtures-namnen så datakällan och dess konsumenter inte
// behöver veta att det råkar vara den riktiga datan, kontraktet (DataSource) är
// detsamma oavsett källa (samma form tänds live i T14 utan kod-ändring).
export const fixtureTeams: Team[] = WC2026_TEAMS;
export const fixtureGroups: Group[] = WC2026_GROUPS;
export const fixtureMatches: Match[] = WC2026_MATCHES;
