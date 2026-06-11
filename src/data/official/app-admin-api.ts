// App-admin-API (T42, #72): "är den inloggade användaren app-admin?"
//
// ANSVAR: en enda läs-fråga som UI:t använder för att veta om admin-läget ska
// visas (admin-resultat-inmatningen) eller döljas (vanlig användare ser facit
// read-only). Detta är BARA en VISNINGS-grind , den RIKTIGA säkerheten är RLS:
// även om en icke-admin lurar fram admin-UI:t i klienten nekar servern (RLS
// is_app_admin) varje facit-skrivning. Klient-gaten gör bara VISNINGEN sann.
//
// Vi anropar RPC:n is_app_admin() (SECURITY DEFINER, EXECUTE för anon/authenticated),
// samma helper RLS-policyn använder, så klientens "är jag admin?" och serverns
// skrivskydd har EN sanning (kan aldrig drifta isär). FAIL LOUD: ett oväntat fel
// kastas; men en vanlig "inte admin" är bara `false`, inget fel.

import type { VmSupabaseClient } from '../supabase-browser';
import { ensureSession } from '../rooms/auth';

/**
 * Är den inloggade användaren app-admin? SÄKERSTÄLLER först en session (appen kör
 * anonym auth) och frågar sedan RPC:n is_app_admin() , exakt den helper RLS
 * använder för facit-skrivskyddet, så VISNINGEN och SKYDDET delar sanning.
 *
 * @returns true bara för en användare i app_admins (i praktiken Daniel). En anonym
 *          icke-admin får false (och ser facit read-only). Fail loud vid nätfel/RPC-fel.
 */
export async function isAppAdmin(client: VmSupabaseClient): Promise<boolean> {
  await ensureSession(client);
  const { data, error } = await client.rpc('is_app_admin');
  if (error) {
    throw new Error(`[VM2026] Kunde inte avgöra admin-behörighet: ${error.message}`);
  }
  // RPC:n returnerar en boolean; en saknad rad (oväntat) tolkas konservativt som
  // INTE admin (fail-safe: hellre dölj admin-läget än visa det felaktigt).
  return data === true;
}
