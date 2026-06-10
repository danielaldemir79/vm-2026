// Anonym auth för tipsligan (T14, #14).
//
// DESIGNVAL (KISS, friktionsfritt för vänner, Daniels val): inloggning är ANONYM.
// En vän klickar på den delade länken och får en stabil anonym identitet utan
// e-post/lösenord. Visningsnamnet bärs av rums-medlemskapet (room_members.display_name),
// inte av auth-profilen, så samma person kan heta olika i olika rum om hen vill,
// och en framtida riktig inloggning (Fas 3) kan läggas ovanpå utan att röra rummen.
//
// STABIL IDENTITET: getSupabaseClient persistar sessionen (localStorage), så
// signInAnonymously körs bara EN gång per webbläsare, därefter återanvänds samma
// user-id. ensureSession() är idempotent: finns redan en session returneras den,
// annars skapas en anonym. Det är seamen UI:t anropar innan rum-operationer.

import type { VmSupabaseClient } from '../supabase-browser';

/** En inloggad (anonym) identitet, det UI:t behöver veta. */
export interface AuthIdentity {
  /** auth.uid(), stabil mellan sidladdningar (persistad session). */
  userId: string;
  /** true om identiteten är anonym (alltid true i Fas 2). */
  isAnonymous: boolean;
}

/**
 * Säkerställ att det finns en (anonym) session och returnera identiteten.
 * Idempotent: återanvänder en befintlig session, skapar bara en ny anonym om
 * ingen finns. Fail loud (PRINCIPLES §8): ett auth-fel kastar med Supabase-
 * meddelandet, det maskeras inte som "ingen användare".
 *
 * @param client  den typade Supabase-klienten (injiceras för testbarhet).
 */
export async function ensureSession(client: VmSupabaseClient): Promise<AuthIdentity> {
  const { data: existing, error: getErr } = await client.auth.getSession();
  if (getErr) {
    throw new Error(`[VM2026] Kunde inte läsa auth-sessionen: ${getErr.message}`);
  }
  if (existing.session?.user) {
    const user = existing.session.user;
    return { userId: user.id, isAnonymous: user.is_anonymous ?? true };
  }

  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    throw new Error(`[VM2026] Anonym inloggning misslyckades: ${error.message}`);
  }
  if (!data.user) {
    // Fail loud: en lyckad signInAnonymously utan user är ett kontraktsbrott.
    throw new Error('[VM2026] Anonym inloggning gav ingen användare (oväntat).');
  }
  return { userId: data.user.id, isAnonymous: data.user.is_anonymous ?? true };
}

/**
 * Läs nuvarande identitet UTAN att skapa en session (null om utloggad). UI:t
 * använder detta för att veta om en vän redan har en identitet vid uppstart.
 */
export async function getCurrentIdentity(client: VmSupabaseClient): Promise<AuthIdentity | null> {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(`[VM2026] Kunde inte läsa auth-sessionen: ${error.message}`);
  }
  const user = data.session?.user;
  if (!user) {
    return null;
  }
  return { userId: user.id, isAnonymous: user.is_anonymous ?? true };
}
