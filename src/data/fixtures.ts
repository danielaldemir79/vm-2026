// Typad fixtures-data för datalagret (fixtures-först, SPEC §12).
//
// Detta är PLATSHÅLLAR-data, INTE det verifierade riktiga VM 2026-schemat.
// Den verifierade schemadatan (riktiga lag, datum, arenor, TV-kanaler,
// slutspelskopplingar) extraheras och dubbelkollas mot källorna i SPEC §8 i
// T4, den kritiska data-tasken. Fixtures här finns för att hela appen ska
// kunna byggas och testas INNAN Supabase-kontot (T14) och den riktiga datan
// finns, utan att blockera pipelinen.
//
// VIKTIGT (lärdom från tidigare task): fixtures uppfyller EXAKT samma typer som
// live-datan kommer göra (samma fältnamn, samma form). Annars döljs en
// mappnings-drift i live-grenen som aldrig körs i test. Typerna nedan är
// importerade och annoterade så TS failar bygget om formen avviker.

import type { Group, Match, Team } from '../domain/types';

// Två exempel-grupper räcker för att utöva tabellberäkning och UI mot riktig
// form. Fler grupper tillför ingen ny typ-yta, bara mer platshållar-data, så vi
// håller det litet (KISS) tills riktig data kommer i T4.

// OBS koderna: Team.code är FIFA:s TREBOKSTAVS-landskod (t.ex. "BRA"). Även
// som platshållare måste fixtures följa det kontraktet (3 BOKSTÄVER, inga
// siffror), annars riskerar UI/flagg-formattering att byggas mot en form som
// bara funkar för fixtures. Koderna nedan är påhittade men giltiga och unika
// 3-bokstavskoder; den riktiga datan fylls i T4 (lärdom: fixtures följer
// källans kontrakt).
export const fixtureTeams: Team[] = [
  // Grupp A (platshållar-lag).
  { id: 'team-a1', name: 'Lag A1', code: 'AAA', group: 'A', fifaRanking: 5 },
  { id: 'team-a2', name: 'Lag A2', code: 'AAB', group: 'A', fifaRanking: 18 },
  { id: 'team-a3', name: 'Lag A3', code: 'AAC', group: 'A', fifaRanking: 32 },
  { id: 'team-a4', name: 'Lag A4', code: 'AAD', group: 'A', fifaRanking: 47 },
  // Grupp B (platshållar-lag).
  { id: 'team-b1', name: 'Lag B1', code: 'BBA', group: 'B', fifaRanking: 2 },
  { id: 'team-b2', name: 'Lag B2', code: 'BBB', group: 'B', fifaRanking: 21 },
  { id: 'team-b3', name: 'Lag B3', code: 'BBC', group: 'B', fifaRanking: 29 },
  { id: 'team-b4', name: 'Lag B4', code: 'BBD', group: 'B', fifaRanking: 55 },
];

export const fixtureGroups: Group[] = [
  { id: 'A', teamIds: ['team-a1', 'team-a2', 'team-a3', 'team-a4'] },
  { id: 'B', teamIds: ['team-b1', 'team-b2', 'team-b3', 'team-b4'] },
];

export const fixtureMatches: Match[] = [
  // Grupp A, omgång 1: en spelad, en kommande, så UI:t möter båda lägena.
  {
    id: 'match-a-1',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'team-a1',
    awayTeamId: 'team-a2',
    kickoff: '2026-06-12T19:00:00Z',
    venue: 'Exempelarena, Exempelstad',
    tvChannel: 'SVT1',
    trivia: 'Platshållar-kuriosa, riktig data fylls i T4.',
    result: { homeGoals: 2, awayGoals: 1 },
    status: 'finished',
  },
  {
    id: 'match-a-2',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'team-a3',
    awayTeamId: 'team-a4',
    kickoff: '2026-06-12T22:00:00Z',
    venue: 'Exempelarena, Exempelstad',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  },
  // Grupp B, omgång 1: en spelad match.
  {
    id: 'match-b-1',
    stage: 'group',
    groupId: 'B',
    homeTeamId: 'team-b1',
    awayTeamId: 'team-b2',
    kickoff: '2026-06-13T19:00:00Z',
    venue: 'Exempelarena 2, Exempelstad 2',
    tvChannel: 'SVT2',
    result: { homeGoals: 0, awayGoals: 0 },
    status: 'finished',
  },
];
