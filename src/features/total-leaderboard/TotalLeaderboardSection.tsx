// Den totala topplistans yttre skal (T82 del 3, #173): wrappar providern + vyn i den
// delade kort-ytan (surface) App ger.
//
// SYNLIGHET: till skillnad från de ANDRA sociala sektionerna (rum/per-rums-topplista,
// som gatar på live-läge) visas den totala topplistan ÄVEN i DEMO/fixtures-läge, för
// där fylls den med ~240 demo-deltagare (botar) , det är hela poängen med demo-fixtures
// (validera UI + bot-data visuellt, decisions.md T82 del 3). Providern är `enabled` i
// demo alltid, och i live när det finns en total; vyn renderar sina egna laddnings-/
// tom-lägen. Inget kort ritas om providern inte är enabled (ingen tom ruta).

import type { ReactNode } from 'react';
import { TotalLeaderboardProvider } from './TotalLeaderboardProvider';
import { TotalLeaderboardView } from './TotalLeaderboardView';
import { useTotalLeaderboardStore } from './total-leaderboard-context';

/** Inre del: läser storen och renderar kortet bara när det finns en total att visa. */
function TotalLeaderboardCard({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const store = useTotalLeaderboardStore();
  if (!store.enabled) {
    return null;
  }
  return surface(<TotalLeaderboardView />);
}

export function TotalLeaderboardSection({
  surface,
}: {
  surface: (children: ReactNode) => ReactNode;
}) {
  // Providern ligger UTANFÖR gaten så storen alltid finns för TotalLeaderboardCard att
  // läsa; kortet (och dess kostsamma demo-bygge konsumeras bara när enabled) ritas inuti.
  return (
    <TotalLeaderboardProvider>
      <TotalLeaderboardCard surface={surface} />
    </TotalLeaderboardProvider>
  );
}
