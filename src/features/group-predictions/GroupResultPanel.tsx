// RESULTAT-PANEL för en AVGJORD grupp man tippat på (T-grupp-resultat, Daniels
// feedback): visar TYDLIGT hur många poäng tipset gav, vilka av mina pick:ar som
// satt (rätt/fel + delpoäng) och hur det FAKTISKT blev. Ligger i grupp-tips-vyn
// ("Tippa grupperna"), där man ser VAD man tippat , inte på Turnering-tabellen (där
// en bock missförstods som "laget gick vidare").
//
// REN presentation: drivet av ett GroupResultEntry + gruppens lag-lista. Ingen IO.

import type { GroupTeamOption } from './group-predictable-data';
import type { GroupResultEntry } from '../groups/derive-group-prediction-results';
import { GROUP_PREDICTION_POINTS } from '../../data/predictions';

/** Visningsnamn ur en lag-CODE (versal "MEX"), fallback till code:t (fail-safe). */
function nameForCode(code: string, teams: readonly GroupTeamOption[]): string {
  return teams.find((t) => t.code === code)?.name ?? code;
}

/** Visningsnamn ur ett Team.id (gemen "mex"); lag-listan är code-nycklad (versal). */
function nameForTeamId(teamId: string, teams: readonly GroupTeamOption[]): string {
  return teams.find((t) => t.code.toLowerCase() === teamId.toLowerCase())?.name ?? teamId;
}

/** En av mina pick-rader: medalj (1/2) + lag + rätt/fel-status + delpoäng. */
function PickRow({
  place,
  teamName,
  correct,
  points,
}: {
  place: 1 | 2;
  teamName: string;
  correct: boolean;
  points: number;
}) {
  const gold = place === 1;
  return (
    <div className="flex items-center gap-2 text-[0.8125rem]">
      <span
        aria-hidden="true"
        className={`vm-pool-medal vm-pool-medal--${gold ? 'gold' : 'silver'} h-5 w-5 shrink-0 rounded-pill text-[0.6875rem]`}
      >
        {place}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold text-fg">{teamName}</span>
      {/* Färg-OBEROENDE status: glyf (aria-hidden) + sr-only-ord bär betydelsen,
          färgen + delpoängen förstärker. Rätt = success-grön bock, fel = neutralt kryss. */}
      <span
        aria-hidden="true"
        className="shrink-0"
        style={{ color: correct ? 'var(--color-success)' : 'var(--color-fg-muted)' }}
      >
        {correct ? '✓' : '✗'}
      </span>
      <span className="sr-only">{correct ? 'rätt' : 'fel'}</span>
      <span
        className="w-8 shrink-0 text-right font-bold tabular-nums"
        style={{ color: correct ? 'var(--color-success)' : 'var(--color-fg-muted)' }}
      >
        {correct ? `+${points}` : '0'}
      </span>
    </div>
  );
}

/** Resultat-panelen: poäng-rubrik + mina två pick:ar (rätt/fel) + facit-rad. */
export function GroupResultPanel({
  result,
  teams,
}: {
  result: GroupResultEntry;
  teams: readonly GroupTeamOption[];
}) {
  const actualWinner = nameForTeamId(result.actualWinnerTeamId, teams);
  const actualRunnerUp = nameForTeamId(result.actualRunnerUpTeamId, teams);

  return (
    <div data-group-result="" className="vm-pool-podium flex flex-col gap-2 rounded-md px-3 py-2.5">
      {/* Poäng-rubrik: tydligt vad gruppen gav. */}
      <p className="m-0 flex items-baseline justify-between gap-2">
        <span className="font-display text-[0.6875rem] font-bold uppercase tracking-wide text-fg-muted">
          Ditt grupp-tips
        </span>
        <span className="font-display text-sm font-bold text-fg">
          Du fick {result.points} poäng
        </span>
      </p>

      {/* Mina två pick:ar med rätt/fel + delpoäng. */}
      <div className="flex flex-col gap-1.5">
        <PickRow
          place={1}
          teamName={nameForCode(result.predictedWinnerCode, teams)}
          correct={result.winnerCorrect}
          points={GROUP_PREDICTION_POINTS.winner}
        />
        <PickRow
          place={2}
          teamName={nameForCode(result.predictedRunnerUpCode, teams)}
          correct={result.runnerUpCorrect}
          points={GROUP_PREDICTION_POINTS.runnerUp}
        />
      </div>

      {/* FACIT-raden: så blev gruppen faktiskt (så en miss blir begriplig). */}
      <p className="m-0 border-t border-border/60 pt-2 text-[0.75rem] text-fg-muted">
        Så blev det: <span className="font-semibold text-fg">1:a {actualWinner}</span> ·{' '}
        <span className="font-semibold text-fg">2:a {actualRunnerUp}</span>
      </p>
    </div>
  );
}
