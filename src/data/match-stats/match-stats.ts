// DELAD match-statistik-projektion (T86, #178): rena funktioner som tar EN matchs redan-
// parsade live-data (LiveEvent[]/LiveTeamStatistics[]/LiveLineup[] ur parse-live.ts) och
// projicerar den till de match-agnostiska, team-/spelar-nycklade strukturerna i
// match-stats-types.ts. Ingen IO, ingen Date.now(), inget React , rent in, rent ut.
//
// ÅTERANVÄNDNING (G5, hela poängen): T86 renderar EN match ur dessa; T87 (skytteliga)
// kör extractGoals över ALLA matchers events och grupperar mål/assist på scorerId/assistId
// (filtrerar isOwnGoal bort ur skytt-tally); T88 (turneringsstatistik) kör extractCards +
// normalizeTeamStats över ALLA matcher och aggregerar per teamApiId. Därför är allt här
// TEAM-/SPELAR-nyckat och saknar home/away (det vore meningslöst cross-match).
//
// EN SANNING FÖR PARSNINGEN (PRINCIPLES §4): vi parsar ALDRIG om de råa API-svaren här.
// parse-live.ts äger RÅ -> normaliserad (LiveEvent osv.), redan hårt testad mot källans
// schema. Denna modul tar BARA den normaliserade formen och grupperar/projicerar den ett
// steg till. Skarven "rå -> normaliserad" bevisas av parse-live:s tester; skarven
// "normaliserad -> domän-projektion" bevisas av denna moduls tester.

import type { LiveEvent, LiveLineup, LiveStatisticValue, LiveTeamStatistics } from '../livescore';
import type {
  LineupPlayerInfo,
  MatchCardEvent,
  MatchGoal,
  MatchOtherEvent,
  MatchSub,
  TeamLineupInfo,
  TeamMatchStats,
  TeamStatKey,
  TeamStatMetric,
} from './match-stats-types';

/**
 * Detektera straffmål ur ett måls detail. KÄLLHÄNVISAD text (gissas aldrig): API-Football
 * sätter detail "Penalty" på ett straffmål-event (samma sträng live-card-model.ts redan
 * matchar mot, och samma som den fångade fixturen events-rich.json bär). Ett missat straff
 * är ett "Missed Penalty"-event (type "Var"/"Missed Penalty"), INTE ett mål, så det fastnar
 * aldrig i extractGoals (vi filtrerar på kind 'goal' först).
 */
function isPenaltyGoal(detail: string): boolean {
  return /penalty/i.test(detail);
}

/**
 * Detektera egenmål ur ett måls detail. KÄLLHÄNVISAD text: API-Football sätter detail "Own
 * Goal". VIKTIGT (lessons "lattgissad-domanregel", se docs/decisions.md 2026-06-16): vi
 * härleder BARA flaggan här , vi tolkar ALDRIG om vilket lag teamApiId pekar på (de två
 * stora fotbolls-API:erna är oeniga om egenmålets team-konvention och API-Footballs egen
 * doc går inte att nå för bekräftelse). Den VERIFIERBARA, provider-oberoende regeln är "ett
 * egenmål är aldrig skyttens mål", som T87 uttrycker genom att filtrera isOwnGoal === false.
 */
function isOwnGoalDetail(detail: string): boolean {
  return /own goal/i.test(detail);
}

/**
 * Plocka ut MÅLEN ur en matchs händelser, kronologiskt (minut, sedan tillägg). Bevarar
 * teamApiId + scorerId/assistId exakt som API:t gav dem (för cross-match-aggregering).
 * Egenmål flaggas (isOwnGoal) men teamApiId tolkas INTE om (se isOwnGoalDetail).
 */
export function extractGoals(events: readonly LiveEvent[]): MatchGoal[] {
  return events
    .filter((e) => e.kind === 'goal')
    .map(
      (e): MatchGoal => ({
        minute: e.minute,
        extra: e.extra,
        teamApiId: e.teamApiId,
        teamName: e.teamName,
        scorerId: e.playerId,
        scorerName: e.playerName,
        assistId: e.assistId,
        assistName: e.assistName,
        isPenalty: isPenaltyGoal(e.detail),
        isOwnGoal: isOwnGoalDetail(e.detail),
      })
    )
    .sort(byTime);
}

/**
 * Plocka ut KORTEN (gula/röda), kronologiskt. Färgen kommer redan normaliserad ur parse-
 * live (readCardColor). Ett event utan igenkänd kortfärg (cardColor null) tas inte med.
 */
export function extractCards(events: readonly LiveEvent[]): MatchCardEvent[] {
  return events
    .filter((e): e is LiveEvent & { cardColor: NonNullable<LiveEvent['cardColor']> } => {
      return e.cardColor !== null;
    })
    .map(
      (e): MatchCardEvent => ({
        minute: e.minute,
        extra: e.extra,
        teamApiId: e.teamApiId,
        teamName: e.teamName,
        playerId: e.playerId,
        playerName: e.playerName,
        color: e.cardColor,
      })
    )
    .sort(byTime);
}

/**
 * Plocka ut BYTENA, kronologiskt. API-formen vid en subst: event.player = inbytt,
 * event.assist = utbytt (samma tolkning som live-card-model.ts redan använder, källhänvisad
 * där). En subst utan känd utbytt spelare (assist null) ger playerOut* null, inte gissad.
 */
export function extractSubs(events: readonly LiveEvent[]): MatchSub[] {
  return events
    .filter((e) => e.kind === 'subst')
    .map(
      (e): MatchSub => ({
        minute: e.minute,
        extra: e.extra,
        teamApiId: e.teamApiId,
        teamName: e.teamName,
        playerInId: e.playerId,
        playerInName: e.playerName,
        playerOutId: e.assistId,
        playerOutName: e.assistName,
      })
    )
    .sort(byTime);
}

/**
 * Plocka ut ÖVRIGA händelser (VAR-granskning + okända typer), kronologiskt, så en tidslinje
 * kan visa HELA förloppet utan att tappa något. Mål/kort/byten har egna, rikare extraktorer
 * ovan, så vi tar bara kind 'var' och 'other' här (en uttömmande tidslinje = mål+kort+byten+
 * övrigt utan dubbletter).
 */
export function extractOtherEvents(events: readonly LiveEvent[]): MatchOtherEvent[] {
  return events
    .filter(
      (e): e is LiveEvent & { kind: 'var' | 'other' } => e.kind === 'var' || e.kind === 'other'
    )
    .map(
      (e): MatchOtherEvent => ({
        minute: e.minute,
        extra: e.extra,
        teamApiId: e.teamApiId,
        teamName: e.teamName,
        kind: e.kind,
        rawType: e.rawType,
        detail: e.detail,
        playerName: e.playerName,
      })
    )
    .sort(byTime);
}

/** Sortera två tids-bärande poster: minut först, sedan tilläggsminut (null = 0). */
function byTime(
  a: { minute: number; extra: number | null },
  b: { minute: number; extra: number | null }
): number {
  if (a.minute !== b.minute) {
    return a.minute - b.minute;
  }
  return (a.extra ?? 0) - (b.extra ?? 0);
}

/**
 * Mappning kanonisk nyckel -> API-Footballs `type`-etikett (KÄLLHÄNVISAD, exakt de strängar
 * API:t levererar i fixtures/statistics, samma som live-card-model.ts:s urval bygger på).
 * EN sanning för "vilken API-etikett är vilket nyckeltal", delad av T86 + T88. Gissas aldrig:
 * etiketterna är API:ts egna (verifierade mot statistics-rich.json + api-football-types-doc).
 */
const STAT_API_TYPE: Readonly<Record<TeamStatKey, string>> = {
  possession: 'Ball Possession',
  shotsTotal: 'Total Shots',
  shotsOnGoal: 'Shots on Goal',
  shotsOffGoal: 'Shots off Goal',
  corners: 'Corner Kicks',
  fouls: 'Fouls',
  offsides: 'Offsides',
  saves: 'Goalkeeper Saves',
  passesAccuracy: 'Passes %',
};

/** Den kanoniska ordningen nyckeltalen presenteras i (matchvy + turneringsstatistik). */
const STAT_KEY_ORDER: readonly TeamStatKey[] = [
  'possession',
  'shotsTotal',
  'shotsOnGoal',
  'shotsOffGoal',
  'corners',
  'fouls',
  'offsides',
  'saves',
  'passesAccuracy',
];

/** Råvärde -> visnings-text. null/saknat -> null (gissa aldrig en nolla i texten). */
function metricText(value: LiveStatisticValue['value']): string | null {
  return value === null ? null : String(value);
}

/**
 * Råvärde -> ett TAL (procent "78%" -> 78, "13" -> 13). Icke-numeriskt/saknat -> null (inte
 * 0: en saknad stat är inte "noll", och en aggregering över matcher (T88) ska kunna hoppa
 * en saknad post i stället för att dra ner ett medel mot noll). Detta är en MEDVETEN
 * skillnad mot live-card-model.statNumber (som 0:ar för stapel-bredd , rätt för EN stapel,
 * fel för ett cross-match-medel). Därav en egen, ärligare numerisk projektion här.
 */
function metricNumber(value: LiveStatisticValue['value']): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(value.replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalisera ETT lags råa statistik-lista till de kanoniska nyckeltalen. Bara nyckeltal
 * API:t faktiskt levererade en post för tas med (en typ som helt saknas ger ingen metric),
 * i kanonisk ordning. text/value är null-säkra (saknat värde -> null, inte gissad nolla).
 */
export function normalizeTeamStats(team: LiveTeamStatistics): TeamMatchStats {
  // O(1)-uppslag per API-typ (statistik-listan kan vara lång och osorterad).
  const byType = new Map(team.statistics.map((s) => [s.type, s.value]));
  const metrics: TeamStatMetric[] = [];
  for (const key of STAT_KEY_ORDER) {
    const apiType = STAT_API_TYPE[key];
    if (!byType.has(apiType)) {
      continue; // nyckeltalet saknas helt i datan, ingen metric (ingen tom rad)
    }
    const raw = byType.get(apiType) ?? null;
    metrics.push({ key, text: metricText(raw), value: metricNumber(raw) });
  }
  return { teamApiId: team.teamApiId, teamName: team.teamName, metrics };
}

/** Normalisera ALLA lags statistik i en match (bekvämlighet för T86; T88 mappar själv). */
export function normalizeMatchStats(statistics: readonly LiveTeamStatistics[]): TeamMatchStats[] {
  return statistics.map(normalizeTeamStats);
}

/** Normalisera en lineup-spelare (bär API:ts fält rakt av). */
function toLineupPlayer(p: LiveLineup['startXI'][number]): LineupPlayerInfo {
  return {
    apiPlayerId: p.apiPlayerId,
    name: p.name,
    number: p.number,
    position: p.position,
    grid: p.grid,
  };
}

/** Projicera EN normaliserad laguppställning till den delade lineup-formen (+ tränare). */
export function extractLineup(lineup: LiveLineup): TeamLineupInfo {
  return {
    teamApiId: lineup.teamApiId,
    teamName: lineup.teamName,
    formation: lineup.formation,
    startXI: lineup.startXI.map(toLineupPlayer),
    substitutes: lineup.substitutes.map(toLineupPlayer),
    coachName: lineup.coachName,
  };
}
