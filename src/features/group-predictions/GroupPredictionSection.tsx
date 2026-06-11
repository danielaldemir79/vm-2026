// Grupp-tips-sektionens yttre skal (T16, #16): visar grupp-tips-vyn bara när det
// sociala rums-lagret är konfigurerat (live-läge), precis som PredictionSection (T15).
//
// VARFÖR gata på rooms.enabled (inte grupp-predictions.enabled): vyn ska synas så
// snart appen är i live-läge, ÄVEN utan ett aktivt rum, för att då visa "gå med i ett
// rum". I fixtures-läge är hela det sociala lagret vilande och sektionen renderar
// inget. `surface` är kort-stilen App ger (samma som PredictionSection).

import type { ReactNode } from 'react';
import { useRoomsStore } from '../rooms';
import { GroupPredictionsProvider } from './GroupPredictionsProvider';
import { GroupPredictionsView } from './GroupPredictionsView';

export function GroupPredictionSection({
  surface,
}: {
  surface: (children: ReactNode) => ReactNode;
}) {
  const rooms = useRoomsStore();
  if (!rooms.enabled) {
    return null;
  }
  return surface(
    <GroupPredictionsProvider>
      <GroupPredictionsView />
    </GroupPredictionsProvider>
  );
}
