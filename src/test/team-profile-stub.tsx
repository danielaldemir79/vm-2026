// Test-hjälpare: en LÄTT TeamProfile-context utan modalen.
//
// VARFÖR: TeamNameButton (klickbart lagnamn, T10) anropar useTeamProfile, som
// FAIL-LOUD:ar utan en provider (rätt i appen: ett klickbart namn utan provider är
// ett wiring-fel). Men ENHETSTESTER av MatchCard/GroupTable renderar komponenten
// isolerat, utan den fulla TeamProfileProvider (som dessutom drar in
// ResultsProvider via modalen). Denna stub ger bara context-värdet (en spårbar
// openProfile-spion + no-op close), så isolerade komponenter kan testas utan att
// montera hela modal-/store-kedjan. Den FULLA providern testas separat.

import type { ReactNode } from 'react';
import { vi } from 'vitest';
import {
  TeamProfileContext,
  type TeamProfileStore,
} from '../features/team-profile/team-profile-context';

/**
 * Wrappa ett test-träd i en minimal TeamProfile-context. `openProfile` är en
 * vitest-spion (default) så ett test kan asserta att ett klick öppnade rätt lag,
 * eller skicka in en egen.
 */
export function TeamProfileStub({
  children,
  openProfile = vi.fn(),
  openTeamId = null,
}: {
  children: ReactNode;
  openProfile?: TeamProfileStore['openProfile'];
  openTeamId?: string | null;
}) {
  const store: TeamProfileStore = {
    openTeamId,
    openProfile,
    closeProfile: vi.fn(),
  };
  return <TeamProfileContext.Provider value={store}>{children}</TeamProfileContext.Provider>;
}
