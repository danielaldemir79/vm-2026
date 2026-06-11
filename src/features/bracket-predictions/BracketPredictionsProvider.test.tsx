import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BracketPredictionsProvider } from './BracketPredictionsProvider';
import { useBracketPredictionsStore } from './bracket-predictions-context';
import type { BracketPrediction } from '../../data/predictions';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import { teamCode } from '../../domain/team-code';

// Mocka bracket-tips-API:t (vi testar provider-wiringen, inte Supabase-anropen som
// testas i bracket-predictions-api.test.ts / RLS-integrationstestet).
const api = vi.hoisted(() => ({
  listMyBracketPredictions: vi.fn(),
  upsertMyBracketPrediction: vi.fn(),
}));
vi.mock('../../data/predictions', () => ({
  listMyBracketPredictions: api.listMyBracketPredictions,
  upsertMyBracketPrediction: api.upsertMyBracketPrediction,
}));

vi.mock('../../data', () => ({
  isSupabaseConfigured: () => true,
  LIVE_READY: true,
}));

vi.mock('../rooms', () => ({
  useRoomsSync: () => ({ activeRoomId: null, sharedResults: [], saveResult: vi.fn() }),
}));

const fakeClient = {} as unknown as VmSupabaseClient;
const env = {} as ImportMetaEnv;

function bp(slotId: string, code: string): BracketPrediction {
  return {
    slotId,
    userId: 'me',
    // Brandning: BracketPrediction-fältet bär Team.code (C1+C2), brandas vid testgränsen.
    advancingTeamId: teamCode(code),
    updatedAt: 't1',
  };
}

function Probe() {
  const store = useBracketPredictionsStore();
  const keys = [...store.myBracketPredictions.keys()].sort().join(',');
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="keys">{keys}</span>
      <button
        type="button"
        onClick={() => {
          store
            .saveBracketPrediction({ slotId: 'M73', advancingTeamId: teamCode('BRA') })
            .catch(() => {});
        }}
      >
        save
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketPredictionsProvider', () => {
  it('utan aktivt rum: storen är inaktiv (idle, enabled=false), inget API-anrop', () => {
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId={null}>
        <Probe />
      </BracketPredictionsProvider>
    );
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(api.listMyBracketPredictions).not.toHaveBeenCalled();
  });

  it('med aktivt rum: laddar mina bracket-tips och fyller mappen (slotId-nycklar)', async () => {
    api.listMyBracketPredictions.mockResolvedValue([bp('M73', 'BRA'), bp('champion', 'ARG')]);
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('keys')).toHaveTextContent('M73,champion');
  });

  it('save: speglar in det sparade bracket-tipset i mappen (optimistiskt)', async () => {
    api.listMyBracketPredictions.mockResolvedValue([]);
    api.upsertMyBracketPrediction.mockResolvedValue(bp('M73', 'BRA'));
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    await act(async () => {
      screen.getByText('save').click();
    });
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('M73'));
    expect(api.upsertMyBracketPrediction).toHaveBeenCalledWith(fakeClient, 'r1', {
      slotId: 'M73',
      advancingTeamId: 'BRA',
    });
  });

  it('fel-väg: ett laddningsfel ger status error (fail loud, inte tyst tom)', async () => {
    api.listMyBracketPredictions.mockRejectedValue(new Error('boom'));
    render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="r1">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
  });

  it('EPOCH-VAKT: ett föråldrat laddnings-svar (rum A) skriver inte över ett nyare rum (B)', async () => {
    // Rum A:s laddning hänger (utlöses manuellt EFTER rumsbytet); rum B löser direkt.
    let resolveA!: (v: BracketPrediction[]) => void;
    const aPending = new Promise<BracketPrediction[]>((res) => {
      resolveA = res;
    });
    api.listMyBracketPredictions
      .mockReturnValueOnce(aPending) // rum A: hänger
      .mockResolvedValueOnce([bp('M80', 'FRA')]); // rum B: löser direkt

    const { rerender } = render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rA">
        <Probe />
      </BracketPredictionsProvider>
    );
    // Byt till rum B INNAN rum A:s svar landar (bumpar epoch-token).
    rerender(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rB">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('keys')).toHaveTextContent('M80'));

    // Nu landar rum A:s FÖRÅLDRADE svar. Epoch-vakten ska KASTA det (inte visa A:s tips).
    await act(async () => {
      resolveA([bp('M73', 'BRA')]);
      await aPending;
    });
    // Mappen ska fortfarande bara bära rum B:s tips (M80), inte A:s (M73).
    expect(screen.getByTestId('keys')).toHaveTextContent('M80');
    expect(screen.getByTestId('keys')).not.toHaveTextContent('M73');
  });

  it('STALE-SAVE-VAKT: ett save som löser efter ett rumsbyte skriver inte i nya rummets map', async () => {
    api.listMyBracketPredictions.mockResolvedValue([]); // båda rummen: tomma
    // Upserten (startad i rum A) hänger tills vi löser den efter rumsbytet.
    let resolveSave!: (v: BracketPrediction) => void;
    const savePending = new Promise<BracketPrediction>((res) => {
      resolveSave = res;
    });
    api.upsertMyBracketPrediction.mockReturnValueOnce(savePending);

    const { rerender } = render(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rA">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Starta ett save i rum A (upserten hänger).
    act(() => {
      screen.getByText('save').click();
    });
    // Byt rum till B medan saven är i await (bumpar epoch-token).
    rerender(
      <BracketPredictionsProvider env={env} client={fakeClient} activeRoomId="rB">
        <Probe />
      </BracketPredictionsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Lös A:s save NU. Stale-vakten ska droppa den lokala spegeln (inte skriva i B:s map).
    await act(async () => {
      resolveSave(bp('M73', 'BRA'));
      await savePending;
    });
    expect(screen.getByTestId('keys')).not.toHaveTextContent('M73');
  });
});
