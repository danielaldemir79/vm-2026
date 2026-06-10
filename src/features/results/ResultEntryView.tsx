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

import { useId, useMemo, useState, type ReactNode } from 'react';
import type { Match, Team } from '../../domain/types';
import { useGoalCelebration, type GoalCelebration } from './goal-celebration';
import { useResultsStore } from './results-context';
import { ResultEntryForm } from './ResultEntryForm';
import { windowMatches } from './result-window';
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
  //
  // Type predicate som FAKTISKT narrowar: efter filtret är båda id:n `string`
  // (icke-null), inte `string | null`, så konsumenterna slipper en extra null-
  // koll. Vi intersectar `Match` med just de fält filtret garanterar (samma
  // mönster som isCounted i compute-standings), i stället för ett `m is Match`
  // som inte uttrycker någon ny information.
  const editable = useMemo(
    () =>
      matches.filter(
        (m): m is Match & { homeTeamId: string; awayTeamId: string } =>
          m.homeTeamId !== null && m.awayTeamId !== null
      ),
    [matches]
  );

  // 3-DAGARS FÖNSTER (#39): hela VM:t är 104 matcher = en orimligt lång lista att
  // skrolla. Default visar bara matcherna inom de närmaste 3 svenska dagarna (från
  // idag, eller premiärdagen om turneringen inte börjat), resten fälls ut på begäran.
  // Urvalet är en REN funktion (result-window.ts), testad fristående (edge-fall:
  // ej börjad, slutet, allt inom fönstret, vilodag); här äger vyn bara expandera-
  // tillståndet och den tillgängliga kontrollen.
  const [expanded, setExpanded] = useState(false);
  const windowed = useMemo(() => windowMatches(editable), [editable]);
  // Vad som faktiskt renderas: hela listan när användaren fällt ut, annars fönstret.
  const shownMatches = expanded ? editable : windowed.visible;
  // Knappen behövs bara när det FINNS något dolt (alla inom fönstret -> ingen knapp).
  const hasHidden = windowed.hiddenCount > 0;
  // Stabil id-koppling för aria-controls/aria-expanded mellan knappen och listan.
  const listId = useId();

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
        <ul id={listId} className="m-0 flex list-none flex-col gap-3 p-0">
          {shownMatches.map((match) => (
            <li key={match.id}>
              {/* key inkluderar matchens status + mål, inte bara match.id (C10):
                  ResultEntryForm seedar sin lokala useState EN gång vid mount.
                  Ändras matchen externt i storen (samma match.id => samma React-
                  instans), t.ex. en framtida realtids-uppdatering (T18), re-seedar
                  formuläret aldrig och UI:t kan visa gamla mål/status. En key som
                  ändras med status + mål re-mountar formuläret så det re-seedar
                  mot den nya matchen. Målen härleds via `match.result?` (null på
                  scheduled/live, MatchResult på finished i Match-unionen), så
                  uttrycket är säkert oavsett union-variant.
                  Default nu (T6): inga externa uppdateringar finns, så inget
                  pågående edit clobbras; T18 (realtid) kan senare förfina
                  konflikt-hanteringen (extern uppdatering vs lokal edit). */}
              <ResultEntryForm
                key={`${match.id}-${match.status}-${match.result?.homeGoals ?? ''}-${match.result?.awayGoals ?? ''}`}
                match={match}
                teamsById={teamsById}
                onSubmit={submitResult}
                onSaved={handleSaved}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* Expandera-KONTROLL (#39): syns BARA när fönstret döljer något (alla inom
          fönstret -> ingen knapp). Tillgänglig: en riktig <button> som styr listan
          via aria-controls + aria-expanded, så en skärmläsare vet att den fäller
          ut/ihop just matchlistan ovanför. Antalet dolda står i etiketten så valet
          är begripligt ("Visa alla matcher (101 dolda)"). data-attribut är seam för
          design-frontends premium-styling.

          VISUELL FINISH (#39, Daniels feedback "gör den TYDLIGT SYNLIG"): inte
          längre en blek border-pill utan en INBJUDANDE, premium accent-kontroll,
          en mjuk accent-tonad yta (color-mix mot --color-accent, följer temat),
          accent-kant och accent-färgad text, plus en chevron som pekar NER när
          mer finns att visa och vänds UPP i utfällt läge. Tydlig men inte skrikig:
          tonen är en låg-alfa-tint, inte en fylld accent-knapp (den är reserverad
          för primär-action Spara). Hover fördjupar tinten, fokus-ringen är kvar
          (WCAG 2.4.7), och chevron-rotationen gatas av reduced-motion globalt
          (index.css nollar transition-duration vid "minska rörelse"). Texten bärs
          på --color-fg (full kontrast, uppmätt AA i båda teman, se handoff), inte
          på accent-hue, så etiketten är skarp oavsett tema. */}
      {status === 'ready' && editable.length > 0 && hasHidden ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={listId}
          data-results-toggle={expanded ? 'collapse' : 'expand'}
          className="group/toggle inline-flex items-center gap-2.5 self-center rounded-pill border border-[color-mix(in_srgb,var(--color-accent)_42%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))] px-6 py-3 font-display text-sm font-semibold text-fg shadow-[var(--vm-shadow-card)] transition-[background-color,border-color,box-shadow] duration-200 outline-none hover:border-[color-mix(in_srgb,var(--color-accent)_60%,var(--color-border))] hover:bg-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-surface))] hover:shadow-[var(--vm-shadow-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          <span>
            {expanded
              ? 'Visa färre'
              : `Visa alla matcher (${windowed.hiddenCount} ${windowed.hiddenCount === 1 ? 'dold' : 'dolda'})`}
          </span>
          {/* Chevron: pekar ner = "det finns mer", vänds upp i utfällt läge.
              aria-hidden (etiketten + aria-expanded bär betydelsen åt skärmläsare),
              ren affordans. Accent-färgad så den drar ögat utan extra text. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            // Tailwind v4:s rotate-180 sätter CSS-egenskapen `rotate` (inte den
            // gamla transform-axeln), så övergången måste rikta in sig på `rotate`
            // för att animera mjukt i stället för att snappa. Reduced-motion nollar
            // transition-duration globalt (index.css), så vridningen blir momentan
            // men korrekt riktad för den som bett om minskad rörelse (WCAG 2.3.3).
            className={`h-4 w-4 transition-[rotate] duration-200 ${expanded ? 'rotate-180' : ''}`}
            style={{ color: 'var(--color-accent)' }}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
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
