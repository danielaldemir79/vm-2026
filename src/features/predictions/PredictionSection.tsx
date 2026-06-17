// Tips-sektionens yttre skal (T15, #15): visar tips-vyn bara när det sociala
// rums-lagret är konfigurerat (live-läge), precis som RoomSection.
//
// VARFÖR gata på rooms.enabled (inte predictions.enabled): tips-vyn ska synas så
// snart appen är i live-läge, ÄVEN utan ett aktivt rum, för att då visa "gå med i
// ett rum för att tippa" (porten till tips). I fixtures-läge (inget Supabase) är
// hela det sociala lagret vilande och sektionen renderar inget, så appen ser ut
// precis som förr lokalt. `surface` är kort-stilen App ger (samma som RoomSection),
// så vi inte renderar en tom Panel i fixtures-läge.
//
// POÄNG-SUMMERING ÖVERST (T58, #99): TipsScoreSummary visar användarens total +
// placering + käll-detalj högst upp i sektionen. Den LÄSER leaderboard-storen (samma
// LeaderboardProvider som topplistan, hoistad i App så den når hit) och hämtar inget
// eget, så det blir EN poäng-källa utan dubbelhämtning. Den gatar sig själv tyst när
// det inte finns en egen rad att visa.
//
// PROVIDERN ÄR HOISTAD (T64, #118): PredictionsProvider bor inte längre HÄR utan i App,
// där den omsluter BÅDE denna sektion och grupp-tips-sektionen, så grupp-tips-vyns
// simulerade slutspelsträd kan läsa SAMMA match-tips (treorna seedas ur dem) utan en
// andra hämtning. Denna sektion KONSUMERAR alltså bara storen (usePredictionsStore via
// vyerna), den skapar den inte. Samma mönster som LeaderboardProvider (T58).

import type { ReactNode } from 'react';
import { useRoomsStore } from '../rooms';
import { TipsScoreSummary, PersonalStatsSection } from '../leaderboard';
import { PredictionsView } from './PredictionsView';

export function PredictionSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const rooms = useRoomsStore();
  if (!rooms.enabled) {
    return null;
  }
  // PersonalStatsSection (T23, #23) ligger DIREKT under poäng-summeringen: båda LÄSER
  // den delade leaderboard-storen (samma hämtning) och GATAR sig själva tyst när det
  // inte finns en egen rad/statistik att visa, så ordningen är "din ställning -> hur du
  // tippar -> kupongerna".
  //
  // SPACING (Daniels feedback 2026-06-16, "kort som har ingen space"): de tre delvyerna
  // är tre kort-lika paneler (poäng-summeringen + statistik-panelen + tippnings-vyn) som
  // stod som NAKNA syskon utan en gemensam gap-behållare, så de KLISTRADE mot varandra
  // (uppmätt 0 px mellan summeringen och statistik-panelen, 0 px till tippnings-vyn).
  // Vi samlar dem nu i EN `flex flex-col gap-4`, samma intra-sektions-rytm som
  // LeaderboardSection ger sina paneler (Summary + View, gap-4), så "kort-i-en-sektion"
  // har EN konsekvent luft i hela appen. TipsScoreSummarys gamla `mt-4` (som bara gav
  // luft mot Panelens topp-padding) tas bort, gap-behållaren bär nu all rytm.
  return surface(
    <div className="flex flex-col gap-4">
      <TipsScoreSummary />
      <PersonalStatsSection />
      <PredictionsView />
    </div>
  );
}
