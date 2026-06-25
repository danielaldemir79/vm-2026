// Grupp-tips-overlay-bitarna för ett avgjort grupp-kort: poäng-pillen (kort-headern)
// och "Du tippade"-raden (under tabellen). Rena presentations-komponenter, drivna av
// ett GroupResultEntry; ingen IO, ingen härledning (den bor i derive-group-prediction-
// results). Brutet ur GroupStageView så de kan testas i isolation.

import type { Team } from '../../domain/types';
import { teamShortName } from '../../domain';
import { GROUP_PREDICTION_POINTS } from '../../data/predictions';
import type { GroupResultEntry } from './derive-group-prediction-results';

/** Liten poäng-pill i grupp-kortets header: dina poäng i just den här gruppen. */
export function GroupPointsBadge({ points }: { points: number }) {
  return (
    <span
      className="ml-auto shrink-0 rounded-pill border border-border px-2.5 py-1 font-display text-xs font-bold tabular-nums text-fg"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-fg) 6%, transparent)' }}
    >
      <span className="font-normal text-fg-muted">Dina gruppoäng: </span>
      {points}p
    </span>
  );
}

/**
 * Slå upp ett tippat lags KORTA namn ur dess code. Tipset bär Team.code (versal
 * "BRA"); uppslaget är id-nycklat (gemen "bra"), och teamId(code)=code.toLowerCase(),
 * så vi normaliserar code -> id. Saknas laget (data-inkonsistens) visas code:t (fail-
 * safe light), inte en tyst tom plats.
 */
function pickedTeamName(code: string, teamsById: ReadonlyMap<string, Team>): string {
  const team = teamsById.get(code.toLowerCase());
  return team ? teamShortName(team) : code;
}

/** En position i "Du tippade"-raden: label (1:a/2:a) + lag + rätt/fel + delpoäng. */
function PickedPosition({
  label,
  teamName,
  correct,
  points,
}: {
  label: string;
  teamName: string;
  correct: boolean;
  points: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium text-fg">{teamName}</span>
      {/* Färg-OBEROENDE: glyf (aria-hidden) + sr-only-ord bär status, färgen förstärker. */}
      <span aria-hidden="true" style={{ color: correct ? 'var(--color-success)' : undefined }}>
        {correct ? '✓' : '✗'}
      </span>
      <span className="sr-only">{correct ? 'rätt' : 'fel'}</span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: correct ? 'var(--color-success)' : 'var(--color-fg-muted)' }}
      >
        {correct ? `+${points}p` : '0p'}
      </span>
    </span>
  );
}

/** "Du tippade"-raden under en avgjord grupp: båda dina val, rätt/fel + delpoäng. */
export function GroupPickSummary({
  result,
  teamsById,
}: {
  result: GroupResultEntry;
  teamsById: ReadonlyMap<string, Team>;
}) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
      <span className="font-semibold uppercase tracking-wide">Du tippade:</span>
      <PickedPosition
        label="1:a"
        teamName={pickedTeamName(result.predictedWinnerCode, teamsById)}
        correct={result.winnerCorrect}
        points={GROUP_PREDICTION_POINTS.winner}
      />
      <span aria-hidden="true" className="text-fg-muted/50">
        ·
      </span>
      <PickedPosition
        label="2:a"
        teamName={pickedTeamName(result.predictedRunnerUpCode, teamsById)}
        correct={result.runnerUpCorrect}
        points={GROUP_PREDICTION_POINTS.runnerUp}
      />
    </p>
  );
}
