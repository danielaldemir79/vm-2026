import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { PredictionsProvider } from './PredictionsProvider';
import { usePredictionsStore } from './predictions-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// Mocka tips-API:t (vi testar provider-wiringen, inte Supabase-anropen som testas
// i predictions-api.test.ts / RLS-integrationstestet).
const api = vi.hoisted(() => ({
  listMyPredictions: vi.fn(),
  upsertMyPrediction: vi.fn(),
}));
vi.mock('../../data/predictions', () => ({
  listMyPredictions: api.listMyPredictions,
  upsertMyPrediction: api.upsertMyPrediction,
}));

// Env-gaten ska säga "live aktivt" så provider:n går till live-grenen i testet.
vi.mock('../../data', () => ({
  isSupabaseConfigured: () => true,
  LIVE_READY: true,
}));

// useRoomsSync ger det aktiva rummet. Vi injicerar dock activeRoomId direkt via
// prop i testerna, men hooken anropas ovillkorligt, så den måste finnas.
vi.mock('../rooms', () => ({
  useRoomsSync: () => ({ activeRoomId: null, sharedResults: [], saveResult: vi.fn() }),
}));

const fakeClient = {} as unknown as VmSupabaseClient;
const env = {} as ImportMetaEnv;

/** Liten sond som exponerar storen för assertions. */
function Probe() {
  const store = usePredictionsStore();
  // Fånga ett ev. kast från savePrediction och exponera det (som UI:t gör), så
  // ett avvisat löfte inte blir ett obehandlat fel i testet utan en assertbar text.
  const [saveError, setSaveError] = useState<string | null>(null);
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="count">{store.myPredictions.size}</span>
      <span data-testid="save-error">{saveError ?? ''}</span>
      <button
        onClick={() =>
          store
            .savePrediction({ matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 })
            .catch((err: unknown) => setSaveError(err instanceof Error ? err.message : 'fel'))
        }
      >
        save
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PredictionsProvider', () => {
  it('UTAN aktivt rum: idle, inte enabled, inga tips laddas', async () => {
    render(
      <PredictionsProvider env={env} liveReady client={fakeClient} activeRoomId={null}>
        <Probe />
      </PredictionsProvider>
    );
    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(screen.getByTestId('enabled').textContent).toBe('false');
    expect(api.listMyPredictions).not.toHaveBeenCalled();
  });

  it('MED aktivt rum: laddar mina tips och blir ready', async () => {
    api.listMyPredictions.mockResolvedValue([
      { matchId: 'g-A-1', userId: 'me', homeGoals: 1, awayGoals: 0, updatedAt: 't' },
    ]);
    render(
      <PredictionsProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </PredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('enabled').textContent).toBe('true');
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(api.listMyPredictions).toHaveBeenCalledWith(fakeClient, 'r1');
  });

  it('savePrediction uppdaterar storen optimistiskt (nytt tips i mappen)', async () => {
    api.listMyPredictions.mockResolvedValue([]);
    api.upsertMyPrediction.mockResolvedValue({
      matchId: 'g-A-1',
      userId: 'me',
      homeGoals: 2,
      awayGoals: 1,
      updatedAt: 't2',
    });
    render(
      <PredictionsProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </PredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('count').textContent).toBe('0');

    await act(async () => {
      screen.getByText('save').click();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(api.upsertMyPrediction).toHaveBeenCalledWith(fakeClient, 'r1', {
      matchId: 'g-A-1',
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it('FAIL LOUD: en laddnings-miss ger status error + meddelande', async () => {
    api.listMyPredictions.mockRejectedValue(new Error('nät-fel'));
    render(
      <PredictionsProvider env={env} liveReady client={fakeClient} activeRoomId="r1">
        <Probe />
      </PredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
  });

  it('FAIL LOUD (C5/C12): savePrediction utan aktivt rum KASTAR med RUM-felet (ingen tyst no-op)', async () => {
    // Inget rum (men klient finns) -> savePrediction har inget att spara till.
    // Kontraktet säger "Kastar vid fel"; en tyst return hade gett ett falskt
    // "Sparat". Verifiera att löftet avvisas med det SPECIFIKA rum-felet (C12: skilt
    // från klient-felet) och att upsert ALDRIG anropas (ingen halv-väg-skrivning).
    render(
      <PredictionsProvider env={env} liveReady client={fakeClient} activeRoomId={null}>
        <Probe />
      </PredictionsProvider>
    );
    expect(screen.getByTestId('enabled').textContent).toBe('false');

    await act(async () => {
      screen.getByText('save').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('save-error').textContent).toMatch(/inget aktivt rum/)
    );
    // Det är RUM-felet, INTE klient-felet (de skiljs åt, C12).
    expect(screen.getByTestId('save-error').textContent).not.toMatch(/Supabase-klient/);
    expect(api.upsertMyPrediction).not.toHaveBeenCalled();
  });

  it('FAIL LOUD (C12): savePrediction utan Supabase-klient KASTAR med KLIENT-felet', async () => {
    // Ingen injicerad klient OCH live ej konfigurerat (liveReady=false) -> supabase
    // blir null. Även MED ett rum-id ska savePrediction då kasta KLIENT-felet (den
    // mer grundläggande bristen), skilt från rum-felet, så ett wiring-fel kan
    // felsökas ur texten (C12). upsert ska aldrig anropas.
    render(
      <PredictionsProvider env={env} liveReady={false} activeRoomId="r1">
        <Probe />
      </PredictionsProvider>
    );

    await act(async () => {
      screen.getByText('save').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('save-error').textContent).toMatch(/ingen Supabase-klient/)
    );
    // Det är KLIENT-felet, INTE rum-felet (de skiljs åt, C12).
    expect(screen.getByTestId('save-error').textContent).not.toMatch(/inget aktivt rum/);
    expect(api.upsertMyPrediction).not.toHaveBeenCalled();
  });
});
