// Tester för admin-statistik-VYN (T45, #76). FOKUS: laddning/fel fail-loud,
// rendering av liga-summan + global topplista + per-rum-korten, och att en tom
// överblick visar de lugna tom-tillstånden. Hooken (use-admin-stats) mockas så
// vyn testas isolerat; aggregat-korrektheten ligger i derive-admin-stats.test.ts.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminStats } from './AdminStats';
import {
  OfficialResultsStoreContext,
  type OfficialResultsStore,
} from '../official-results/official-results-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { AdminStatsResult } from './use-admin-stats';

// Mocka hooken: vyn ska testas isolerat (rendering per status), inte I/O.
const statsState = vi.hoisted(() => ({
  current: { status: 'loading', overview: null, error: null } as AdminStatsResult,
}));
vi.mock('./use-admin-stats', () => ({
  useAdminStats: () => statsState.current,
}));

function officialStore(): OfficialResultsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    results: [],
    isAdmin: true,
    client: {} as VmSupabaseClient,
    saveOfficialResult: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  };
}

function renderStats() {
  return render(
    <OfficialResultsStoreContext.Provider value={officialStore()}>
      <AdminStats />
    </OfficialResultsStoreContext.Provider>
  );
}

beforeEach(() => {
  statsState.current = { status: 'loading', overview: null, error: null };
});

describe('AdminStats', () => {
  it('visar laddning (role=status) medan datan hämtas', () => {
    statsState.current = { status: 'loading', overview: null, error: null };
    renderStats();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('fail loud: visar fel (role=alert) med meddelandet', () => {
    statsState.current = { status: 'error', overview: null, error: 'Nätfel' };
    renderStats();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Nätfel');
  });

  it('renderar liga-summan, global topplista och per-rum-korten', () => {
    statsState.current = {
      status: 'ready',
      error: null,
      overview: {
        totalRooms: 2,
        totalTipsters: 3,
        rooms: [
          {
            roomId: 'r1',
            name: 'VM 2026',
            code: 'vm26',
            createdAt: 't0',
            memberCount: 2,
            matchPredictionCount: 10,
            groupPredictionCount: 4,
            bracketPredictionCount: 1,
            leaderboard: [
              { userId: 'u1', displayName: 'Daniel', points: 12, rank: 1, exactHits: 3 },
              { userId: 'u2', displayName: 'Elin', points: 5, rank: 2, exactHits: 1 },
            ],
          },
        ],
        topTipsters: [
          {
            userId: 'u1',
            displayName: 'Daniel',
            roomId: 'r1',
            roomName: 'VM 2026',
            points: 12,
            exactHits: 3,
            rank: 1,
          },
        ],
      },
    };
    const { container } = renderStats();

    // Liga-summan.
    expect(container.querySelector('[data-admin-stats-total-rooms]')?.textContent).toBe('2');
    expect(container.querySelector('[data-admin-stats-total-tipsters]')?.textContent).toBe('3');
    // Global topplista har en rad med Daniel + rummet + poängen.
    expect(container.querySelector('[data-admin-stats-top]')).not.toBeNull();
    expect(screen.getAllByText('VM 2026').length).toBeGreaterThan(0);
    // Per-rum-kortet bär koden + engagemanget.
    expect(container.querySelector('[data-admin-stats-room-code]')?.textContent).toBe('vm26');
    expect(container.querySelector('[data-admin-stats-room-engagement]')?.textContent).toContain(
      '10 matchtips'
    );
  });

  it('tom liga: visar lugna tom-tillstånd (ingen topplista, inga rum)', () => {
    statsState.current = {
      status: 'ready',
      error: null,
      overview: { totalRooms: 0, totalTipsters: 0, rooms: [], topTipsters: [] },
    };
    const { container } = renderStats();
    expect(container.querySelector('[data-admin-stats-top-empty]')).not.toBeNull();
    expect(container.querySelector('[data-admin-stats-rooms-empty]')).not.toBeNull();
  });
});
