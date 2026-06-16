// Topplista-sektionens yttre skal (T17, #17): visar per-rums-topplistan + tips-poäng-
// sammanfattningen bara när det sociala rums-lagret är konfigurerat (live-läge), precis
// som T15/T16:s tips-sektioner.
//
// VARFÖR gata på rooms.enabled (inte leaderboard.enabled): vyn ska synas så snart
// appen är i live-läge, ÄVEN utan ett aktivt rum, för att då visa "gå med i ett rum".
// I fixtures-läge är hela det sociala lagret vilande och sektionen renderar inget.
// `surface` är kort-stilen App ger (samma som de andra tips-sektionerna).
//
// EN provider, FLERA vyer: sammanfattningen ÖVERST (egen poäng + placering + "Så funkar
// poängen", T46) + topplistan (alltid). Båda läser samma store.
//
// PROVIDERN ÄR HOISTAD (T58, #99): LeaderboardProvider bor nu i App och OMSLUTER både
// tips-sektionen (dess poäng-summering) OCH denna sektion, så de delar EN store och EN
// hämtning (ingen dubbel fetch). Denna sektion KONSUMERAR alltså den befintliga providern
// i stället för att skapa en egen (annars vore det två providers = två hämtningar).
//
// ORDNING (T46, #79): sammanfattningen ÖVERST så man ser sina egna poäng utan att skrolla,
// topplistan under.
//
// T92 (del B + D, Daniels skärmdumps-feedback 2026-06-16): TVÅ ändringar mot förr.
//   (B) Den REDUNDANTA sektions-kollapsen (CollapsibleBody "Fäll ihop") är BORTTAGEN. På en
//       fokuserad Topplista-flik ÄR listan flikens innehåll, så en sektions-kollaps ovanpå
//       list-kontrollen ("Visa alla N", som bor i LeaderboardView) gav TVÅ konkurrerande
//       "fäll ihop" , förvirrande. Vi behåller bara list-kontrollen (kompakt <-> alla).
//   (D) Tips-AVSLÖJANDET (RevealView) är FLYTTAT härifrån till botten av Tips-fliken (egen
//       RevealSection med paginering + drill-in). Det hör tematiskt till tipsen ("vad alla
//       tippade"), och att ha det här tvingade fram sektions-kollapsen. Topplista = per-rum
//       -> global (TotalLeaderboardSection renderas direkt under denna i App).

import type { ReactNode } from 'react';
import { LeaderboardSummary } from './LeaderboardSummary';
import { LeaderboardView } from './LeaderboardView';
import { useRoomsStore } from '../rooms';

export function LeaderboardSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const rooms = useRoomsStore();
  if (!rooms.enabled) {
    return null;
  }
  // Poäng-sammanfattningen (egen poäng + placering) ALLTID synlig överst (man ska se sina
  // egna poäng direkt). Topplistan under, med sin EGEN list-komprimering ("Visa alla N" +
  // sticky följ-med-kontroll) för långa rum , ingen extra sektions-kollaps ovanpå (T92 del B).
  return surface(
    <div className="flex flex-col gap-4">
      <LeaderboardSummary />
      <LeaderboardView />
    </div>
  );
}
