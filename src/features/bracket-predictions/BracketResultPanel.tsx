// RESULTAT-PANEL för en AVGJORD slutspels-slot man tippat på (Del B, Daniels önskemål:
// "varje slot ska visa om man fått rätt eller fel och poängen man får"). Speglar grupp-
// tipsens GroupResultPanel (T-grupp-resultat): visar TYDLIGT om mitt "går vidare"-tips satt
// (rätt/fel + poäng) och vilket lag som FAKTISKT gick vidare. Ligger i slutspels-tips-vyn,
// i den låsta slot-kupongen (under mitt tips), inte på Turnering-trädet.
//
// REN presentation: drivet av ett BracketSlotResult + slottens lag-lista. Ingen IO.
//
// FÄRG-OBEROENDE STATUS (samma recept som GroupResultPanel): en glyf (✓/✗, aria-hidden) +
// en sr-only-etikett ("rätt"/"fel") bär betydelsen, färgen (success/fg-muted) + poängen
// förstärker. Rätt = success-grön bock, fel = neutralt kryss. AA: success-grön är den
// etablerade rätt-tonen (grupp-resultatet använder samma).

import type { SlotTeamOption } from './bracket-predictable-slots';
import type { BracketSlotResult } from './derive-bracket-prediction-results';
import { TeamFlag } from '../daily/TeamFlag';

/** Visningsnamn ur en lag-CODE (versal "BRA"), fallback till code:t (fail-safe). */
function nameForCode(code: string, teams: readonly SlotTeamOption[]): string {
  return teams.find((t) => t.code === code)?.name ?? code;
}

/** Grammatiskt korrekt poäng-text: "1 poäng" / "0 poäng" / "20 poäng" (poäng böjs inte i sv). */
function pointsLabel(points: number): string {
  return `${points} poäng`;
}

export function BracketResultPanel({
  result,
  teams,
  isChampion = false,
}: {
  result: BracketSlotResult;
  teams: readonly SlotTeamOption[];
  /** Mästar-tipset (VM-vinnaren) får egen rubrik/facit-text, annars slot-varianten. */
  isChampion?: boolean;
}) {
  const predictedName = nameForCode(result.predictedCode, teams);
  const actualName = nameForCode(result.actualCode, teams);
  const { correct, points } = result;
  const statusColor = correct ? 'var(--color-success)' : 'var(--color-fg-muted)';

  return (
    <div
      data-bracket-result=""
      className="flex flex-col gap-2 rounded-md border border-border bg-[color-mix(in_srgb,var(--color-fg)_3%,var(--color-surface))] px-3 py-2.5"
    >
      {/* Poäng-rubrik: tydligt vad slotten gav. */}
      <p className="m-0 flex items-baseline justify-between gap-2">
        <span className="font-display text-[0.6875rem] font-bold uppercase tracking-wide text-fg-muted">
          {isChampion ? 'Ditt mästar-tips' : 'Ditt slutspels-tips'}
        </span>
        <span className="font-display text-sm font-bold text-fg">
          Du fick {pointsLabel(points)}
        </span>
      </p>

      {/* Mitt pick + rätt/fel-status + poäng (FÄRG-OBEROENDE: glyf + sr-only + poäng). */}
      <div data-bracket-result-pick="" className="flex items-center gap-2 text-[0.8125rem]">
        <TeamFlag code={result.predictedCode} size="sm" />
        <span className="min-w-0 flex-1 truncate font-semibold text-fg">{predictedName}</span>
        <span aria-hidden="true" className="shrink-0" style={{ color: statusColor }}>
          {correct ? '✓' : '✗'}
        </span>
        <span className="sr-only">{correct ? 'rätt' : 'fel'}</span>
        <span
          className="w-9 shrink-0 text-right font-bold tabular-nums"
          style={{ color: statusColor }}
        >
          {correct ? `+${points}` : '0'}
        </span>
      </div>

      {/* FACIT-raden: vilket lag som faktiskt gick vidare / blev mästare (så en miss blir begriplig). */}
      <p className="m-0 border-t border-border/60 pt-2 text-[0.75rem] text-fg-muted">
        {isChampion ? 'VM-vinnare: ' : 'Gick vidare: '}
        <span className="font-semibold text-fg">{actualName}</span>
      </p>
    </div>
  );
}
