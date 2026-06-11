import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { PredictionsProvider } from './PredictionsProvider';
import { usePredictionsStore } from './predictions-context';
import type { Prediction } from '../../data/predictions';
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

/** Ett löfte vars resolve går att trigga utifrån (styr async-ordning i testet). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Liten sond som exponerar storen för assertions. */
function Probe() {
  const store = usePredictionsStore();
  // Fånga ett ev. kast från savePrediction och exponera det (som UI:t gör), så
  // ett avvisat löfte inte blir ett obehandlat fel i testet utan en assertbar text.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Exponera de faktiska matchId-nycklarna (sorterade), så ett race-test kan
  // assertera EXAKT vilka tips som finns, inte bara antalet (en förorening kan ha
  // samma storlek men fel innehåll).
  const keys = [...store.myPredictions.keys()].sort().join(',');
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="count">{store.myPredictions.size}</span>
      <span data-testid="keys">{keys}</span>
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

  it('STALE-REQUEST-VAKT (C14): byt rum under save -> B förorenas EJ + A:s svar droppas', async () => {
    // Race-scenariot: starta ett save i rum A, byt aktivt rum till B MEDAN upserten
    // är i flykt, lös sedan A:s upsert. A:s optimistiska uppdatering får ALDRIG landa
    // i B:s tips-map (mappen är bara keyad på matchId, så utan vakten skulle A:s
    // g-A-1 skriva över/in i B:s state). Samma fel-klass som RoomsProvider KA-F2.

    // Rum A har inga egna tips; rum B har ETT eget tips (g-B-9). Så B:s rena state
    // är exakt {g-B-9} och en förorening (g-A-1) syns som en extra nyckel.
    api.listMyPredictions.mockImplementation(
      async (_client: VmSupabaseClient, roomId: string): Promise<Prediction[]> => {
        if (roomId === 'B') {
          return [{ matchId: 'g-B-9', userId: 'me', homeGoals: 0, awayGoals: 0, updatedAt: 'tB' }];
        }
        return [];
      }
    );
    // Upserten (rum A) löses MANUELLT, så vi hinner byta rum mitt i await:en.
    const pending = deferred<Prediction>();
    api.upsertMyPrediction.mockReturnValue(pending.promise);

    // Wrapper som låter testet byta aktivt rum (A -> B) genom en knapp.
    function Harness() {
      const [roomId, setRoomId] = useState('A');
      return (
        <PredictionsProvider env={env} liveReady client={fakeClient} activeRoomId={roomId}>
          <Probe />
          <button onClick={() => setRoomId('B')}>to-B</button>
        </PredictionsProvider>
      );
    }

    render(<Harness />);
    // Rum A laddat (tomt) och redo.
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    expect(screen.getByTestId('count').textContent).toBe('0');

    // Starta save i rum A (upserten hänger på vårt deferred-löfte).
    await act(async () => {
      screen.getByText('save').click();
    });
    expect(api.upsertMyPrediction).toHaveBeenCalledWith(fakeClient, 'A', {
      matchId: 'g-A-1',
      homeGoals: 2,
      awayGoals: 1,
    });

    // Byt aktivt rum till B under await:en. Load-effekten bumpar token och laddar
    // B:s tips ({g-B-9}). Vänta tills B faktiskt är inläst innan vi löser A:s save.
    await act(async () => {
      screen.getByText('to-B').click();
    });
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('g-B-9'));

    // Lös NU A:s upsert. Den tillhör en föråldrad epok (rum A) och ska droppas.
    await act(async () => {
      pending.resolve({
        matchId: 'g-A-1',
        userId: 'me',
        homeGoals: 2,
        awayGoals: 1,
        updatedAt: 'tA',
      });
      await pending.promise;
    });

    // B:s state är ORÖRD: exakt {g-B-9}, A:s g-A-1 droppades (kom aldrig in).
    expect(screen.getByTestId('keys').textContent).toBe('g-B-9');
    expect(screen.getByTestId('count').textContent).toBe('1');
    // Inget kast: en droppad stale-uppdatering är tyst (inte ett fel), som load-vakten.
    expect(screen.getByTestId('save-error').textContent).toBe('');
  });
});
