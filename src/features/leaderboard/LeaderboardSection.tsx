// Topplista-sektionens yttre skal (T17, #17): visar topplistan + tips-avslöjandet
// bara när det sociala rums-lagret är konfigurerat (live-läge), precis som T15/T16:s
// tips-sektioner.
//
// VARFÖR gata på rooms.enabled (inte leaderboard.enabled): vyn ska synas så snart
// appen är i live-läge, ÄVEN utan ett aktivt rum, för att då visa "gå med i ett rum".
// I fixtures-läge är hela det sociala lagret vilande och sektionen renderar inget.
// `surface` är kort-stilen App ger (samma som de andra tips-sektionerna).
//
// EN provider, TVÅ vyer: topplistan (alltid) + avslöjandet (renderar sig självt
// tyst tills första matchen avgjorts). Båda läser samma store.

import type { ReactNode } from 'react';
import { useRoomsStore } from '../rooms';
import { LeaderboardProvider } from './LeaderboardProvider';
import { LeaderboardView } from './LeaderboardView';
import { RevealView } from './RevealView';

export function LeaderboardSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const rooms = useRoomsStore();
  if (!rooms.enabled) {
    return null;
  }
  return (
    <LeaderboardProvider>
      {surface(
        <>
          <LeaderboardView />
          <RevealView />
        </>
      )}
    </LeaderboardProvider>
  );
}
