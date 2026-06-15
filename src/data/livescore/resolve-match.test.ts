// Match-identitets-tester. SKARVEN mellan API-fixture och appmatch körs mot den
// FAKTISKT fångade live-matchen (Nederländerna-Japan), så happy-path bevisar en
// äkta koppling (g-F-1), och fel-vägarna (okänt lag, fel tid, omvänd hemma/borta)
// bevisas mot syntetiska men formtrogna snapshots.

import { describe, expect, it } from 'vitest';
import { resolveAppMatch, resolveMatchCoverage } from './resolve-match';
import { parseLiveFixtures } from './parse-live';
import { liveAllResponse } from './fixtures';
import type { LiveMatchSnapshot } from './live-types';
import { WC2026_MATCHES } from '../wc2026/matches';

const [nedJpnSnapshot] = parseLiveFixtures(liveAllResponse);

/** Klona live-snapshoten med överskrivna fält (för fel-vägs-scenarier). */
function snapshotWith(overrides: Partial<LiveMatchSnapshot>): LiveMatchSnapshot {
  return { ...nedJpnSnapshot, ...overrides };
}

describe('resolveAppMatch: koppla API-fixture till appmatch', () => {
  it('löser den fångade Nederländerna-Japan-fixturen till g-F-1 (kickoff + lag matchar)', () => {
    const res = resolveAppMatch(nedJpnSnapshot);
    expect(res.kind).toBe('resolved');
    if (res.kind === 'resolved') {
      expect(res.appMatchId).toBe('g-F-1');
      expect(res.apiFixtureId).toBe(1489376);
    }
  });

  it('löser även när API:t har hemma/borta omvänt mot appens tablå (paret avgör)', () => {
    const swapped = snapshotWith({
      homeTeamApiId: 12, // Japan som "hemma"
      homeTeamName: 'Japan',
      awayTeamApiId: 1118, // Nederländerna som "borta"
      awayTeamName: 'Netherlands',
    });
    const res = resolveAppMatch(swapped);
    expect(res.kind).toBe('resolved');
    if (res.kind === 'resolved') {
      expect(res.appMatchId).toBe('g-F-1');
    }
  });

  it('olöst (inte gissad) när ett lag saknas i bryggan', () => {
    const unknownTeam = snapshotWith({ awayTeamApiId: 999999 });
    const res = resolveAppMatch(unknownTeam);
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') {
      expect(res.reason).toMatch(/lag saknas i bryggan/);
    }
  });

  it('olöst när kickoff ligger utanför fönstret (rätt lag, fel tid)', () => {
    // +1 dygn: lagen finns och stämmer, men ingen appmatch med ned/jpn vid den tiden.
    const farOff = snapshotWith({ kickoffUtc: '2026-06-15T20:00:00.000Z' });
    const res = resolveAppMatch(farOff);
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') {
      expect(res.reason).toMatch(/kickoff-fönstret/);
    }
  });

  it('tål rimlig minut-drift i avsparkstid (inom fönstret)', () => {
    // 30 min senare än tablån , ska fortfarande lösas (TV-tablå vs API kan drifta).
    const slightlyLate = snapshotWith({ kickoffUtc: '2026-06-14T20:30:00.000Z' });
    const res = resolveAppMatch(slightlyLate);
    expect(res.kind).toBe('resolved');
  });

  it('olöst mot en tom matchlista (inget att matcha mot)', () => {
    const res = resolveAppMatch(nedJpnSnapshot, []);
    expect(res.kind).toBe('unresolved');
  });
});

describe('resolveMatchCoverage: testbar täckningsrapport (full 48/48-brygga)', () => {
  it('rapporterar alla appmatcher; med full brygga är ALLA gruppmatcher bryggbara', () => {
    const report = resolveMatchCoverage();
    expect(report.totalMatches).toBe(WC2026_MATCHES.length);
    expect(report.rows).toHaveLength(WC2026_MATCHES.length);
    // Med full brygga är bryggbara matcher exakt de med seedade lag = de 72 grupp-
    // matcherna (slutspel M73-M104 har null lag tills seedat).
    const groupMatchCount = WC2026_MATCHES.filter((m) => m.stage === 'group').length;
    expect(report.bridgeableMatches).toBe(groupMatchCount);
  });

  it('markerar g-F-1 (ned vs jpn) som bryggbar', () => {
    const report = resolveMatchCoverage();
    const gF1 = report.rows.find((r) => r.appMatchId === 'g-F-1');
    expect(gF1?.bridgeable).toBe(true);
  });

  it('markerar g-A-1 (mex vs rsa) som bryggbar nu (full brygga, var ej bryggbar i Bit 1)', () => {
    const report = resolveMatchCoverage();
    const gA1 = report.rows.find((r) => r.appMatchId === 'g-A-1');
    expect(gA1?.bridgeable).toBe(true);
  });

  it('markerar slutspelsmatcher (oseedade lag, null) som EJ bryggbara', () => {
    const report = resolveMatchCoverage();
    const knockout = report.rows.find((r) => r.appMatchId === 'M73');
    expect(knockout).toBeDefined();
    expect(knockout?.bridgeable).toBe(false);
  });
});
