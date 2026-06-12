// Topplista-sektionens yttre skal (T17, #17): visar topplistan + tips-avslöjandet
// bara när det sociala rums-lagret är konfigurerat (live-läge), precis som T15/T16:s
// tips-sektioner.
//
// VARFÖR gata på rooms.enabled (inte leaderboard.enabled): vyn ska synas så snart
// appen är i live-läge, ÄVEN utan ett aktivt rum, för att då visa "gå med i ett rum".
// I fixtures-läge är hela det sociala lagret vilande och sektionen renderar inget.
// `surface` är kort-stilen App ger (samma som de andra tips-sektionerna).
//
// EN provider, FLERA vyer: sammanfattningen ÖVERST (egen poäng + placering + "Så funkar
// poängen", T46) + topplistan (alltid) + avslöjandet (renderar sig självt tyst tills första
// matchen avgjorts). Alla läser samma store.
//
// PROVIDERN ÄR HOISTAD (T58, #99): LeaderboardProvider bor nu i App och OMSLUTER både
// tips-sektionen (dess poäng-summering) OCH denna sektion, så de delar EN store och EN
// hämtning (ingen dubbel fetch). Denna sektion KONSUMERAR alltså den befintliga providern
// i stället för att skapa en egen (annars vore det två providers = två hämtningar).
//
// ORDNING (T46, #79, Daniels begäran): sammanfattningen ÖVERST så man ser sina egna poäng
// utan att skrolla, topplistan (full lista) KVAR längst ned, avslöjandet sist.

import type { ReactNode } from 'react';
import { CollapsibleBody } from '../../components/CollapsibleSection';
import { useRoomsStore } from '../rooms';
import { LeaderboardSummary } from './LeaderboardSummary';
import { LeaderboardView } from './LeaderboardView';
import { RevealView } from './RevealView';

export function LeaderboardSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const rooms = useRoomsStore();
  if (!rooms.enabled) {
    return null;
  }
  // KOMPRIMERING (T68/#129 punkt 11): poäng-sammanfattningen (egen poäng + placering)
  // hålls ALLTID synlig överst (man ska se sina egna poäng utan att fälla ut). Topplistan
  // + tips-avslöjandet komprimeras med det delade mönstret, men startar UTFÄLLDA
  // (startExpanded) , dirigentens tolkning av Daniels "expanderat direkt också": det är
  // tävlingens final-yta man vill se, men man kan fälla ihop den för överblick. Flippa
  // default-läget (startExpanded=false) om Daniel hellre vill ha den komprimerad direkt.
  // Faden tonar mot surface (sektionen ligger på en Panel).
  return surface(
    <div className="flex flex-col gap-4">
      <LeaderboardSummary />
      <CollapsibleBody
        name="leaderboard"
        toggleLabels={{ expand: 'Visa topplistan och avslöjandet', collapse: 'Fäll ihop' }}
        collapsedMaxHeight="14rem"
        startExpanded
      >
        <LeaderboardView />
        <RevealView />
      </CollapsibleBody>
    </div>
  );
}
