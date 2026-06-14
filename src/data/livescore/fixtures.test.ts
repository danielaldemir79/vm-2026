// Fixtures-läges-tester. Bevisar att Bit 3:s livekort kan renderas UTAN backend:
// de committade exports:erna är härledda ur de verkliga API-svaren via den RIKTIGA
// parsern, så formen är garanterat den live producerar (skarven bevisad genom att
// fixturen ÄR källan parsad, inte en handskriven konsument-form).

import { describe, expect, it } from 'vitest';
import {
  fixtureFinalResult,
  fixtureLiveEvents,
  fixtureLiveLineups,
  fixtureLiveSnapshots,
  fixtureLiveStatistics,
} from './fixtures';

describe('livescore fixtures-läge (committad data ur verkliga svar)', () => {
  it('ger en live-ögonblicksbild (Nederländerna-Japan) redo för livekortet', () => {
    expect(fixtureLiveSnapshots).toHaveLength(1);
    const snap = fixtureLiveSnapshots[0];
    expect(snap.status).toBe('live');
    expect(snap.homeTeamName).toBe('Netherlands');
    expect(snap.awayTeamName).toBe('Japan');
    expect(snap.elapsedMinute).toBe(29);
  });

  it('ger rika matchhändelser (22 events) för händelse-flödet', () => {
    expect(fixtureLiveEvents).toHaveLength(22);
    expect(fixtureLiveEvents.some((e) => e.kind === 'goal')).toBe(true);
  });

  it('ger per-lags-statistik för statistik-panelen', () => {
    expect(fixtureLiveStatistics).toHaveLength(2);
    expect(fixtureLiveStatistics[0].statistics.length).toBeGreaterThan(0);
  });

  it('ger laguppställningar för formations-vyn', () => {
    expect(fixtureLiveLineups).toHaveLength(2);
    expect(fixtureLiveLineups[0].startXI).toHaveLength(11);
  });

  it('ger ett facit (slutresultat) för en avgjord match', () => {
    expect(fixtureFinalResult.homeGoals).toBe(6);
    expect(fixtureFinalResult.awayGoals).toBe(2);
    expect(fixtureFinalResult.decidedBy).toBe('regulation');
  });
});
