// Lag-profil-modalen (PRESENTATIONS + a11y-dialog, T10).
//
// FOKUS (senior-devs FUNKTIONELLA + tillgängliga lager): en KORREKT modal-dialog
// som visar lagets FIFA-ranking, stjärnspelare, kuriosa, grupp och lagets väg
// (matcher) i turneringen. Den läser den delade results-storen (en sanning för
// lag/grupper/matcher) och härleder profilen via deriveTeamProfile (ren). All
// data + härledning är frikopplad; vyn renderar bara, med stabil semantik +
// data-attribut så design-frontend kan ge premium-finish utan att röra logiken.
//
// A11y (dialog): role="dialog" + aria-modal, märkt av lagnamns-rubriken
// (aria-labelledby). Escape stänger, klick på bakgrunden stänger, fokus flyttas in
// i dialogen när den öppnas och RETUR-fokuseras inte hit (vi flyttar till stäng-
// knappen, en stabil startpunkt). En enkel fokus-fälla håller Tab inom dialogen.
// Detta är de FUNKTIONELLA a11y-garantierna; den visuella overlay-stilen
// (bakgrunds-blur, in-animation) lämnas till design-frontend via klass-/data-haken.
//
// VARFÖR modal och inte routad vy: appen är en single-page PWA utan router (ingen
// URL-navigering byggd), och profilen är en snabb "titt på laget" ovanpå nuvarande
// vy. En overlay är den enklaste lösningen som funkar (KISS), se decisions.md T10.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { Match, Team } from '../../domain/types';
import { useResultsStore } from '../results/results-context';
import { stageLabel } from '../daily/match-display';
import { formatKickoffTime, formatDayShort } from '../daily/format-datetime';
import { localDateKey } from '../daily/group-matches-by-day';
import { TeamFlag } from '../daily/TeamFlag';
import { deriveTeamProfile, type TeamProfileMatch } from './derive-team-profile';

export interface TeamProfilePanelProps {
  /** Lag-id vars profil visas, eller null när modalen är stängd. */
  openTeamId: string | null;
  /** Stäng modalen (Escape, stäng-knapp, bakgrundsklick). */
  onClose: () => void;
}

/** Visningsnamn för ett (känt eller okänt) motståndarlag i lagets väg. */
function opponentName(opponentId: string | null, teamsById: ReadonlyMap<string, Team>): string {
  if (opponentId === null) {
    return 'Ej klart';
  }
  return teamsById.get(opponentId)?.name ?? 'Ej klart';
}

/** En rad i lagets väg: steg, datum + tid, motståndare, hemma/borta, ev. resultat. */
function PathRow({
  entry,
  teamsById,
}: {
  entry: TeamProfileMatch;
  teamsById: ReadonlyMap<string, Team>;
}) {
  const { match, opponentId, isHome } = entry;
  const opponent = opponentName(opponentId, teamsById);
  const dayKey = localDateKey(match.kickoff);
  const time = formatKickoffTime(match.kickoff);
  const result = formatResult(match, isHome);

  return (
    <li
      data-profile-path-match={match.id}
      data-profile-path-stage={match.stage}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/50 py-2 last:border-b-0"
    >
      <span className="min-w-[5.5rem] text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {stageLabel(match)}
      </span>
      <span className="text-sm">
        {isHome ? '' : 'borta mot '}
        <span className="font-semibold">{opponent}</span>
        {isHome ? ' (hemma)' : ''}
      </span>
      <span className="ml-auto text-xs text-fg-muted">
        {formatDayShort(dayKey)} {time}
      </span>
      {result ? (
        <span data-profile-path-result="" className="w-full text-sm font-semibold tabular-nums">
          {result}
        </span>
      ) : null}
    </li>
  );
}

/**
 * Resultat-text ur lagets perspektiv ("2-1" där lagets mål står först), eller null
 * om matchen inte är spelad. Bara FinishedMatch bär ett resultat (typgaranti), så
 * vi narrowar på status (ingen gissning för scheduled/live).
 */
function formatResult(match: Match, isHome: boolean): string | null {
  if (match.status !== 'finished') {
    return null;
  }
  const { homeGoals, awayGoals } = match.result;
  const own = isHome ? homeGoals : awayGoals;
  const other = isHome ? awayGoals : homeGoals;
  return `${own}-${other}`;
}

export function TeamProfilePanel({ openTeamId, onClose }: TeamProfilePanelProps) {
  const { teams, groups, matches } = useResultsStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const team = openTeamId === null ? undefined : teamsById.get(openTeamId);

  // Härled profilen reaktivt (ren funktion av den delade sanningen). Bara när ett
  // känt lag är öppet; annars null (modalen renderas inte).
  const profile = useMemo(
    () => (team ? deriveTeamProfile(team, groups, matches, teamsById) : null),
    [team, groups, matches, teamsById]
  );

  // Escape stänger. Lyssnaren läggs bara när modalen är öppen (städas vid stängning/
  // unmount), så den inte fångar Escape när inget är öppet.
  useEffect(() => {
    if (profile === null) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [profile, onClose]);

  // Flytta fokus in i dialogen när den öppnas (a11y: tappa inte bort tangentbords-
  // användaren utanför modalen), och återställ fokus till det element som var
  // fokuserat innan, när den stängs. Vi minns det öppnande elementet i en ref.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (profile === null) {
      return;
    }
    openerRef.current = document.activeElement as HTMLElement | null;
    // Fokusera stäng-knappen som en stabil startpunkt i dialogen.
    closeButtonRef.current?.focus();
    return () => {
      // Återställ fokus till öppnaren (t.ex. lag-knappen) när modalen stängs.
      openerRef.current?.focus?.();
    };
  }, [profile]);

  // Enkel fokus-fälla: håll Tab inom dialogen (a11y, modal). Vi cyklar mellan
  // dialogens fokuserbara element så fokus inte vandrar ut till bakgrunden.
  const onDialogKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || dialogRef.current === null) {
      return;
    }
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (profile === null) {
    return null;
  }

  const headingId = 'lagprofil-rubrik';
  const { fifaRanking, starPlayers, trivia, group, matches: pathMatches } = profile;

  return (
    // Overlay: täcker skärmen, klick på bakgrunden (men inte på panelen) stänger.
    // Den visuella bakgrunds-tonen/blur:en lämnas till design-frontend via klass-haken.
    <div
      data-team-profile-overlay=""
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 72%, transparent)' }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-team-profile-panel=""
        // Stoppa klick på panelen från att bubbla upp till overlayns onClose.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        className="relative flex w-full max-w-lg flex-col gap-5 rounded-card border border-border bg-surface p-5 shadow-[var(--vm-shadow-raised)] sm:p-7"
      >
        {/* Stäng-knapp (stabil fokus-startpunkt). */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng lagprofil"
          data-team-profile-close=""
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-pill border border-border text-fg-muted transition-colors hover:bg-surface-raised"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>

        {/* Rubrik: emblem + lagnamn + landskod. Emblemet är dekoration (aria-hidden). */}
        <header className="flex items-center gap-3 pr-10">
          <TeamFlag code={team!.code} size="md" />
          <div className="flex flex-col">
            <h2 id={headingId} className="font-display text-2xl font-bold leading-tight">
              {team!.name}
            </h2>
            <p className="text-sm text-fg-muted">
              Grupp {group} · {team!.code}
            </p>
          </div>
        </header>

        {/* Nyckeltal: FIFA-ranking (källånkrad styrke-signal). Saknas den visas en
            tydlig "data saknas"-text i stället för en gissad siffra. */}
        <dl className="grid grid-cols-2 gap-3">
          <div
            data-profile-ranking=""
            className="flex flex-col gap-0.5 rounded-card border border-border bg-surface-raised px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-fg-muted">FIFA-ranking</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">
              {fifaRanking !== null ? `#${fifaRanking}` : 'Data saknas'}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 rounded-card border border-border bg-surface-raised px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-fg-muted">Grupp</dt>
            <dd className="font-display text-2xl font-bold">{group}</dd>
          </div>
        </dl>

        {/* Stjärnspelare: 1-3 källbelagda namn. Tom lista -> en ärlig "data saknas"-rad
            (hellre tomt än gissat), aldrig en uppdiktad spelare. */}
        <section aria-labelledby="profil-stjarnor" className="flex flex-col gap-2">
          <h3 id="profil-stjarnor" className="text-sm font-semibold uppercase tracking-wide">
            Stjärnspelare
          </h3>
          {starPlayers.length > 0 ? (
            <ul
              aria-labelledby="profil-stjarnor"
              data-profile-stars=""
              className="flex flex-wrap gap-2"
            >
              {starPlayers.map((player) => (
                <li
                  key={player}
                  className="rounded-pill border border-border bg-surface-raised px-3 py-1 text-sm font-medium"
                >
                  {player}
                </li>
              ))}
            </ul>
          ) : (
            <p data-profile-stars="empty" className="text-sm text-fg-muted">
              Data saknas
            </p>
          )}
        </section>

        {/* Kuriosa: en kort verifierbar faktarad. Saknas den döljs sektionen (inget
            tomt skal). */}
        {trivia ? (
          <section aria-labelledby="profil-kuriosa" className="flex flex-col gap-1">
            <h3 id="profil-kuriosa" className="text-sm font-semibold uppercase tracking-wide">
              Kuriosa
            </h3>
            <p data-profile-trivia="" className="text-sm text-fg-muted">
              {trivia}
            </p>
          </section>
        ) : null}

        {/* Lagets väg: grupp + lagets matcher (kronologiskt). Inga matcher (ska inte
            hända för ett WC-lag, men edge-säkert) -> en lugn text. */}
        <section aria-labelledby="profil-vag" className="flex flex-col gap-2">
          <h3 id="profil-vag" className="text-sm font-semibold uppercase tracking-wide">
            Lagets väg
          </h3>
          {pathMatches.length > 0 ? (
            <ul
              aria-labelledby="profil-vag"
              data-profile-path=""
              className="m-0 flex list-none flex-col p-0"
            >
              {pathMatches.map((entry) => (
                <PathRow key={entry.match.id} entry={entry} teamsById={teamsById} />
              ))}
            </ul>
          ) : (
            <p data-profile-path="empty" className="text-sm text-fg-muted">
              Inga matcher i schemat än.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
