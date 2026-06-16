// Tester för push-preferens-klienten (T89, #182). Fokus:
//  - projectPreferences: default-säker projektion av DB-raden (null-rad -> default, null-fält
//    tolkas som DB-defaulterna), inkl. de DISKRIMINERANDE null-grenarna.
//  - updatePushPreferences: rätt fält mappas, FIFA-koden VERSALISERAS (app-id 'swe' -> 'SWE',
//    matchar DB-constrainten + dispatcherns versalisering), tom patch är no-op (ingen skrivning),
//    fel-vägen kastar.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DEFAULT_PUSH_PREFERENCES,
  projectPreferences,
  readPushPreferences,
  updatePushPreferences,
} from './push-preferences-client';
import type { VmSupabaseClient } from '../../data/supabase-browser';

vi.mock('../../data/rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('projectPreferences (default-säker DB-rad -> ren form)', () => {
  it('null rad -> default (master på, natt av, scope alla, inget lag)', () => {
    expect(projectPreferences(null)).toEqual(DEFAULT_PUSH_PREFERENCES);
  });

  it('null-fält tolkas som DB-defaulterna (notify_enabled null -> PÅ)', () => {
    expect(
      projectPreferences({
        notify_enabled: null,
        quiet_hours_enabled: null,
        match_scope: null,
        favorite_team_id: null,
      })
    ).toEqual({
      notifyEnabled: true,
      quietHoursEnabled: false,
      scope: 'all',
      favoriteTeamId: null,
    });
  });

  it('läser av-värden korrekt (master av, natt på, favorit-scope med lag)', () => {
    expect(
      projectPreferences({
        notify_enabled: false,
        quiet_hours_enabled: true,
        match_scope: 'favorite',
        favorite_team_id: 'SWE',
      })
    ).toEqual({
      notifyEnabled: false,
      quietHoursEnabled: true,
      scope: 'favorite',
      favoriteTeamId: 'SWE',
    });
  });

  it('okänt match_scope-värde faller till "all" (fail-safe)', () => {
    const p = projectPreferences({
      notify_enabled: true,
      quiet_hours_enabled: false,
      match_scope: 'skräp',
      favorite_team_id: null,
    });
    expect(p.scope).toBe('all');
  });
});

/** Chainbar fake som fångar update-patchen + svarar med ett resultat. */
function captureUpdateClient(result: { data: unknown; error: unknown }) {
  const captured: { patch?: Record<string, unknown> } = {};
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn((patch: Record<string, unknown>) => {
    captured.patch = patch;
    return chain;
  });
  chain.not = vi.fn(() => Promise.resolve(result));
  chain.select = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  const client = { from: vi.fn(() => chain) } as unknown as VmSupabaseClient;
  return { client, captured, chain };
}

describe('updatePushPreferences (fält-mappning + FIFA-versalisering)', () => {
  it('mappar notify/natt/scope till DB-kolumnerna', async () => {
    const { client, captured } = captureUpdateClient({ data: null, error: null });
    await updatePushPreferences(client, {
      notifyEnabled: false,
      quietHoursEnabled: true,
      scope: 'favorite',
    });
    expect(captured.patch).toEqual({
      notify_enabled: false,
      quiet_hours_enabled: true,
      match_scope: 'favorite',
    });
  });

  it('VERSALISERAR favoritlaget (app-id "swe" -> "SWE", matchar DB-constraint + dispatcher)', async () => {
    const { client, captured } = captureUpdateClient({ data: null, error: null });
    await updatePushPreferences(client, { favoriteTeamId: 'swe' });
    expect(captured.patch).toEqual({ favorite_team_id: 'SWE' });
  });

  it('favoritlag null rensar (favorite_team_id = null)', async () => {
    const { client, captured } = captureUpdateClient({ data: null, error: null });
    await updatePushPreferences(client, { favoriteTeamId: null });
    expect(captured.patch).toEqual({ favorite_team_id: null });
  });

  it('ett ogiltigt lag-id (fel format) blir null, inte ett trasigt värde (gissa aldrig)', async () => {
    const { client, captured } = captureUpdateClient({ data: null, error: null });
    await updatePushPreferences(client, { favoriteTeamId: 'sverige' });
    expect(captured.patch).toEqual({ favorite_team_id: null });
  });

  it('tom patch -> ingen skrivning (no-op)', async () => {
    const { client, chain } = captureUpdateClient({ data: null, error: null });
    await updatePushPreferences(client, {});
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('FAIL LOUD: ett DB-fel kastar med svensk text', async () => {
    const { client } = captureUpdateClient({ data: null, error: { message: 'rls-neka' } });
    await expect(updatePushPreferences(client, { notifyEnabled: false })).rejects.toThrow(
      /Kunde inte spara notis-inställningarna/
    );
  });
});

describe('readPushPreferences', () => {
  it('läser och projicerar raden (natt på)', async () => {
    const { client } = captureUpdateClient({
      data: {
        notify_enabled: true,
        quiet_hours_enabled: true,
        match_scope: 'all',
        favorite_team_id: null,
      },
      error: null,
    });
    expect(await readPushPreferences(client)).toEqual({
      notifyEnabled: true,
      quietHoursEnabled: true,
      scope: 'all',
      favoriteTeamId: null,
    });
  });

  it('ingen rad -> default', async () => {
    const { client } = captureUpdateClient({ data: null, error: null });
    expect(await readPushPreferences(client)).toEqual(DEFAULT_PUSH_PREFERENCES);
  });

  it('FAIL LOUD: läs-fel kastar', async () => {
    const { client } = captureUpdateClient({ data: null, error: { message: 'nät' } });
    await expect(readPushPreferences(client)).rejects.toThrow(/Kunde inte läsa notis/);
  });
});
