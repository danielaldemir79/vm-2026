import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isAppAdmin } from './app-admin-api';
import type { VmSupabaseClient } from '../supabase-browser';

vi.mock('../rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

function mockClient(rpc: ReturnType<typeof vi.fn>): VmSupabaseClient {
  return { rpc } as unknown as VmSupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isAppAdmin', () => {
  it('true när RPC:n is_app_admin returnerar true', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(isAppAdmin(mockClient(rpc))).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('is_app_admin');
  });

  it('false för en vanlig användare (RPC returnerar false)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(isAppAdmin(mockClient(rpc))).resolves.toBe(false);
  });

  it('fail-safe: ett oväntat icke-boolean svar tolkas som INTE admin', async () => {
    // Hellre dölja admin-läget än visa det felaktigt (tävlingsintegritet).
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(isAppAdmin(mockClient(rpc))).resolves.toBe(false);
  });

  it('fail loud: ett RPC-fel kastar med svensk text', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(isAppAdmin(mockClient(rpc))).rejects.toThrow(
      /Kunde inte avgöra admin-behörighet: boom/
    );
  });
});
