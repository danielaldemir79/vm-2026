// Tester för de STATISTICS-härledda lag-aggregaten (T88, #180): bollinnehav-/skott-/fouls-
// medel per lag över ALLA matcher. NULL-MEDVETNA: en saknad stat (value null) hoppas , den
// drar ALDRIG ner medlet mot noll (lessons "skarven", samma null-disciplin som
// normalizeTeamStats redan har). Vi bygger LiveTeamStatistics-fixtures direkt (parsern är
// redan testad i parse-live.test).

import { describe, expect, it } from 'vitest';
import { aggregateTeamMetric } from './tournament-stats-team-metrics';
import type { LiveMatchStats } from '../../data/livescore';
import type { LiveTeamStatistics } from '../../data/livescore';

/** Bygg ett lags statistik-post. value: number/string/null exakt som parse-live ger den. */
function teamStat(
  teamApiId: number,
  teamName: string,
  entries: Array<[string, number | string | null]>
): LiveTeamStatistics {
  return {
    teamApiId,
    teamName,
    statistics: entries.map(([type, value]) => ({ type, value })),
  };
}

function match(matchId: string, statistics: LiveTeamStatistics[]): LiveMatchStats {
  return { matchId, statistics };
}

describe('aggregateTeamMetric , null-medvetet lag-medel', () => {
  it('medelvärde av bollinnehav per lag över flera matcher', () => {
    const rows = aggregateTeamMetric(
      [
        match('m1', [
          teamStat(6, 'Brasilien', [['Ball Possession', '60%']]),
          teamStat(5, 'Sverige', [['Ball Possession', '40%']]),
        ]),
        match('m2', [teamStat(6, 'Brasilien', [['Ball Possession', '50%']])]),
      ],
      'possession'
    );
    const bra = rows.find((r) => r.teamApiId === 6);
    expect(bra?.average).toBe(55); // (60 + 50) / 2
    expect(bra?.samples).toBe(2);
    // Topp = högst medel (Brasilien 55 > Sverige 40).
    expect(rows[0]?.teamApiId).toBe(6);
  });

  it('en SAKNAD stat (value null) hoppas , drar INTE ner medlet mot noll', () => {
    const rows = aggregateTeamMetric(
      [
        match('m1', [teamStat(6, 'Brasilien', [['Ball Possession', '60%']])]),
        // m2: laget HAR en statistik-post men possession-värdet är null (API saknade talet).
        match('m2', [teamStat(6, 'Brasilien', [['Ball Possession', null]])]),
      ],
      'possession'
    );
    const bra = rows.find((r) => r.teamApiId === 6);
    expect(bra?.average).toBe(60); // bara det ena (60), null-matchen hoppas
    expect(bra?.samples).toBe(1); // bara en räknad sample
  });

  it('NEGATIV-KONTROLL: om null räknades som 0 vore medlet 30, inte 60', () => {
    // Detta LÅSER null-disciplinen: ett 0-istället-för-hoppa skulle ge (60+0)/2 = 30.
    const rows = aggregateTeamMetric(
      [
        match('m1', [teamStat(6, 'Brasilien', [['Total Shots', '12']])]),
        match('m2', [teamStat(6, 'Brasilien', [['Total Shots', null]])]),
      ],
      'shotsTotal'
    );
    expect(rows[0]?.average).toBe(12);
    expect(rows[0]?.average).not.toBe(6);
  });

  it('ett lag som ALDRIG har ett värde för nyckeltalet utelämnas helt (inga 0-rader)', () => {
    const rows = aggregateTeamMetric(
      [match('m1', [teamStat(6, 'Brasilien', [['Ball Possession', null]])])],
      'possession'
    );
    expect(rows).toHaveLength(0); // 0 samples -> ingen rad (ingen falsk 0%-rad)
  });

  it('tom data -> tom lista, ingen krasch', () => {
    expect(aggregateTeamMetric([], 'fouls')).toEqual([]);
  });

  it('summa-nyckeltal (skott, fouls) ger medel per match, inte total', () => {
    const rows = aggregateTeamMetric(
      [
        match('m1', [teamStat(6, 'Brasilien', [['Fouls', '10']])]),
        match('m2', [teamStat(6, 'Brasilien', [['Fouls', '20']])]),
      ],
      'fouls'
    );
    expect(rows[0]?.average).toBe(15); // medel per match (10+20)/2, inte 30
  });
});
