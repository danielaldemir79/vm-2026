// POÄNG-SUMMERING + KÄLL-DETALJ ÖVERST I TIPS-VYN (T58, #99). FUNKTIONELLT + a11y-lager
// (senior-dev); premium-finish (design-frontend) ovanpå data-attribut-seamen.
//
// VARFÖR (Daniels live-feedback 2026-06-12): under "Tippa matcherna" syntes inga poäng
// och ingen summering, fast matcher avgjorts. Denna panel ger, ÖVERST i tips-sektionen:
//   1. Användarens TOTALA poäng + PLACERING (samma härledning som topplistan,
//      deriveSelfSummary, INGEN dubbelräkning).
//   2. En DETALJ-sektion: var totalpoängen kommer ifrån per källa (matchtips,
//      grupptippning, slutspelsträd, VM-vinnare), härledd ur SAMMA scoreMember-väg
//      (store.selfBreakdown -> buildSourceBreakdownRows), inte en omräkning.
//
// EN POÄNG-KÄLLA, INGEN DUBBELHÄMTNING: vyn LÄSER leaderboard-storen (samma
// LeaderboardProvider som topplistan, hoistad i App så tips-sektionen når den). Den
// hämtar inget eget, så summeringen här och topplistan längre ner kan aldrig drifta,
// och vi öppnar ingen andra fetch mot Supabase (HARD, #99).
//
// GATAR tyst: utan en egen rad (deriveSelfSummary null: ingen identitet / inte medlem)
// renderar panelen inget, hellre tyst än en gissad/fel rad (samma fail-safe som
// LeaderboardSummary, T46). Käll-detaljen visas bara när vi har en känd egen total.

import { useMemo } from 'react';
import { useLeaderboardStore } from './leaderboard-context';
import { deriveSelfSummary } from './self-summary';
import { buildSourceBreakdownRows } from './source-breakdown-rows';

/** Formatera ett poängvärde med svensk "p"-enhet ("3 p"). EN formatering, stadiga tal. */
function formatPoints(points: number): string {
  return `${points} p`;
}

export function TipsScoreSummary() {
  const store = useLeaderboardStore();

  // Aktuell användares total + placering, plockad TROGET ur den rangordnade topplistan
  // (ingen omräkning, samma sanning som panelen vid topplistan).
  const summary = useMemo(
    () => deriveSelfSummary(store.leaderboard, store.currentUserId),
    [store.leaderboard, store.currentUserId]
  );

  // Käll-uppdelningen (match/grupp/slutspel/VM-vinnare), härledd ur SAMMA scoreMember-
  // väg (store.selfBreakdown). Raderna (ordning + etikett) bor i buildSourceBreakdownRows
  // (en sanning), och deras summa === totalen (mutations-vaktat i testet).
  const rows = useMemo(
    () => (store.selfBreakdown ? buildSourceBreakdownRows(store.selfBreakdown.bySource) : null),
    [store.selfBreakdown]
  );

  // Bara i ready-läge (samma gate som topplistan) OCH när vi kan peka ut en egen rad.
  const ready = store.enabled && store.status === 'ready';
  if (!ready || summary === null) {
    return null;
  }

  return (
    <div
      data-tips-score-summary=""
      data-rank={summary.rank}
      data-points={summary.points}
      className="vm-tips-score-summary mt-4 flex flex-col gap-3 rounded-card px-4 py-3"
    >
      {/* TOTAL + PLACERING: hela meningen i ord, så skärmläsaren läser den sammanhängande.
          tabular-nums så siffrorna inte hoppar när poängen tickar in. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="m-0 font-display text-sm font-semibold">Dina poäng</p>
        <p className="m-0 flex items-baseline gap-3">
          <span
            data-tips-summary-rank=""
            className="font-display text-sm font-semibold tabular-nums"
          >
            Plats {summary.rank} av {summary.totalMembers}
          </span>
          <span
            data-tips-summary-points=""
            className="font-display text-base font-bold tabular-nums"
          >
            {formatPoints(summary.points)}
          </span>
        </p>
      </div>

      {/* KÄLL-DETALJ: var poängen kommer ifrån, per källa. Härledd ur selfBreakdown
          (samma scoreMember-väg), summan === totalen ovan. Renderas bara när vi har en
          uppdelning (selfBreakdown !== null); annars utelämnas detaljen (totalen kan
          ändå visas ur topplistan). */}
      {rows !== null ? (
        <dl
          data-tips-source-breakdown=""
          className="m-0 flex flex-col gap-1 border-t border-border pt-2 text-sm"
        >
          {rows.map((row) => (
            <div
              key={row.id}
              data-source-row={row.id}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="m-0 text-fg-muted">{row.label}</dt>
              <dd data-source-points="" className="m-0 font-display font-semibold tabular-nums">
                {formatPoints(row.points)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
