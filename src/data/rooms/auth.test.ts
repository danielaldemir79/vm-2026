import { describe, expect, it, vi } from 'vitest';
import { ensureSession, getCurrentIdentity } from './auth';
import type { VmSupabaseClient } from '../supabase-browser';

// Minimal mock-klient: bara auth-ytan auth.ts rör. `as unknown as VmSupabaseClient`
// så vi slipper bygga hela den breda Supabase-typen i testet (vi testar logiken,
// inte typerna, som tsc redan vaktar).
function mockClient(auth: {
  getSession?: ReturnType<typeof vi.fn>;
  signInAnonymously?: ReturnType<typeof vi.fn>;
}): VmSupabaseClient {
  return { auth } as unknown as VmSupabaseClient;
}

const anonUser = { id: 'user-1', is_anonymous: true };

describe('ensureSession', () => {
  it('återanvänder en befintlig session (idempotent, skapar ingen ny)', async () => {
    const signIn = vi.fn();
    const client = mockClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: anonUser } }, error: null }),
      signInAnonymously: signIn,
    });

    const identity = await ensureSession(client);

    expect(identity).toEqual({ userId: 'user-1', isAnonymous: true });
    // Stabil identitet: ingen ny anonym inloggning när en session redan finns.
    expect(signIn).not.toHaveBeenCalled();
  });

  it('skapar en anonym session när ingen finns', async () => {
    const client = mockClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInAnonymously: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'new-1', is_anonymous: true } }, error: null }),
    });

    const identity = await ensureSession(client);

    expect(identity).toEqual({ userId: 'new-1', isAnonymous: true });
  });

  it('fail loud:ar (kastar) om getSession ger ett fel', async () => {
    const client = mockClient({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: { message: 'nät nere' } }),
    });

    await expect(ensureSession(client)).rejects.toThrow(/Kunde inte läsa auth-sessionen: nät nere/);
  });

  it('fail loud:ar (kastar) om anonym inloggning misslyckas', async () => {
    const client = mockClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInAnonymously: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: { message: 'anon avstängt' } }),
    });

    await expect(ensureSession(client)).rejects.toThrow(
      /Anonym inloggning misslyckades: anon avstängt/
    );
  });

  it('fail loud:ar om signInAnonymously lyckas men inte ger en user (kontraktsbrott)', async () => {
    const client = mockClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    });

    await expect(ensureSession(client)).rejects.toThrow(/gav ingen användare/);
  });
});

describe('getCurrentIdentity', () => {
  it('returnerar identiteten när en session finns', async () => {
    const client = mockClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: anonUser } }, error: null }),
    });

    await expect(getCurrentIdentity(client)).resolves.toEqual({
      userId: 'user-1',
      isAnonymous: true,
    });
  });

  it('returnerar null UTAN att skapa en session när ingen finns', async () => {
    const client = mockClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    });

    await expect(getCurrentIdentity(client)).resolves.toBeNull();
  });

  it('fail loud:ar (kastar) om getSession ger ett fel', async () => {
    const client = mockClient({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: { message: 'trasig' } }),
    });

    await expect(getCurrentIdentity(client)).rejects.toThrow(
      /Kunde inte läsa auth-sessionen: trasig/
    );
  });
});
