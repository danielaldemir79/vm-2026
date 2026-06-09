// Resultatinmatnings-VYN (T6, issue #6): lista matcher och låt användaren mata
// in/redigera resultat. Tabellerna (och senare slutspelsträdet) uppdateras från
// inmatningen via den delade storen, EN sanning (härledd state, SPEC §6).
//
// FOKUS (senior-devs lager): den FUNKTIONELLA + tillgängliga strukturen. Vyn
// läser den delade storen (useResultsStore), renderar ett ResultEntryForm per
// match, och kopplar in målfirande-KROKEN (useGoalCelebration) vid ett sparat
// resultat. Den hanterar även icke-happy-path (loading/error/tom) precis som
// gruppspelsvyn (fail loud, role="status"/"alert").
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå): premium-styling +
// den faktiska målfirande-ANIMATIONEN. Vyn exponerar en tydlig SEAM för den: ett
// aria-hidden firande-slot som renderar `children` med det aktiva firande-
// tillståndet. Design-frontend fyller den med konfetti/mål-pop (bygger på T2:s
// motion-primitiver, reducerad rörelse respekteras redan i kroken). Funktionellt
// fungerar inmatningen helt utan firandet, det är ren glädje-yta.

import { useMemo, type ReactNode } from 'react';
import type { Match, Team } from '../../domain/types';
import { useGoalCelebration, type GoalCelebration } from './goal-celebration';
import { useResultsStore } from './results-context';
import { ResultEntryForm } from './ResultEntryForm';
import type { ResultEntry } from './validate-result';

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

export interface ResultEntryViewProps {
  /**
   * Render-prop för det VISUELLA målfirande-lagret (design-frontends ansvar).
   * Får det aktiva firande-tillståndet (eller null) och renderar sin animation.
   * Default: inget visuellt lager (funktionellt komplett ändå), så vyn fungerar
   * fristående och design-frontend kopplar in sin premium-animation utan att röra
   * inmatnings-logiken.
   */
  renderCelebration?: (celebration: GoalCelebration | null) => ReactNode;
}

export function ResultEntryView({ renderCelebration }: ResultEntryViewProps) {
  const { status, matches, teams, submitResult, error } = useResultsStore();
  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  const { celebration, celebrateGoal } = useGoalCelebration();

  // Bara matcher med BÅDA lag kända kan matas in (ett slutspels-slot utan
  // framräknat lag har inget att mata in mot än, T4/T9 fyller dem). Filtrera
  // defensivt så formuläret aldrig visar ett "Okänt lag mot Okänt lag".
  const editable = useMemo(
    () => matches.filter((m): m is Match => m.homeTeamId !== null && m.awayTeamId !== null),
    [matches]
  );

  // Trigga målfirande EFTER ett lyckat sparande av en spelad match med mål.
  // Kroken hoppar själv reducerad rörelse + mållösa resultat (a11y), så vi
  // anropar den ovillkorligt här.
  function handleSaved(match: Match, entry: ResultEntry) {
    if (entry.status === 'finished') {
      const total = (entry.homeGoals ?? 0) + (entry.awayGoals ?? 0);
      celebrateGoal(match.id, total);
    }
  }

  return (
    <section aria-labelledby="resultatinmatning-rubrik" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Resultat
        </p>
        <h2 id="resultatinmatning-rubrik" className="font-display text-2xl font-bold sm:text-3xl">
          Mata in resultat
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Skriv in mål för spelade matcher. Tabellerna räknas om direkt, etta och tvåa går vidare.
        </p>
      </header>

      {status === 'loading' ? (
        <p role="status" className="text-sm text-fg-muted">
          Laddar matcher ...
        </p>
      ) : null}

      {status === 'error' ? (
        <p
          role="alert"
          className="rounded-card border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 50%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          Kunde inte ladda matcher: {error}
        </p>
      ) : null}

      {status === 'ready' && editable.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
          Inga matcher att mata in än.
        </p>
      ) : null}

      {status === 'ready' && editable.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {editable.map((match) => (
            <li key={match.id}>
              <ResultEntryForm
                match={match}
                teamsById={teamsById}
                onSubmit={submitResult}
                onSaved={handleSaved}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* Målfirande-SEAM: aria-hidden (ren visuell glädje, dubblerar ingen info).
          Design-frontend renderar sitt premium-lager via renderCelebration; utan
          den är vyn funktionellt komplett (firandet är valfri yta). */}
      {renderCelebration ? (
        <div aria-hidden="true" data-celebration-slot="">
          {renderCelebration(celebration)}
        </div>
      ) : null}
    </section>
  );
}
