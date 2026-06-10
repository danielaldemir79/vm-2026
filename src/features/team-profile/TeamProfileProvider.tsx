// Provider för lag-profilen som öppnas från var som helst, + själva modalen.
//
// Ansvar (tunt): hålla "vilket lag är öppet?" i state och exponera open/close till
// hela trädet via TeamProfileContext, samt RENDERA TeamProfilePanel (modalen) en
// gång, så vyerna bara behöver anropa openProfile(teamId). Modalen läser samma
// delade results-store som resten av appen (en sanning för lag/grupper/matcher), så
// profilen alltid speglar det aktuella data-läget (t.ex. inmatade resultat).
//
// VARFÖR provider + modal ihop: modalen ska finnas EN gång i trädet (inte en per
// klickbart lagnamn), och dess synlighet styrs av context-staten. Att äga staten +
// rendera modalen i samma provider gör att en konsument bara wrappar sina vyer en
// gång och får både "öppna"-seamen och overlayn (samma mönster som ResultsProvider).

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { TeamProfileContext, type TeamProfileStore } from './team-profile-context';
import { TeamProfilePanel } from './TeamProfilePanel';

export interface TeamProfileProviderProps {
  children: ReactNode;
}

/**
 * Wrappar vyerna i profil-context:en och renderar modalen. MÅSTE ligga inuti en
 * <ResultsProvider> (TeamProfilePanel läser den delade storen via useResultsStore),
 * annars fail-loud:ar storen. I App ligger den därför innanför ResultsProvider.
 */
export function TeamProfileProvider({ children }: TeamProfileProviderProps) {
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  const openProfile = useCallback((teamId: string) => setOpenTeamId(teamId), []);
  const closeProfile = useCallback(() => setOpenTeamId(null), []);

  const store = useMemo<TeamProfileStore>(
    () => ({ openTeamId, openProfile, closeProfile }),
    [openTeamId, openProfile, closeProfile]
  );

  return (
    <TeamProfileContext.Provider value={store}>
      {children}
      {/* Modalen renderas en gång; den visar laget i openTeamId (eller inget när
          null). Den läser den delade results-storen själv för lag/grupper/matcher. */}
      <TeamProfilePanel openTeamId={openTeamId} onClose={closeProfile} />
    </TeamProfileContext.Provider>
  );
}
