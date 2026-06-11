// SAMMANFATTNING ÖVERST (T46, #79): aktuell användares totala poäng + placering, plus en
// kort "Så funkar poängen"-förklaring. FUNKTIONELLT + a11y-lager (senior-dev); premium-
// finish (design-frontend) ovanpå data-attribut-seamen, samma arbetsdelning som T15/T16/T42.
//
// VARFÖR ÖVERST (Daniels begäran, pre-share-blockerare): man ska se SINA EGNA poäng utan
// att skrolla hela vägen ner till topplistan, innan länken delas med vänner. Panelen är en
// HÄRLEDD vy av topplistan (deriveSelfSummary), ingen ny poäng-källa, så den kan aldrig
// drifta från listan längre ner.
//
// "SÅ FUNKAR POÄNGEN": kort och tydlig (3p exakt / 1p rätt vinnare / 0 miss). Special-tips
// (gruppvinnare, VM-vinnare) NÄMNS att de finns/kommer, men deras inmatnings-UI + full
// poäng-wiring är en SEPARAT kommande task (T47), inte här.

import { useMemo } from 'react';
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
      className="vm-board-self-summary flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-card px-4 py-3"
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

/** En rad i poäng-förklaringen: poängvärde + vad som ger det. */
function ScoreRule({ value, children }: { value: string; children: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="shrink-0 font-display text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-fg-muted">{children}</span>
    </li>
  );
}

/**
 * "Så funkar poängen": kort förklaring av match-poängen (3/1/0). Poängvärdena är de
 * BEFINTLIGA (PREDICTION_POINTS, score.ts), de ändras inte här. Special-tipsen nämns att
 * de finns/kommer (T47), utan att utlova poängvärden som inte är wirade än.
 */
function ScoreLegend() {
  return (
    <details data-leaderboard-score-legend="" className="vm-board-legend rounded-card px-4 py-3">
      <summary className="cursor-pointer font-display text-sm font-semibold">
        Så funkar poängen
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <div>
          <p className="m-0 mb-1.5 font-medium">Resultat-tips, per match:</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            <ScoreRule value="3 p">exakt resultat (rätt antal mål för båda lagen)</ScoreRule>
            <ScoreRule value="1 p">rätt vinnare (rätt 1X2, men fel siffror)</ScoreRule>
            <ScoreRule value="0 p">fel vinnare (miss)</ScoreRule>
          </ul>
        </div>
        <p className="m-0 text-fg-muted">
          Snart kommer även special-tips att ge poäng: gruppvinnare och VM-vinnare. Då kan du plocka
          extrapoäng utöver matchresultaten.
        </p>
      </div>
    </details>
  );
}

/**
 * Sammanfattnings-blocket ÖVERST i topplista-sektionen: egen-poäng-panelen + "Så funkar
 * poängen". Renderas bara i ready-läge (samma gate som topplistan); panelen inuti gatar
 * dessutom på en känd egen rad. Utan rum / under laddning visar toppliste-vyn själv sina
 * lägen, så här renderar vi inget då.
 */
export function LeaderboardSummary() {
  const store = useLeaderboardStore();
  const ready = store.enabled && store.status === 'ready';
  if (!ready) {
    return null;
  }
  return (
    <div data-leaderboard-summary="" className="mt-4 flex flex-col gap-3">
      <SelfScorePanel />
      <ScoreLegend />
    </div>
  );
}
