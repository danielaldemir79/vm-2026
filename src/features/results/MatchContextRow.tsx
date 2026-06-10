// Kontext-rad för ett inmatnings-kort (REN presentations-komponent, T28/#42).
//
// PROBLEM (Daniels feedback 2, #42): i inmatningslistan ser man bara lagen, så
// sammanhanget (avsparkstid + vilken grupp/runda) tappas. Den här raden lägger
// tillbaka det: avsparkstid i svensk tid + grupp/steg-etikett (Grupp A-L för
// gruppspel, rundnamn för slutspel).
//
// DRY (PRINCIPLES §4): ÅTERANVÄNDER daily-lagrets visnings-hjälpare, ingen ny
// formaterings-/etikett-logik här:
//   - formatKickoffTime: UTC-instant -> "HH:MM" svensk tid (off-by-one-säker).
//   - stageLabel: "Grupp A" för gruppspel, "Sextondelsfinal"/.../"Final" för
//     slutspel (en sanning för steg-etiketten, samma som matchkortet i daily).
// Slutspelsmatcher visar alltså sitt RUNDNAMN, aldrig en grupp (de har groupId
// null, så stageLabel faller på STAGE_LABELS, källtestat i match-display.test).
//
// VIKTIGT (#39-pinnen, Daniels FÖRSTA feedback): den här raden ligger UTANFÖR
// matchkortets score-grid (`data-result-card-body`), så den kan ALDRIG bryta
// kolumn-linjeringen som #39 etablerade. Den renderas ovanför grid:en i
// ResultEntryForm, som en egen metadata-rad.
//
// A11y: ett <time>-element bär den maskinläsbara UTC-instanten (datetime), den
// synliga texten är svensk tid. Steg-etiketten är en vanlig text-span. Hela raden
// är synlig (inte sr-only): det är information Daniel uttryckligen vill se i listan.

import type { Match } from '../../domain/types';
import { formatKickoffTime, stageLabel } from '../daily';

export interface MatchContextRowProps {
  match: Match;
}

/**
 * En kompakt metadata-rad: avsparkstid (svensk) + grupp/steg-etikett. Stabil
 * semantik + data-attribut (`data-match-context`, `data-result-time`,
 * `data-result-stage`) så design-frontend kan finputsa utseendet utan att röra
 * strukturen (samma seam-princip som resten av resultatinmatningen).
 */
export function MatchContextRow({ match }: MatchContextRowProps) {
  const time = formatKickoffTime(match.kickoff);
  const stage = stageLabel(match);

  return (
    <div
      data-match-context=""
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-fg-muted"
    >
      <time data-result-time="" dateTime={match.kickoff} className="tabular-nums">
        {time}
      </time>
      {/* Diskret avdelar-prick: ren dekoration, aria-hidden (raden läses ändå som
          "HH:MM Grupp A" utan en uppläst punkt). */}
      <span aria-hidden="true" className="text-fg-muted/60">
        &middot;
      </span>
      <span data-result-stage="">{stage}</span>
    </div>
  );
}
