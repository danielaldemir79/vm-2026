// Admin-inloggning via e-post (T42, #72): uppgradera en ANONYM session till en
// permanent e-post-identitet UTAN att tappa user_id eller tips.
//
// VARFÖR DEN HÄR VÄGEN (gissas inte, källverifierad mot Supabase-dokumentationen):
// admin (Daniel) har redan en anonym session med ett user_id som äger hans 85 tips
// (FK på user_id) och hans admin-rad i app_admins. Om vi i stället loggade in via
// `signInWithOtp({ email })` skulle Supabase logga in på en SEPARAT e-post-användare
// (nytt user_id) och Daniel skulle TAPPA sina tips + admin-rollen. Den RÄTTA vägen
// är att LÄNKA e-posten till den BEFINTLIGA anonyma användaren via
// `updateUser({ email })`, som behåller SAMMA user_id (auth.users-raden ändras inte,
// bara dess email-kolumn fylls). Källa: Supabase "Anonymous Sign-Ins -> Convert an
// anonymous user to a permanent user" (https://supabase.com/docs/guides/auth/auth-anonymous).
//
// TVÅSTEGS-FLÖDE (in-page, ingen redirect krävs i normalfallet):
//   1. requestAdminEmailUpgrade(client, email): ensureSession (säkerställ att vi
//      uppgraderar en BEFINTLIG anonym session, inte loggar in på nytt) + updateUser
//      ({ email }). Supabase skickar en bekräftelse till adressen (typ 'email_change').
//   2. confirmAdminEmailUpgrade(client, email, token): verifyOtp med typ
//      'email_change' låser e-posten till samma user_id. Sessionen är nu permanent.
//      (Alternativt klickar admin LÄNKEN i mejlet; då plockar klienten upp sessionen
//      via detectSessionInUrl, se supabase-browser.ts. Koden-vägen är primär.)
//
// FAIL LOUD (PRINCIPLES §8): varje auth-fel kastas vidare med begriplig svensk text.
//
// BEHÖVER DANIEL (dashboard, dokumenterat i docs/decisions.md T42): för att mejlet
// ska bära en 6-SIFFRIG KOD (i stället för bara en länk) måste mallen "Change email
// address" innehålla {{ .Token }}. Och Supabase free tier har en INBYGGD, hårt
// rate-limitad e-postsändning (några mejl/timme, för test) , för pålitlig sändning
// kan Daniel koppla en egen SMTP. Inget av detta blockerar klient-koden här.

import type { VmSupabaseClient } from '../supabase-browser';
import { ensureSession } from './auth';

/** En enkel e-postvalidering (UI:t validerar också, detta är skyddsnätet). */
function isLikelyEmail(email: string): boolean {
  // Avsiktligt enkel: en @ med tecken på båda sidor + en punkt i domänen. Servern
  // är den slutgiltiga sanningen; vi vill bara fånga uppenbart trasiga inmatningar.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * STEG 1: begär uppgradering av den anonyma sessionen till en e-post-identitet.
 * Skickar en bekräftelse (kod + länk) till adressen. Behåller user_id (länkning,
 * inte ny inloggning), så admins tips + admin-roll följer med.
 *
 * @throws om e-posten är uppenbart ogiltig, eller om Supabase nekar (t.ex. adressen
 *         redan kopplad till en annan användare, eller rate limit).
 */
export async function requestAdminEmailUpgrade(
  client: VmSupabaseClient,
  email: string
): Promise<void> {
  const trimmed = email.trim();
  if (!isLikelyEmail(trimmed)) {
    throw new Error('[VM2026] Ogiltig e-postadress.');
  }
  // Säkerställ att vi har en (anonym) session att UPPGRADERA. Utan detta skulle
  // updateUser sakna en användare att länka mot.
  await ensureSession(client);
  const { error } = await client.auth.updateUser({ email: trimmed });
  if (error) {
    throw new Error(`[VM2026] Kunde inte skicka inloggningslänk: ${error.message}`);
  }
}

/**
 * STEG 2: bekräfta uppgraderingen med den 6-siffriga koden ur mejlet. Låser e-posten
 * till SAMMA user_id (verifyOtp typ 'email_change'). Efter detta är sessionen
 * permanent och knuten till e-postadressen, men user_id är oförändrat.
 *
 * @returns det (oförändrade) user_id:t, så anroparen kan bekräfta att identiteten
 *          behölls (samma id som före uppgraderingen = tips + admin-roll intakta).
 * @throws om koden är fel/utgången (verifyOtp-fel), fail loud.
 */
export async function confirmAdminEmailUpgrade(
  client: VmSupabaseClient,
  email: string,
  token: string
): Promise<string> {
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    // 'email_change' = bekräfta den nya adressen för en BEFINTLIG användare (det
    // updateUser-flödet ger), till skillnad från 'email' som är en ren ny inloggning.
    type: 'email_change',
  });
  if (error) {
    throw new Error(`[VM2026] Kunde inte bekräfta inloggningskoden: ${error.message}`);
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('[VM2026] Inloggningen gav ingen användare (oväntat).');
  }
  return userId;
}

/**
 * Logga ut admin (tillbaka till en ny anonym identitet vid nästa rum-operation).
 * VARNING: detta loggar ut den e-post-länkade sessionen; en NY anonym session
 * skapas vid nästa ensureSession (med ett NYTT user_id). Bara för admin-läget.
 */
export async function signOutAdmin(client: VmSupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    throw new Error(`[VM2026] Kunde inte logga ut: ${error.message}`);
  }
}
