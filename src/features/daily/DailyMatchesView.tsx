// Den dagliga matchvyn (T7, issue #7): startskärmens hjärta.
//
// Ansvar (senior-devs FUNKTIONELLA + tillgängliga lager): rendera dagens matcher
// (tid, svensk TV-kanal, ev. arena), en datumnavigering dag för dag, en "Match of
// the day"-hero med live-nedräkning till nästa avspark, och de icke-happy-path-
// tillstånden (loading/error/tom dag). All data + logik kommer från useDailyMatches
// (delad store + rena härledningar); vyn är en tunn konsument.
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå): WOW-hero, premium-
// matchkort, nedräknings-visual. Vyn ger en STABIL semantik + data-attribut
// (data-match-card, data-highlight, data-countdown) att hänga premium-styling på,
// och håller färg via semantiska tokens (inga inbakade statusfärger, T7-pin:
// accent==success-grön i ljust tema, baka inte in en krock).
//
// MÅSTE renderas inuti en <ResultsProvider> (useDailyMatches -> useResultsStore
// fail-loud:ar annars). Speldagar/dag-gruppering är i SVENSK tid (kickoff är UTC),
// se group-matches-by-day.ts (off-by-one-skyddet).

import { useMemo } from 'react';
import type { Team } from '../../domain/types';
import { Fade, Slide, transitions } from '../../motion';
import { useDailyMatches } from './use-daily-matches';
import { MatchCard } from './MatchCard';
import { formatDayHeading, formatDayShort } from './format-datetime';
import type { CountdownState } from './countdown';
import { stageLabel, teamDisplayName } from './match-display';

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

/** En enskild nedräknings-enhet (t.ex. "02" + "tim"). tabular-nums = ingen hopp. */
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-display text-2xl font-bold tabular-nums leading-none sm:text-3xl">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[0.625rem] uppercase tracking-wide text-fg-muted">{label}</span>
    </div>
  );
}

/**
 * Live-nedräkningen i hero:n. Renderar enheterna vid 'upcoming', annars ett
 * lugnt sluttillstånd ('no-upcoming' = efter finalen / inga matcher). aria-live
 * polite så en skärmläsare inte spammas varje sekund men ändå får uppdateringar.
 */
function Countdown({
  countdown,
  teamsById,
}: {
  countdown: CountdownState;
  teamsById: ReadonlyMap<string, Team>;
}) {
  if (countdown.kind === 'no-upcoming') {
    return (
      <p data-countdown="done" className="text-sm text-fg-muted">
        Alla matcher är spelade. Tack för det här mästerskapet.
      </p>
    );
  }

  const { match, remaining } = countdown;
  const home = teamDisplayName(match.homeTeamId, teamsById);
  const away = teamDisplayName(match.awayTeamId, teamsById);

  return (
    <div data-countdown="live" className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Nästa avspark: <span className="font-semibold text-fg">{home}</span> mot{' '}
        <span className="font-semibold text-fg">{away}</span> ({stageLabel(match)})
      </p>
      {/* aria-live polite: tiden uppdateras varje sekund i DOM:en, men vi ger
          också en sammanfattande aria-label så skärmläsaren kan läsa hela
          nedräkningen som en mening i stället för fyra lösa tal. */}
      <div
        aria-live="polite"
        aria-label={`Tid till avspark: ${remaining.days} dagar, ${remaining.hours} timmar, ${remaining.minutes} minuter, ${remaining.seconds} sekunder`}
        className="flex items-end gap-3"
      >
        <CountdownUnit value={remaining.days} label="dgr" />
        <span aria-hidden="true" className="pb-2 text-xl font-bold text-fg-muted">
          :
        </span>
        <CountdownUnit value={remaining.hours} label="tim" />
        <span aria-hidden="true" className="pb-2 text-xl font-bold text-fg-muted">
          :
        </span>
        <CountdownUnit value={remaining.minutes} label="min" />
        <span aria-hidden="true" className="pb-2 text-xl font-bold text-fg-muted">
          :
        </span>
        <CountdownUnit value={remaining.seconds} label="sek" />
      </div>
    </div>
  );
}

export function DailyMatchesView() {
  const {
    status,
    mode,
    error,
    teams,
    days,
    selectedIndex,
    selectedDay,
    matchOfTheDay,
    countdown,
    canGoPrev,
    canGoNext,
    goPrev,
    goNext,
  } = useDailyMatches();
  const teamsById = useMemo(() => indexTeams(teams), [teams]);

  return (
    <section aria-labelledby="dagens-matcher-rubrik" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Matcher
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="dagens-matcher-rubrik" className="font-display text-2xl font-bold sm:text-3xl">
            Dagens matcher
          </h2>
          {mode === 'fixtures' ? (
            <span
              className="rounded-pill border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
              style={{
                borderColor: 'color-mix(in srgb, var(--vm-gold) 45%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--vm-gold) 12%, transparent)',
                color: 'var(--vm-gold)',
              }}
            >
              Demo-data
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Bläddra dag för dag genom mästerskapet. Tider visas i svensk tid med svensk TV-kanal.
        </p>
      </header>

      {status === 'loading' ? (
        <p role="status" className="text-sm text-fg-muted">
          Laddar matcher ...
        </p>
      ) : null}

      {status === 'error' ? (
        <Fade>
          <p
            role="alert"
            className="flex items-start gap-3 rounded-card border px-4 py-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-danger) 50%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
              color: 'var(--color-danger)',
            }}
          >
            <span aria-hidden="true" className="mt-0.5 text-base leading-none">
              !
            </span>
            <span>Kunde inte ladda matcherna: {error}</span>
          </p>
        </Fade>
      ) : null}

      {status === 'ready' && days.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
          Inga matcher i spelschemat än.
        </p>
      ) : null}

      {status === 'ready' && days.length > 0 ? (
        <>
          {/* Hero: "Match of the day" + live-nedräkning. Nedräkningen pekar mot
              turneringens NÄSTA avspark (inte nödvändigtvis vald dag), hero-kortet
              mot den valda dagens framträdande match. */}
          <Slide direction="up">
            <div
              data-daily-hero=""
              className="relative overflow-hidden rounded-card border border-border bg-surface-raised p-5 shadow-[var(--vm-shadow-raised)] sm:p-7"
              style={{
                backgroundImage:
                  'radial-gradient(120% 140% at 0% 0%, rgb(var(--vm-glow-accent) / 0.12), transparent 60%)',
              }}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2">
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                    Nedräkning
                  </p>
                  <Countdown countdown={countdown} teamsById={teamsById} />
                </div>
                {matchOfTheDay ? (
                  <div className="lg:max-w-sm lg:flex-1">
                    <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-fg-muted">
                      Dagens match
                    </p>
                    <MatchCard match={matchOfTheDay} teamsById={teamsById} highlight />
                  </div>
                ) : null}
              </div>
            </div>
          </Slide>

          {/* Datumnavigering: föregående/nästa speldag + dagens rubrik. Riktiga
              <button>:ar med disabled vid kant (a11y/tangentbord). Rubriken är
              ett aria-live region så bläddring annonseras. */}
          <nav aria-label="Datumnavigering" className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev}
              className="rounded-pill border border-border bg-surface px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">‹ </span>
              {canGoPrev ? formatDayShort(days[selectedIndex - 1].dateKey) : 'Tidigare'}
            </button>

            <p
              aria-live="polite"
              className="flex-1 text-center font-display text-sm font-bold capitalize sm:text-base"
            >
              {selectedDay ? formatDayHeading(selectedDay.dateKey) : ''}
            </p>

            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="rounded-pill border border-border bg-surface px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {canGoNext ? formatDayShort(days[selectedIndex + 1].dateKey) : 'Senare'}
              <span aria-hidden="true"> ›</span>
            </button>
          </nav>

          {/* Dagens matchlista. En tom dag ska inte hända här (days innehåller bara
              dagar MED matcher), men vi gardera ändå för en framtida källa och
              pekar mot nästa speldag i stället för en blank yta. */}
          {selectedDay && selectedDay.matches.length > 0 ? (
            <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {selectedDay.matches.map((match, i) => (
                <li key={match.id}>
                  <Slide
                    direction="up"
                    transition={{ ...transitions.smooth, delay: Math.min(i * 0.04, 0.32) }}
                    className="h-full"
                  >
                    <MatchCard
                      match={match}
                      teamsById={teamsById}
                      highlight={matchOfTheDay?.id === match.id}
                    />
                  </Slide>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
              Inga matcher den här dagen.
              {canGoNext ? ' Bläddra framåt till nästa speldag.' : ''}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
