// Tester för push-preferenserna (T89, #182). Fokus:
//  - NATTFÖNSTRETS KANTER i Europe/Stockholm (P2): testa GRÄNSERNA (22:59 ljud, 23:00 tyst,
//    07:59 tyst, 08:00 ljud) , garantin "tyst i [23,08)" bevisas DÄR den lättast bryts
//    (befordrad regel: testa n-1, n, n+1 vid en tröskel). Vi konstruerar UTC-tider som vi VET
//    motsvarar de svenska lokala timmarna (sommartid UTC+2 i juni, vintertid UTC+1 i januari),
//    så DST-hanteringen också bevisas (samma metod kör mot BÅDA årstiderna).
//  - master av / scope (fail-open) / besluts-ordningen.

import { describe, expect, it } from 'vitest';
import {
  isQuietHoursStockholm,
  matchesScope,
  shouldNotifyUser,
  stockholmHour,
  type PushPreferences,
} from './push-preferences';

/** Bygg preferenser med rimliga default (master på, natt av, scope all), override per test. */
function prefs(over: Partial<PushPreferences> = {}): PushPreferences {
  return {
    notifyEnabled: true,
    quietHoursEnabled: false,
    scope: 'all',
    favoriteTeamId: null,
    ...over,
  };
}

const ANY_MATCH = { homeTeamId: 'ESP', awayTeamId: 'CRO' };

describe('stockholmHour (lokal timme i Europe/Stockholm, DST-säker)', () => {
  it('SOMMARTID (juni, UTC+2): 21:00 UTC = 23:00 svensk', () => {
    expect(stockholmHour(new Date('2026-06-20T21:00:00Z'))).toBe(23);
  });
  it('VINTERTID (januari, UTC+1): 22:00 UTC = 23:00 svensk', () => {
    expect(stockholmHour(new Date('2026-01-20T22:00:00Z'))).toBe(23);
  });
  it('midnatt svensk tid normaliseras till 0 (inte 24)', () => {
    // 22:00 UTC i juni = 00:00 svensk (UTC+2).
    expect(stockholmHour(new Date('2026-06-20T22:00:00Z'))).toBe(0);
  });
  it('fail loud på ogiltig Date (ingen tyst NaN)', () => {
    expect(() => stockholmHour(new Date('inte-ett-datum'))).toThrow(/ogiltig/i);
  });
});

describe('isQuietHoursStockholm (P2: nattfönstret 23:00-08:00, kanterna)', () => {
  // SOMMARTID (juni, UTC+2). Lokal svensk timme = UTC-timme + 2.
  it('22:59 svensk (n-1) -> INTE tyst (ljuder)', () => {
    // 20:59 UTC = 22:59 svensk.
    expect(isQuietHoursStockholm(new Date('2026-06-20T20:59:00Z'))).toBe(false);
  });
  it('23:00 svensk (n, start inklusiv) -> TYST', () => {
    expect(isQuietHoursStockholm(new Date('2026-06-20T21:00:00Z'))).toBe(true);
  });
  it('23:59 svensk -> TYST (inne i fönstret)', () => {
    expect(isQuietHoursStockholm(new Date('2026-06-20T21:59:00Z'))).toBe(true);
  });
  it('02:00 svensk (mitt i natten, efter midnatt-wrap) -> TYST', () => {
    // 00:00 UTC = 02:00 svensk.
    expect(isQuietHoursStockholm(new Date('2026-06-21T00:00:00Z'))).toBe(true);
  });
  it('07:59 svensk (n-1 mot slutet) -> TYST', () => {
    // 05:59 UTC = 07:59 svensk.
    expect(isQuietHoursStockholm(new Date('2026-06-21T05:59:00Z'))).toBe(true);
  });
  it('08:00 svensk (n, slut EXKLUSIV) -> INTE tyst (ljuder igen)', () => {
    expect(isQuietHoursStockholm(new Date('2026-06-21T06:00:00Z'))).toBe(false);
  });
  it('08:01 svensk (n+1) -> INTE tyst', () => {
    expect(isQuietHoursStockholm(new Date('2026-06-21T06:01:00Z'))).toBe(false);
  });
  it('15:00 svensk (mitt på dagen) -> INTE tyst', () => {
    expect(isQuietHoursStockholm(new Date('2026-06-20T13:00:00Z'))).toBe(false);
  });
  it('VINTERTID (UTC+1): 23:00 svensk = 22:00 UTC -> TYST (DST hanterad)', () => {
    expect(isQuietHoursStockholm(new Date('2026-01-20T22:00:00Z'))).toBe(true);
    // 21:59 UTC = 22:59 svensk -> ljuder.
    expect(isQuietHoursStockholm(new Date('2026-01-20T21:59:00Z'))).toBe(false);
  });
});

describe('matchesScope (P3: alla vs favoritlag)', () => {
  it("scope 'all' -> alltid sant", () => {
    expect(matchesScope(prefs({ scope: 'all' }), ANY_MATCH)).toBe(true);
  });
  it("scope 'favorite' + favoritlaget spelar (hemma) -> sant", () => {
    expect(matchesScope(prefs({ scope: 'favorite', favoriteTeamId: 'ESP' }), ANY_MATCH)).toBe(true);
  });
  it("scope 'favorite' + favoritlaget spelar (borta) -> sant", () => {
    expect(matchesScope(prefs({ scope: 'favorite', favoriteTeamId: 'CRO' }), ANY_MATCH)).toBe(true);
  });
  it("scope 'favorite' + favoritlaget spelar INTE -> falskt", () => {
    expect(matchesScope(prefs({ scope: 'favorite', favoriteTeamId: 'SWE' }), ANY_MATCH)).toBe(
      false
    );
  });
  it("scope 'favorite' men inget favoritlag valt -> fail-OPEN (sant)", () => {
    expect(matchesScope(prefs({ scope: 'favorite', favoriteTeamId: null }), ANY_MATCH)).toBe(true);
  });
  it("scope 'favorite' i oseedad slutspelsmatch (båda lag null) + valt lag -> falskt", () => {
    const knockout = { homeTeamId: null, awayTeamId: null };
    expect(matchesScope(prefs({ scope: 'favorite', favoriteTeamId: 'SWE' }), knockout)).toBe(false);
  });
});

describe('shouldNotifyUser (besluts-ordning + fail-closed/open)', () => {
  const day = new Date('2026-06-20T13:00:00Z'); // 15:00 svensk, ej natt

  it('default-preferenser -> skicka', () => {
    expect(shouldNotifyUser(prefs(), ANY_MATCH, day)).toEqual({ notify: true });
  });

  it("master av vinner FÖRST -> 'disabled' (även om natt/scope skulle släppa)", () => {
    const decision = shouldNotifyUser(prefs({ notifyEnabled: false }), ANY_MATCH, day);
    expect(decision).toEqual({ notify: false, reason: 'disabled' });
  });

  it("nattläge på + i nattfönstret -> 'quiet-hours'", () => {
    const night = new Date('2026-06-20T22:00:00Z'); // 00:00 svensk
    expect(shouldNotifyUser(prefs({ quietHoursEnabled: true }), ANY_MATCH, night)).toEqual({
      notify: false,
      reason: 'quiet-hours',
    });
  });

  it('nattläge på men DAGTID -> skicka (fönstret stängt)', () => {
    expect(shouldNotifyUser(prefs({ quietHoursEnabled: true }), ANY_MATCH, day)).toEqual({
      notify: true,
    });
  });

  it("scope 'favorite' utan match -> 'out-of-scope'", () => {
    const decision = shouldNotifyUser(
      prefs({ scope: 'favorite', favoriteTeamId: 'SWE' }),
      ANY_MATCH,
      day
    );
    expect(decision).toEqual({ notify: false, reason: 'out-of-scope' });
  });

  it("master av vinner över scope: 'disabled' även när scope inte matchar", () => {
    const decision = shouldNotifyUser(
      prefs({ notifyEnabled: false, scope: 'favorite', favoriteTeamId: 'SWE' }),
      ANY_MATCH,
      day
    );
    expect(decision).toEqual({ notify: false, reason: 'disabled' });
  });

  it("nattläge vinner över scope när båda skulle skippa: 'quiet-hours'", () => {
    const night = new Date('2026-06-20T22:00:00Z');
    const decision = shouldNotifyUser(
      prefs({ quietHoursEnabled: true, scope: 'favorite', favoriteTeamId: 'SWE' }),
      ANY_MATCH,
      night
    );
    expect(decision).toEqual({ notify: false, reason: 'quiet-hours' });
  });
});
