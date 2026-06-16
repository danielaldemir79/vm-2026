// REN AGGREGERING för de STATISTICS-härledda lag-aggregaten (T88, #180): bollinnehav-/skott-/
// fouls-medel per lag över ALLA matcher. Ingen IO, inget React , rent in (alla matchers
// statistik) -> rent ut (rankade lag-medel).
//
// ÅTERANVÄNDNING (PRINCIPLES §4, DRY): vi parsar/normaliserar ALDRIG statistiken själva här.
// Den DELADE normalizeTeamStats (match-stats, T86) äger "vilken API-etikett är vilket nyckeltal
// + råtext -> tal (procent '60%' -> 60, saknat -> null)". Vi AGGREGERAR bara dess null-säkra
// utdata över ALLA matcher till ett medel per lag.
//
// NULL-DISCIPLIN (KÄLLHÄNVISAD, lessons "skarven" + match-stats `metricNumber`): en SAKNAD stat
// är `value === null`, INTE 0. Vi HOPPAR null-värden , de drar aldrig ner ett medel mot noll
// (en match där API:t inte rapporterade bollinnehav ska inte räknas som "0% innehav"). Ett lag
// utan ETT enda värt för nyckeltalet får ingen rad alls (ingen falsk 0-rad). Medlet är per
// RÄKNAD sample (matcher med ett faktiskt värde), inte per match laget spelade.

import { normalizeTeamStats } from '../../data/match-stats';
import type { TeamStatKey } from '../../data/match-stats';
import type { LiveMatchStats } from '../../data/livescore';

/** En rad i ett lag-medel-aggregat: ett lags medel för ETT nyckeltal över VM. */
export interface TeamMetricRow {
  teamApiId: number;
  teamName: string;
  /** Medelvärdet (per räknad sample), null-värden EXKLUDERADE. */
  average: number;
  /** Antal matcher som faktiskt bidrog med ett värde (medlets nämnare). */
  samples: number;
}

interface MetricAcc {
  teamApiId: number;
  teamName: string;
  sum: number;
  samples: number;
}

/**
 * Aggregera ETT nyckeltal (possession/shotsTotal/fouls/...) till ett null-medvetet medel per
 * lag över ALLA matcher, rankat på högst medel (sedan namn för stabil ordning). Ett lag utan
 * ett enda icke-null-värde för nyckeltalet utelämnas (ingen falsk 0-rad).
 *
 * @param matches  per-lags-statistik per match (useCrossMatchStats.matches).
 * @param key      vilket kanoniskt nyckeltal (TeamStatKey) att aggregera.
 */
export function aggregateTeamMetric(
  matches: readonly LiveMatchStats[],
  key: TeamStatKey
): TeamMetricRow[] {
  const byTeam = new Map<number, MetricAcc>();

  for (const { statistics } of matches) {
    for (const team of statistics) {
      // Normalisera via den delade projektionen (en sanning för etikett->nyckel + tal-parsning).
      const normalized = normalizeTeamStats(team);
      const metric = normalized.metrics.find((m) => m.key === key);
      // Saknad post ELLER saknat tal (value null) -> hoppa (null-disciplin, INTE 0).
      if (metric === undefined || metric.value === null) {
        continue;
      }
      const acc = byTeam.get(team.teamApiId) ?? {
        teamApiId: team.teamApiId,
        teamName: team.teamName,
        sum: 0,
        samples: 0,
      };
      acc.teamName = team.teamName;
      acc.sum += metric.value;
      acc.samples += 1;
      byTeam.set(team.teamApiId, acc);
    }
  }

  const rows: TeamMetricRow[] = [...byTeam.values()]
    // 0 samples kan inte uppstå (vi sätter bara accumulatorn när vi har ett värde), men
    // gardera ändå: ett lag utan räknad sample ska aldrig ge en rad (ingen division med noll).
    .filter((a) => a.samples > 0)
    .map((a) => ({
      teamApiId: a.teamApiId,
      teamName: a.teamName,
      average: a.sum / a.samples,
      samples: a.samples,
    }));
  rows.sort((a, b) => b.average - a.average || a.teamName.localeCompare(b.teamName, 'sv'));
  return rows;
}
