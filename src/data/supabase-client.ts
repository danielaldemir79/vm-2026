// Live-Supabase-datakälla, TUNN STUB (byggs ut i T14).
//
// T3 lägger gaten och kontraktet (se data-source.ts), men Supabase-kontot och
// @supabase/supabase-js installeras först i T14. Denna fil uppfyller redan
// DataSource-kontraktet så call-sites och env-gaten är kompletta, men
// metoderna FAIL LOUD i stället för att returnera tyst tom/fejkad data:
// kör appen i live-läge innan T14 är klar ska det krascha högt och tydligt,
// inte låtsas att en tom tabell är ett giltigt live-svar (PRINCIPLES §8).
//
// När T14 bygger detta: installera @supabase/supabase-js, skapa klienten med
// env-värdena, och byt ut notImplemented-anropen mot riktiga frågor som
// PROJICERAR Supabase-radernas fält till domäntyperna (Team/Group/Match).
// Härled projektionen från Supabase-schemats FAKTISKA kolumnnamn, inte från
// konsument-typen, annars göms en mappnings-drift (känd lärdom).

import type { DataSource } from './data-source';
import type { Group, Match, Team } from '../domain/types';

/**
 * Kastar ett tydligt fel för en ännu ej byggd live-metod. Fail loud: ett anrop
 * i live-läge före T14 ska smälla med ett begripligt meddelande, inte tyst ge
 * tom data som ser giltig ut.
 */
function notImplemented(method: string): never {
  throw new Error(
    `[VM2026] Supabase-datakällan (${method}) är inte byggd än (T14). ` +
      'Kör i fixtures-läge tills Supabase-klienten är på plats.'
  );
}

/**
 * Skapa live-datakällan. Tar emot miljö-variablerna (URL + anon-key) som T14
 * använder för att initiera @supabase/supabase-js. Gaten (data-source.ts) har
 * redan verifierat att de finns, men vi läser dem här som ett explicit kontrakt
 * (och fail-loud-skydd) så att signaturen visar exakt vad T14:s implementation
 * behöver, och så att ett felaktigt direkt-anrop utan env smäller tydligt.
 */
export function createSupabaseDataSource(env: ImportMetaEnv): DataSource {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      '[VM2026] createSupabaseDataSource anropades utan giltig Supabase-env ' +
        '(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Gå via getDataSource som gatear detta.'
    );
  }

  // T14: skapa klienten med url + key och projicera raderna till domäntyperna.
  return {
    getTeams: (): Promise<Team[]> => notImplemented('getTeams'),
    getGroups: (): Promise<Group[]> => notImplemented('getGroups'),
    getMatches: (): Promise<Match[]> => notImplemented('getMatches'),
  };
}
