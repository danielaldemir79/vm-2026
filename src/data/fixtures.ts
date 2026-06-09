// Typad fixtures-data för datalagret (fixtures-först, SPEC §12).
//
// LAG + GRUPPER här är den VERIFIERADE VM 2026-datan (T4: de 48 lagen och
// grupperna A-L ur FIFA:s slutspelslottning 2025-12-05), återanvänd via
// WC2026_TEAMS / WC2026_GROUPS, inte påhittade platshållare. Att fixtures-källan
// bär den riktiga lag-/gruppdatan gör att hela appen (gruppspelsvyn T5 m.fl.)
// kan byggas och demonstreras mot 12 riktiga grupper innan Supabase-kontot (T14)
// finns. En sanning för lag/grupper bor i src/data/wc2026 (gissas aldrig).
//
// MATCHERNA här är fortfarande DEMO-resultat (ett urval gruppspelsmatcher med
// påhittade men typ-korrekta resultat), INTE den riktiga matchplanen. Den
// fullständiga matchplanen (72 gruppmatcher med exakta avsparkstider, arenor och
// svenska TV-kanaler) kräver en svensk sändningsrätts-källa och är medvetet en
// egen, ännu öppen data-punkt (T4-handoff Findings, issue #31), den gissas inte.
// Demo-resultaten finns för att grupptabellerna ska visa NÅGOT live (vissa lag
// med spelade matcher, andra utan), så vyn möter både spelade och ospelade lägen.
//
// VIKTIGT (lärdom): fixtures uppfyller EXAKT samma typer som live-datan (samma
// fältnamn, samma form), annars döljs en mappnings-drift i den otestade live-
// grenen. Typerna nedan är importerade och annoterade så TS failar bygget om
// formen avviker.

import type { Group, Match, MatchResult, Team } from '../domain/types';
import { WC2026_GROUPS, WC2026_TEAMS } from './wc2026';

// Lag + grupper = den verifierade VM 2026-datan (T4). Re-exporteras under
// fixtures-namnen så datakällan och dess konsumenter inte behöver veta att det
// råkar vara den riktiga datan, kontraktet (DataSource) är detsamma oavsett.
export const fixtureTeams: Team[] = WC2026_TEAMS;
export const fixtureGroups: Group[] = WC2026_GROUPS;

/**
 * En liten DSL för demo-matcher: bygg en gruppmatch ur lag-id + resultat. Håller
 * fixtures-listan kort och läsbar och garanterar att varje demo-match får rätt
 * diskriminerade form (finished -> resultat, scheduled -> null), så TS-kontraktet
 * (Match-unionen) inte kan brytas av en handknappad literal.
 *
 * kickoff sätts i UTC-ISO (Match-kontraktet: avsparkstid är UTC, formateras
 * lokalt i UI:t). T5 visar inga tider, så ingen tidszons-härledning behövs här,
 * de exakta tiderna fylls med riktig data i en egen task (issue #31).
 */
function finishedMatch(
  id: string,
  groupId: Group['id'],
  homeTeamId: string,
  awayTeamId: string,
  result: MatchResult,
  kickoff: string
): Match {
  return {
    id,
    stage: 'group',
    groupId,
    homeTeamId,
    awayTeamId,
    kickoff,
    venue: 'Demo-arena (riktig data i egen task)',
    result,
    status: 'finished',
  };
}

function scheduledMatch(
  id: string,
  groupId: Group['id'],
  homeTeamId: string,
  awayTeamId: string,
  kickoff: string
): Match {
  return {
    id,
    stage: 'group',
    groupId,
    homeTeamId,
    awayTeamId,
    kickoff,
    venue: 'Demo-arena (riktig data i egen task)',
    result: null,
    status: 'scheduled',
  };
}

// Ett urval demo-resultat över några grupper, så gruppspelsvyn visar variation:
// en helt avgjord omgång i grupp A (alla 4 lag har spelat), en blandning i grupp
// C (en spelad, en kommande), och grupp F (Sverige) med ett par resultat. Övriga
// grupper visas med nollställda tabeller (inga matcher spelade än), vilket också
// är ett viktigt UI-läge att kunna visa. Lag-id är gemen landskod (se wc2026).
export const fixtureMatches: Match[] = [
  // Grupp A (Mexiko, Sydafrika, Sydkorea, Tjeckien): omgång 1 helt spelad.
  finishedMatch('m-a-1', 'A', 'mex', 'rsa', { homeGoals: 2, awayGoals: 0 }, '2026-06-11T19:00:00Z'),
  finishedMatch('m-a-2', 'A', 'kor', 'cze', { homeGoals: 1, awayGoals: 1 }, '2026-06-11T22:00:00Z'),
  // Grupp C (Brasilien, Marocko, Haiti, Skottland): en spelad, en kommande.
  finishedMatch('m-c-1', 'C', 'bra', 'hai', { homeGoals: 3, awayGoals: 1 }, '2026-06-12T19:00:00Z'),
  scheduledMatch('m-c-2', 'C', 'mar', 'sco', '2026-06-12T22:00:00Z'),
  // Grupp F (Nederländerna, Japan, Sverige, Tunisien): två resultat, Sverige spelar.
  finishedMatch('m-f-1', 'F', 'swe', 'tun', { homeGoals: 2, awayGoals: 1 }, '2026-06-13T16:00:00Z'),
  finishedMatch('m-f-2', 'F', 'ned', 'jpn', { homeGoals: 0, awayGoals: 0 }, '2026-06-13T19:00:00Z'),
];
