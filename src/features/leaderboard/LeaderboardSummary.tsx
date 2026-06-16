// SAMMANFATTNING ÖVERST (T46, #79): aktuell användares totala poäng + placering, plus
// "Så funkar poängen"-förklaringen. FUNKTIONELLT + a11y-lager (senior-dev); premium-
// finish (design-frontend) ovanpå data-attribut-seamen, samma arbetsdelning som T15/T16/T42.
//
// VARFÖR ÖVERST (Daniels begäran, pre-share-blockerare): man ska se SINA EGNA poäng utan
// att skrolla hela vägen ner till topplistan, innan länken delas med vänner. Panelen är en
// HÄRLEDD vy av topplistan (deriveSelfSummary), ingen ny poäng-källa, så den kan aldrig
// drifta från listan längre ner.
//
// "SÅ FUNKAR POÄNGEN" (T34, #62): den DELADE ScoreGuide-komponenten, samma som vid
// tippningen, så förklaringen är EN sanning på båda ytorna och täcker hela den låsta
// skalan (match 3/1, grupp 3/2, slutspel 1-5, VM-vinnare 20). Talen HÄRLEDS ur poäng-
// konstanterna, aldrig hårdkodade här. Detta ERSATTE T46:s lokala, hårdkodade legend
// som bara täckte match-poängen och felaktigt utlovade special-tips som "kommer" (de
// är nu live, T49). Se docs/decisions.md T34.

import { useMemo } from 'react';
import { ScoreGuide } from '../scoring-guide';
import { useLeaderboardStore } from './leaderboard-context';
import { deriveSelfSummary } from './self-summary';

/**
 * Egen-poäng-panelen: visar aktuell användares totala poäng + placering ("av N"). Renderas
 * bara när vi kan peka ut en egen rad (deriveSelfSummary !== null), annars inget (hellre
 * tyst än en gissad rad). Stabil semantik + data-attribut, premium-finish av design-frontend.
 */
function SelfScorePanel() {
  const store = useLeaderboardStore();
  const summary = useMemo(
    () => deriveSelfSummary(store.leaderboard, store.currentUserId),
    [store.leaderboard, store.currentUserId]
  );

  if (summary === null) {
    return null;
  }

  return (
    <div
      data-leaderboard-self-summary=""
      data-rank={summary.rank}
      data-points={summary.points}
      className="vm-board-self-summary flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-card px-4 py-3.5"
    >
      <p className="m-0 font-display text-sm font-semibold">Dina poäng</p>
      <p className="m-0 flex items-baseline gap-3">
        {/* Placeringen + poängen som ren text, så skärmläsaren läser hela meningen i ord.
            tabular-nums så siffrorna inte hoppar när de ändras. */}
        <span data-summary-rank="" className="font-display text-sm font-semibold tabular-nums">
          Plats {summary.rank} av {summary.totalMembers}
        </span>
        <span data-summary-points="" className="font-display text-base font-bold tabular-nums">
          {summary.points} poäng
        </span>
      </p>
    </div>
  );
}

/**
 * Sammanfattnings-blocket ÖVERST i topplista-sektionen: egen-poäng-panelen + "Så funkar
 * poängen"-knappen (delade ScoreGuide:n). Renderas bara i ready-läge (samma gate som
 * topplistan); panelen inuti gatar dessutom på en känd egen rad. Utan rum / under laddning
 * visar toppliste-vyn själv sina lägen, så här renderar vi inget då.
 *
 * VARFÖR ScoreGuide (inte en lokal legend, T34/#62): förklaringen ska vara IDENTISK med
 * den vid tippningen och täcka hela den låsta skalan med tal som följer konstanterna.
 * Den delade komponenten ger båda (EN sanning, mutations-säkrad), så den ersatte T46:s
 * hårdkodade match-only-legend här.
 */
export function LeaderboardSummary() {
  const store = useLeaderboardStore();
  const ready = store.enabled && store.status === 'ready';
  if (!ready) {
    return null;
  }
  return (
    // gap-4 (inte gap-3): samma lugna intra-panel-rytm som TipsScoreSummary och resten av
    // appen, så "Dina poäng"-panelen och "Så funkar poängen"-knappen får luft mellan sig
    // (Daniels feedback: panelen kändes hoptryckt , "lite luft mellan linjerna").
    <div data-leaderboard-summary="" className="mt-4 flex flex-col gap-4">
      <SelfScorePanel />
      <div data-leaderboard-score-guide="">
        <ScoreGuide surface="topplista" />
      </div>
    </div>
  );
}
