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
//
// VISUELL FINISH (designen, T28/#42): tiden får en liten accent-färgad
// klock-ikon (skumbar "tiden först"-affordans, samma tänk som daily-matchkortet)
// och steg-etiketten blir ett CHIP som ekar TV-badge-/steg-pillen från daily
// (samma rounded-pill-recept, delat designspråk, inte duplicerad komponent). Ingen
// avdelar-prick längre: chip-gränsen skiljer tid och steg visuellt, så raden läses
// rent som "21:00 Grupp A" utan ett uppläst skiljetecken. Chip-texten hålls på
// fg-muted (AA-säker som normal text i båda teman, uppmätt, se decisions.md).

import type { Match } from '../../domain/types';
import { formatKickoffTime, stageLabel } from '../daily';

export interface MatchContextRowProps {
  match: Match;
}

/**
 * En kompakt metadata-rad: avsparkstid (svensk) + grupp/steg-etikett. Stabil
 * semantik + data-attribut (`data-match-context`, `data-result-time`,
 * `data-result-stage`) så designen kan finputsa utseendet utan att röra
 * strukturen (samma seam-princip som resten av resultatinmatningen).
 */
export function MatchContextRow({ match }: MatchContextRowProps) {
  const time = formatKickoffTime(match.kickoff);
  const stage = stageLabel(match);

  return (
    <div data-match-context="" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {/* Avsparkstid: liten klock-ikon + tabulär siffra. Ikonen i accent-ton gör
          tiden skumbar (samma "tiden först"-tänk som daily-matchkortet), siffran
          bär full fg-kontrast så den läses skarpt. <time> bär UTC-instanten. */}
      <time
        data-result-time=""
        dateTime={match.kickoff}
        className="inline-flex items-center gap-1 font-display text-xs font-bold leading-none tabular-nums text-fg"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: 'var(--color-accent)' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.75V8l2.25 1.5" />
        </svg>
        {time}
      </time>
      {/* Grupp/steg-CHIP: ekar TV-badge-/steg-pillen från daily (samma pill-recept,
          rounded-pill + border + dämpad fg-muted-text), så inmatningslistan talar
          samma designspråk som matchvyn, utan duplicerad komponent. En diskret
          accent-tint i bakgrunden + accent-kant binder den till kvällsljus-tonen;
          texten hålls på fg-muted (AA-säker som normal text i båda teman). */}
      <span
        data-result-stage=""
        className="inline-flex items-center rounded-pill border border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] px-2 py-0.5 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.1em] text-fg-muted"
      >
        {stage}
      </span>
    </div>
  );
}
