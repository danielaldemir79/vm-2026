// Bracket-tips-sektionens yttre skal (T16b, #59): visar bracket-tips-vyn bara när det
// sociala rums-lagret är konfigurerat (live-läge), precis som GroupPredictionSection
// (T16) / PredictionSection (T15).
//
// VARFÖR gata på rooms.enabled (inte bracket-predictions.enabled): vyn ska synas så
// snart appen är i live-läge, ÄVEN utan ett aktivt rum, för att då visa "gå med i ett
// rum". I fixtures-läge är hela det sociala lagret vilande och sektionen renderar
// inget. `surface` är kort-stilen App ger (samma som de andra tips-sektionerna).

import type { ReactNode } from 'react';
import { useRoomsStore } from '../rooms';
import { BracketPredictionsProvider } from './BracketPredictionsProvider';
import { BracketPredictionsView } from './BracketPredictionsView';

export function BracketPredictionSection({
  surface,
}: {
  surface: (children: ReactNode) => ReactNode;
}) {
  const rooms = useRoomsStore();
  if (!rooms.enabled) {
    return null;
  }
  return surface(
    <BracketPredictionsProvider>
      <BracketPredictionsView />
    </BracketPredictionsProvider>
  );
}
