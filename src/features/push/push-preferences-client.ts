// PUSH-PREFERENS-KLIENT (T89, #182): de SIDO-EFFEKTANDE läs/skriv-stegen mot
// push_subscriptions-preferens-kolumnerna (notify_enabled / quiet_hours_enabled / match_scope /
// favorite_team_id). Den RENA beslutslogiken bor i push-preferences.ts (delad med dispatchern);
// den HÄR filen är bara IO mot Supabase, så hooken/UI:t kan läsa och spara användarens val.
//
// Preferenserna är PER ENHET (en rad per endpoint, T85), men en användare har i praktiken en
// rad per enhet. Vi uppdaterar ALLA den inloggades rader (RLS gatar redan på auth.uid()), så ett
// val i Mer på en enhet speglas till användarens alla enheter , förväntat när man "ställer in
// notiserna". (Self-scope: update träffar bara egna rader via RLS.)
//
// FAIL LOUD (PRINCIPLES §8): varje fel kastar med ett begripligt svenskt meddelande.

import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { Database } from '../../data/supabase-types';
import { ensureSession } from '../../data/rooms/auth';
import type { MatchScope, PushPreferences } from './push-preferences';

/** Den typade Update-formen för push_subscriptions (ur det genererade DB-schemat). */
type PushSubscriptionUpdate = Database['public']['Tables']['push_subscriptions']['Update'];

/** Default-preferenser (speglar DB-defaulterna): master på, natt av, scope alla, inget favoritlag. */
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  notifyEnabled: true,
  quietHoursEnabled: false,
  scope: 'all',
  favoriteTeamId: null,
};

/** En DB-rad ur push_subscriptions (bara preferens-kolumnerna vi läser). */
interface PreferenceRow {
  notify_enabled: boolean | null;
  quiet_hours_enabled: boolean | null;
  match_scope: string | null;
  favorite_team_id: string | null;
}

/** Projicera en DB-rad till den rena PushPreferences-formen (default-säker). */
export function projectPreferences(row: PreferenceRow | null): PushPreferences {
  if (row === null) {
    return DEFAULT_PUSH_PREFERENCES;
  }
  return {
    notifyEnabled: row.notify_enabled !== false, // NOT NULL default true; null -> på
    quietHoursEnabled: row.quiet_hours_enabled === true,
    scope: row.match_scope === 'favorite' ? 'favorite' : 'all',
    favoriteTeamId: row.favorite_team_id ?? null,
  };
}

/**
 * Läs den inloggades preferenser. Eftersom en användare kan ha flera enheter (rader) läser vi
 * den FÖRSTA (de delar avsikt; UI:t visar en samlad inställning). Ingen rad (ingen prenumeration
 * än) -> default. RLS gatar på auth.uid(), så vi ser bara egna rader.
 */
export async function readPushPreferences(client: VmSupabaseClient): Promise<PushPreferences> {
  await ensureSession(client);
  const { data, error } = await client
    .from('push_subscriptions')
    .select('notify_enabled, quiet_hours_enabled, match_scope, favorite_team_id')
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`[VM2026] Kunde inte läsa notis-inställningarna: ${error.message}`);
  }
  return projectPreferences(data);
}

/** En FIFA-kod (3 versaler) ur ett app-lag-id (gemen), eller null. Matchar DB-constrainten. */
function toFifaCode(teamId: string | null): string | null {
  if (teamId === null) {
    return null;
  }
  const code = teamId.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** De skrivbara preferens-fälten (partiell uppdatering, bara det som ändrats skickas). */
export interface PreferenceUpdate {
  notifyEnabled?: boolean;
  quietHoursEnabled?: boolean;
  scope?: MatchScope;
  /** App-lag-id (gemen, t.ex. 'swe'); versaliseras till FIFA-kod innan lagring. null = rensa. */
  favoriteTeamId?: string | null;
}

/**
 * Uppdatera den inloggades preferenser (alla dennes enheter , RLS gatar på auth.uid()). Bara de
 * angivna fälten skrivs. Returnerar inget; FAIL LOUD vid fel.
 *
 * VARFÖR update (inte upsert): preferenser ändras bara på en ENHET SOM REDAN PRENUMERERAT (raden
 * finns). Finns ingen rad (ingen prenumeration) är det en no-op , man måste aktivera notiser
 * först. Update-grenen täcks av push_subscriptions_update_own-policyn (T85).
 */
export async function updatePushPreferences(
  client: VmSupabaseClient,
  update: PreferenceUpdate
): Promise<void> {
  await ensureSession(client);
  const patch: PushSubscriptionUpdate = {};
  if (update.notifyEnabled !== undefined) {
    patch.notify_enabled = update.notifyEnabled;
  }
  if (update.quietHoursEnabled !== undefined) {
    patch.quiet_hours_enabled = update.quietHoursEnabled;
  }
  if (update.scope !== undefined) {
    patch.match_scope = update.scope;
  }
  if (update.favoriteTeamId !== undefined) {
    patch.favorite_team_id = toFifaCode(update.favoriteTeamId);
  }
  if (Object.keys(patch).length === 0) {
    return; // inget att uppdatera
  }
  // Uppdatera alla den inloggades rader. RLS (user_id = auth.uid()) begränsar redan till egna;
  // vi behöver inget user_id-villkor (och har inte user_id i klienten). En not-null-matchning på
  // endpoint träffar alla egna rader.
  const { error } = await client
    .from('push_subscriptions')
    .update(patch)
    .not('endpoint', 'is', null);
  if (error) {
    throw new Error(`[VM2026] Kunde inte spara notis-inställningarna: ${error.message}`);
  }
}
