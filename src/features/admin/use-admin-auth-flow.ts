// Hook för admin-inloggningsflödet (T42, #72): e-post -> kod -> bekräfta.
//
// ANSVAR: hålla flödets STEG + fält + fel/laddning, och anropa data-lagrets
// admin-auth (requestAdminEmailUpgrade / confirmAdminEmailUpgrade). All DB-/auth-
// logik bor i data/rooms/admin-auth; den här hooken är bara React-state-maskinen
// (samma ansvarsdelning som övriga providers). UI:t (AdminLogin) är en tunn vy.
//
// VARFÖR en hook (inte en provider): admin-inloggningen är ett lokalt UI-flöde i
// EN sektion, inte ett app-globalt tillstånd (admin-STATUS bor i
// OfficialResultsProvider). En hook är minsta lösningen (KISS).

import { useCallback, useState } from 'react';
import { confirmAdminEmailUpgrade, requestAdminEmailUpgrade } from '../../data/rooms';
import type { VmSupabaseClient } from '../../data/supabase-browser';

/** Flödets steg: ange e-post -> ange kod -> klar (sessionen uppgraderad). */
export type AdminAuthStep = 'email' | 'code' | 'done';

export interface AdminAuthFlow {
  step: AdminAuthStep;
  email: string;
  busy: boolean;
  /** Fel att visa (fail loud, svensk text), eller null. */
  error: string | null;
  setEmail: (value: string) => void;
  /** Skicka inloggningskoden till e-posten (steg 1). */
  requestCode: () => Promise<void>;
  /** Bekräfta med koden ur mejlet (steg 2). */
  confirmCode: (code: string) => Promise<void>;
  /** Börja om (tillbaka till e-post-steget). */
  reset: () => void;
}

/**
 * Admin-inloggningsflödet. `client` injiceras (samma mönster som providers); null
 * (Supabase ej konfigurerat) gör knapparna till no-ops, men sektionen renderas
 * ändå bara i live-läge, så det är bara ett skyddsnät.
 */
export function useAdminAuthFlow(client: VmSupabaseClient | null): AdminAuthFlow {
  const [step, setStep] = useState<AdminAuthStep>('email');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = useCallback(async () => {
    if (!client) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestAdminEmailUpgrade(client, email);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skicka inloggningskoden.');
    } finally {
      setBusy(false);
    }
  }, [client, email]);

  const confirmCode = useCallback(
    async (code: string) => {
      if (!client) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await confirmAdminEmailUpgrade(client, email, code);
        setStep('done');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kunde inte bekräfta inloggningskoden.');
      } finally {
        setBusy(false);
      }
    },
    [client, email]
  );

  const reset = useCallback(() => {
    setStep('email');
    setError(null);
  }, []);

  return { step, email, busy, error, setEmail, requestCode, confirmCode, reset };
}
