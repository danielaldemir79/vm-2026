// Tips-sektionens yttre skal (T15, #15): visar tips-vyn bara när det sociala
// rums-lagret är konfigurerat (live-läge), precis som RoomSection.
//
// VARFÖR gata på rooms.enabled (inte predictions.enabled): tips-vyn ska synas så
// snart appen är i live-läge, ÄVEN utan ett aktivt rum, för att då visa "gå med i
// ett rum för att tippa" (porten till tips). I fixtures-läge (inget Supabase) är
// hela det sociala lagret vilande och sektionen renderar inget, så appen ser ut
// precis som förr lokalt. `surface` är kort-stilen App ger (samma som RoomSection),
// så vi inte renderar en tom Panel i fixtures-läge.

import type { ReactNode } from 'react';
import { useRoomsStore } from '../rooms';
import { PredictionsProvider } from './PredictionsProvider';
import { PredictionsView } from './PredictionsView';

export function PredictionSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const rooms = useRoomsStore();
  if (!rooms.enabled) {
    return null;
  }
  return surface(
    <PredictionsProvider>
      <PredictionsView />
    </PredictionsProvider>
  );
}
