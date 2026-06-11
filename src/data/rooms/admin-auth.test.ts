import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requestAdminEmailUpgrade, confirmAdminEmailUpgrade, signOutAdmin } from './admin-auth';
import type { VmSupabaseClient } from '../supabase-browser';

// admin-auth anropar ensureSession (ur ./auth) i request-steget. Vi mockar den så
// testet fokuserar på upgrade-logiken (validering, updateUser, verifyOtp, fel).
vi.mock('./auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'anon-1', isAnonymous: true }),
}));

function mockClient(auth: Record<string, ReturnType<typeof vi.fn>>): VmSupabaseClient {
  return { auth } as unknown as VmSupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requestAdminEmailUpgrade', () => {
  it('avvisar en uppenbart ogiltig e-post (skyddsnät) utan att anropa updateUser', async () => {
    const updateUser = vi.fn();
    await expect(
      requestAdminEmailUpgrade(mockClient({ updateUser }), 'inte-en-mejl')
    ).rejects.toThrow(/Ogiltig e-postadress/);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('UPPGRADERAR den anonyma sessionen via updateUser({ email }), behåller user_id', async () => {
    // Nyckeln i hela T42-auth: updateUser LÄNKAR e-posten till SAMMA användare
    // (ingen ny inloggning), så Daniels user_id + tips följer med.
    const updateUser = vi.fn().mockResolvedValue({ data: { user: { id: 'anon-1' } }, error: null });
    await requestAdminEmailUpgrade(mockClient({ updateUser }), '  daniel@example.com ');
    // Trimmad e-post skickas till updateUser (inte signInWithOtp, som vore en NY
    // användare och hade tappat tipsen).
    expect(updateUser).toHaveBeenCalledWith({ email: 'daniel@example.com' });
  });

  it('fail loud: ett updateUser-fel (t.ex. rate limit) kastar med svensk text', async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: { message: 'rate limit' } });
    await expect(
      requestAdminEmailUpgrade(mockClient({ updateUser }), 'daniel@example.com')
    ).rejects.toThrow(/Kunde inte skicka inloggningslänk: rate limit/);
  });
});

describe('confirmAdminEmailUpgrade', () => {
  it('verifierar koden med typ email_change och returnerar (oförändrade) user_id', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: 'anon-1' } }, error: null });
    const userId = await confirmAdminEmailUpgrade(
      mockClient({ verifyOtp }),
      'daniel@example.com',
      '123456'
    );
    // user_id är OFÖRÄNDRAT (samma anon-1 = tips + admin-roll intakta).
    expect(userId).toBe('anon-1');
    // 'email_change' (bekräfta ny adress för BEFINTLIG användare), inte 'email'.
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'daniel@example.com',
      token: '123456',
      type: 'email_change',
    });
  });

  it('fail loud: en fel/utgången kod kastar med svensk text', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: { message: 'invalid token' } });
    await expect(
      confirmAdminEmailUpgrade(mockClient({ verifyOtp }), 'd@e.com', '000000')
    ).rejects.toThrow(/Kunde inte bekräfta inloggningskoden: invalid token/);
  });

  it('fail loud: ett svar utan user är ett kontraktsbrott', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      confirmAdminEmailUpgrade(mockClient({ verifyOtp }), 'd@e.com', '111111')
    ).rejects.toThrow(/gav ingen användare/);
  });
});

describe('signOutAdmin', () => {
  it('loggar ut och fail-loud:ar vid fel', async () => {
    const okClient = mockClient({ signOut: vi.fn().mockResolvedValue({ error: null }) });
    await expect(signOutAdmin(okClient)).resolves.toBeUndefined();

    const badClient = mockClient({
      signOut: vi.fn().mockResolvedValue({ error: { message: 'nej' } }),
    });
    await expect(signOutAdmin(badClient)).rejects.toThrow(/Kunde inte logga ut: nej/);
  });
});
