// Lag-profil-modalen (PRESENTATIONS + a11y-dialog, T10; migrerad till delad <Modal> T33).
//
// FOKUS (senior-devs FUNKTIONELLA + tillgängliga lager): en KORREKT modal-dialog
// som visar lagets FIFA-ranking, stjärnspelare, kuriosa, grupp och lagets väg
// (matcher) i turneringen. Den läser den delade results-storen (en sanning för
// lag/grupper/matcher) och härleder profilen via deriveTeamProfile (ren). All
// data + härledning är frikopplad; vyn renderar bara, med stabil semantik +
// data-attribut så design-frontend kan ge premium-finish utan att röra logiken.
//
// A11y-dialog-kontraktet (role="dialog" + aria-modal, aria-labelledby, Escape, klick
// på bakgrunden, fokus in/ut, fokus-fälla, motion-gating, portal) ägs nu av den delade
// <Modal>-primitiven (T33/#56), inte handrullat här. Denna komponent bidrar bara med
// sitt INNEHÅLL (hero, sektioner, lagets väg) + den distinkta overlay-/panel-stilen
// via klass-/data-slottarna, så det visuella är oförändrat. Fokus flyttas in till
// stäng-knappen (closeButtonRef) som stabil startpunkt.
//
// VARFÖR modal och inte routad vy: appen är en single-page PWA utan router (ingen
// URL-navigering byggd), och profilen är en snabb "titt på laget" ovanpå nuvarande
// vy. En overlay är den enklaste lösningen som funkar (KISS), se decisions.md T10.
//
// C7/C9-INVARIANTERNA bevaras: primitiven monteras BARA när en profil är öppen (vi
// villkorsrenderar <Modal> bakom `profile !== null`), så dess Escape-/fokus-effekter
// löper exakt en gång per öppning via mount/unmount, inte vid varje store-uppdatering
// (live/realtid T18). onClose är stabil (TeamProfileProvider memo:ar closeProfile).

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Match, Team } from '../../domain/types';
import { useResultsStore } from '../results/results-context';
import { stageLabel } from '../daily/match-display';
import { formatKickoffTime, formatDayShort } from '../daily/format-datetime';
import { localDateKey } from '../daily/group-matches-by-day';
import { TeamFlag } from '../daily/TeamFlag';
import { hueFromCode } from '../daily/team-hue';
import { Modal } from '../../components/Modal';
import { deriveTeamProfile, type TeamProfileMatch } from './derive-team-profile';

export interface TeamProfilePanelProps {
  /** Lag-id vars profil visas, eller null när modalen är stängd. */
  openTeamId: string | null;
  /** Stäng modalen (Escape, stäng-knapp, bakgrundsklick). */
  onClose: () => void;
}

/**
 * Visningsnamn för ett motståndarlag i lagets väg.
 *
 * - opponentId === null: motståndaren är genuint okänd än (t.ex. en tom slutspels-
 *   slot innan seedningen, deriveTeamProfile sätter null), vi visar "Ej klart".
 * - opponentId men UTAN träff i teamsById: en DATA-INKONSISTENS (en match pekar på ett
 *   lag-id som inte finns i lag-uppslaget). Vi visar då id-STRÄNGEN i stället för att
 *   maskera felet som "Ej klart" (fail-loud-light, C10): det är ärligt mot
 *   tittaren OCH gör inkonsistensen synlig vid review/test i stället för att tyst
 *   låtsas att motståndaren är obestämd. Vi kraschar inte (KISS), men gömmer inte felet.
 */
function opponentName(opponentId: string | null, teamsById: ReadonlyMap<string, Team>): string {
  if (opponentId === null) {
    return 'Ej klart';
  }
  return teamsById.get(opponentId)?.name ?? opponentId;
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
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-raised"
    >
      <span className="min-w-[5.5rem] text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {stageLabel(match)}
      </span>
      <span className="text-sm">
        {isHome ? '' : 'borta mot '}
        <span className="font-semibold">{opponent}</span>
        {isHome ? ' (hemma)' : ''}
      </span>
      <span className="ml-auto text-xs tabular-nums text-fg-muted">
        {formatDayShort(dayKey)} {time}
      </span>
      {result ? (
        <span
          data-profile-path-result=""
          className="w-full pt-0.5 text-sm font-bold tabular-nums text-accent"
        >
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const team = openTeamId === null ? undefined : teamsById.get(openTeamId);

  // Härled profilen reaktivt (ren funktion av den delade sanningen). Bara när ett
  // känt lag är öppet; annars null (modalen renderas inte).
  const profile = useMemo(
    () => (team ? deriveTeamProfile(team, groups, matches, teamsById) : null),
    [team, groups, matches, teamsById]
  );

  if (profile === null) {
    return null;
  }

  const headingId = 'lagprofil-rubrik';
  const { fifaRanking, starPlayers, trivia, group, matches: pathMatches } = profile;

  // Lagets signaturfärg (samma hue som TeamFlag-discen, en sanning via team-hue) väver
  // in i hero-bandets DEKOR via --vm-profile-hue. Bara ett tal -> aldrig en text-/yt-
  // färg (kontrast-vakten i tokens.css §7), så profilens ton blir distinkt per lag utan
  // att röra någon text-kontrast.
  const heroStyle = { '--vm-profile-hue': hueFromCode(team!.code) } as CSSProperties;

  return (
    // Den delade <Modal> äger a11y-dialog-kontraktet. Lag-profilen bidrar med sin
    // distinkta overlay (.vm-profile-overlay-blur + dimning) + panel-form + sitt
    // innehåll. panelRisePx={28}: lag-profilen reste historiskt 28 px (de andra 24),
    // bevarat exakt så in-animationen är oförändrad. Fokus in till stäng-knappen.
    <Modal
      name="team-profile"
      onClose={onClose}
      labelledById={headingId}
      initialFocusRef={closeButtonRef}
      panelRisePx={28}
      overlayClassName="vm-profile-overlay"
      overlayStyle={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}
      panelClassName="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-card border border-border bg-surface shadow-[var(--vm-shadow-raised)] sm:max-h-[88dvh] sm:rounded-card"
    >
      {/* Stäng-knapp (stabil fokus-startpunkt), svävar över hero:n med egen fond så
          den syns mot den ljustonade dekoren. */}
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Stäng lagprofil"
        data-team-profile-close=""
        className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-surface/80 text-fg-muted backdrop-blur-sm transition-colors hover:bg-surface-raised hover:text-fg"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ×
        </span>
      </button>

      {/* Scroll-region: hero + sektioner. Hero:n scrollar med (enkelt, lugnt), men
          kroppen får aldrig svämma över overlayns kant. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* HERO: "arena i kvällsljus" i lagets ton. Stort emblem + lagnamn + grupp/kod
            + FIFA-ranking som tydlig guld-badge. Dekoren bor i .vm-profile-hero. */}
        <header
          data-profile-hero=""
          style={heroStyle}
          className="vm-profile-hero relative flex flex-col gap-4 border-b border-border px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7"
        >
          <div className="flex items-center gap-4 pr-12">
            <TeamFlag code={team!.code} size="lg" />
            <div className="flex min-w-0 flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted">
                Grupp {group} · {team!.code}
              </p>
              <h2
                id={headingId}
                className="font-display text-[1.625rem] font-bold leading-tight sm:text-3xl"
              >
                {team!.name}
              </h2>
            </div>
          </div>

          {/* FIFA-ranking: källånkrad styrke-signal som premium-badge (guld-kant +
              accent-siffra). Saknas datan visas en ärlig text, ingen gissad siffra. */}
          <div
            data-profile-ranking=""
            className="inline-flex w-fit items-baseline gap-2 rounded-pill border px-4 py-1.5"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-surface) 78%, transparent)',
              borderColor: 'color-mix(in srgb, var(--vm-gold) 55%, var(--color-border))',
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              FIFA-ranking
            </span>
            <span className="font-display text-lg font-bold tabular-nums">
              {fifaRanking !== null ? `#${fifaRanking}` : 'Data saknas'}
            </span>
          </div>
        </header>

        {/* KROPP: sektionerna, generös andning, tydlig hierarki. */}
        <div className="flex flex-col gap-6 px-5 py-6 sm:px-7">
          {/* Stjärnspelare: 1-3 källbelagda namn. Tom lista -> en ärlig "data saknas"-
              rad (hellre tomt än gissat), aldrig en uppdiktad spelare. */}
          <section aria-labelledby="profil-stjarnor" className="flex flex-col gap-3">
            <SectionHeading id="profil-stjarnor">Stjärnspelare</SectionHeading>
            {starPlayers.length > 0 ? (
              <ul
                aria-labelledby="profil-stjarnor"
                data-profile-stars=""
                className="flex flex-wrap gap-2"
              >
                {starPlayers.map((player) => (
                  <li
                    key={player}
                    className="rounded-pill border border-border bg-surface-raised px-3.5 py-1.5 text-sm font-medium"
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
              tomt skal). En accent-list visuellt ankrar den som ett "visste du"-kort. */}
          {trivia ? (
            <section aria-labelledby="profil-kuriosa" className="flex flex-col gap-3">
              <SectionHeading id="profil-kuriosa">Kuriosa</SectionHeading>
              <p
                data-profile-trivia=""
                className="rounded-lg border-l-2 bg-surface-raised px-4 py-3 text-sm leading-relaxed text-fg-muted"
                style={{ borderLeftColor: 'color-mix(in srgb, var(--vm-gold) 70%, transparent)' }}
              >
                {trivia}
              </p>
            </section>
          ) : null}

          {/* Lagets väg: grupp + lagets matcher (kronologiskt). Inga matcher (ska inte
              hända för ett WC-lag, men edge-säkert) -> en lugn text. */}
          <section aria-labelledby="profil-vag" className="flex flex-col gap-3">
            <SectionHeading id="profil-vag">Lagets väg</SectionHeading>
            {pathMatches.length > 0 ? (
              <ul
                aria-labelledby="profil-vag"
                data-profile-path=""
                className="m-0 flex list-none flex-col gap-1 p-0"
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
    </Modal>
  );
}

/** En sektionsrubrik med en liten accent-markör, för enhetlig hierarki i kroppen. */
function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted"
    >
      <span aria-hidden="true" className="h-3 w-1 rounded-pill bg-accent" />
      {children}
    </h3>
  );
}
