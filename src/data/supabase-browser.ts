// Supabase-browser-klient (T14, #14): EN typad singleton för hela appen.
//
// VARFÖR singleton: @supabase/supabase-js håller auth-sessionen + ev. realtids-
// kanaler internt. Skapar man flera klienter får man flera sessions-lyssnare och
// en varning ("Multiple GoTrueClient instances"). En enda instans per env är en
// sanning för auth + data.
//
// INGA secrets i koden (PRINCIPLES §7): URL + publik nyckel läses ur env
// (import.meta.env), satta i .env.local (gitignorerad) eller Cloudflare. Anon-
// /publishable-nyckeln är publik PER DESIGN (skyddad av RLS), men hör ändå hemma
// i env, aldrig hårdkodad, så källkoden inte binds till ett specifikt projekt.
//
// Sessions-persistens (kravet "stabil identitet för anonym användare"):
// persistSession + autoRefreshToken = på (supabase-js default), så en anonym
// vän behåller SAMMA user-id mellan sidladdningar (token i localStorage,
// auto-uppdaterad). Det är det som gör "gå med i ett rum" beständigt.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase-types';

export type VmSupabaseClient = SupabaseClient<Database>;

/** Lägsta env-formen klienten behöver (url + publik nyckel). */
interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

// Singleton, nyckl ad på url så ett env-byte i test ger en ny klient (annars hade
// en testklient läckt in i nästa). I produktion finns bara en env, alltså en klient.
let cachedClient: VmSupabaseClient | null = null;
let cachedUrl: string | null = null;

/**
 * Hämta (eller skapa) den typade Supabase-klienten ur env.
 *
 * Kastar fail-loud om url/nyckel saknas, getDataSource gatear redan detta
 * (isSupabaseConfigured), men en direkt felanvändning ska smälla tydligt, inte
 * skapa en trasig klient (samma kontrakt som createSupabaseDataSource).
 *
 * @param env  import.meta.env (injiceras för testbarhet).
 */
export function getSupabaseClient(env: SupabaseEnv = import.meta.env): VmSupabaseClient {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      '[VM2026] getSupabaseClient: Supabase-env saknas (VITE_SUPABASE_URL / ' +
        'VITE_SUPABASE_ANON_KEY). Gå via getDataSource som gatear detta.'
    );
  }
  if (cachedClient && cachedUrl === url) {
    return cachedClient;
  }
  cachedClient = createClient<Database>(url, key, {
    auth: {
      // Beständig anonym identitet: behåll sessionen mellan sidladdningar och
      // uppdatera token automatiskt, så vännens user-id (och rums-medlemskap) lever.
      persistSession: true,
      autoRefreshToken: true,
      // Vi använder ingen magic-link/OAuth-redirect, så ingen URL-session att
      // upptäcka, stäng av för att slippa onödig URL-parsning.
      detectSessionInUrl: false,
    },
  });
  cachedUrl = url;
  return cachedClient;
}

/**
 * Nollställ singleton-cachen. ENBART för test (så två tester inte delar en
 * klient med en pågående session). Produktion rör aldrig denna.
 */
export function resetSupabaseClientForTest(): void {
  cachedClient = null;
  cachedUrl = null;
}
