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
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Match, Team } from '../../domain/types';
import { useResultsStore } from '../results/results-context';
import { stageLabel } from '../daily/match-display';
import { formatKickoffTime, formatDayShort } from '../daily/format-datetime';
import { localDateKey } from '../daily/group-matches-by-day';
import { TeamFlag } from '../daily/TeamFlag';
import { hueFromCode } from '../daily/team-hue';
import { springs, transitions } from '../../motion';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Rörelse-grind (a11y, WCAG 2.3.3): vi reser bara panelen (y/scale) när motion-
  // preferensen EXPLICIT är "tillåt rörelse" (=== false). useReducedMotion kan ge
  // null på första renderingen innan media-frågan lästs; behandlar vi då null som
  // "tillåt rörelse" startar panelen med en transform som en reduced-motion-användare
  // sen ser blinka bort (verifierat: en 1-frames y=28-flash). Genom att kräva ett
  // EXPLICIT false startar vi i det säkra läget (bara opacitet) tills preferensen är
  // känd, så en reduced-motion-användare aldrig ser en resa. Samma kontrakt som
  // Slide/Spring-primitiverna (initial = bara opacitet vid reducerad rörelse).
  const motionEnabled = useReducedMotion() === false;

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const team = openTeamId === null ? undefined : teamsById.get(openTeamId);

  // Härled profilen reaktivt (ren funktion av den delade sanningen). Bara när ett
  // känt lag är öppet; annars null (modalen renderas inte).
  const profile = useMemo(
    () => (team ? deriveTeamProfile(team, groups, matches, teamsById) : null),
    [team, groups, matches, teamsById]
  );

  // STABILT öppet-id för fokus-effekten (C7): profile är ett HÄRLETT objekt och får
  // ny identitet varje gång storen uppdateras (live/realtidsläge T18 anropar setMatches
  // -> deriveTeamProfile körs om -> nytt objekt). Binder vi fokus-restore-effekten till
  // profile-identiteten kör dess cleanup mitt under en ÖPPEN modal vid varje store-
  // uppdatering: fokus rycks tillbaka till öppnaren och openerRef skrivs över med fel
  // element (det då-aktiva i den fortfarande öppna dialogen). Vi binder i stället till
  // ÖPPET/STÄNGT-tillståndet, ett stabilt lag-id som bara ändras när modalen faktiskt
  // öppnas för ett nytt lag eller stängs (null). Då löper öppnings-/stängnings-logiken
  // exakt en gång per öppning, oberoende av hur ofta datan bakom uppdateras.
  const openProfileId = profile === null ? null : team!.id;

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
    // Bind till ÖPPET-tillståndet (stabilt lag-id), inte profile-objektet (C7), så
    // cleanup/re-run BARA sker när modalen faktiskt öppnas/stängs, aldrig mitt under
    // en öppen modal när storen uppdateras och profile får ny identitet.
    if (openProfileId === null) {
      return;
    }
    openerRef.current = document.activeElement as HTMLElement | null;
    // Fokusera stäng-knappen som en stabil startpunkt i dialogen.
    closeButtonRef.current?.focus();
    return () => {
      // Återställ fokus till öppnaren (t.ex. lag-knappen) när modalen stängs.
      openerRef.current?.focus?.();
    };
  }, [openProfileId]);

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

  // Lagets signaturfärg (samma hue som TeamFlag-discen, en sanning via team-hue) väver
  // in i hero-bandets DEKOR via --vm-profile-hue. Bara ett tal -> aldrig en text-/yt-
  // färg (kontrast-vakten i tokens.css §7), så profilens ton blir distinkt per lag utan
  // att röra någon text-kontrast.
  const heroStyle = { '--vm-profile-hue': hueFromCode(team!.code) } as CSSProperties;

  // In-animation: overlayn tonar in, panelen reser sig mjukt (spring) underifrån. Vid
  // reducerad rörelse (eller innan preferensen är känd) nollas resan helt (bara
  // opacitet), så a11y-kontraktet hålls (WCAG 2.3.3). Ingen ut-animation (panelen
  // villkorsrenderas bort direkt vid stäng), det håller stäng-flödet enkelt och
  // testbart (KISS).
  const panelInitial = motionEnabled ? { opacity: 0, y: 28, scale: 0.98 } : { opacity: 0 };
  const panelAnimate = motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 };

  return (
    // Overlay: täcker skärmen, klick på bakgrunden (men inte på panelen) stänger.
    // Dimning (color-mix) + blur (.vm-profile-overlay i tokens.css) lyfter fram modalen.
    <motion.div
      data-team-profile-overlay=""
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.quick}
      className="vm-profile-overlay fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-team-profile-panel=""
        // Stoppa klick på panelen från att bubbla upp till overlayns onClose.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        initial={panelInitial}
        animate={panelAnimate}
        transition={motionEnabled ? springs.gentle : transitions.quick}
        // Mobil: nästan-fullskärm "bottom sheet" (max-h + rundade topphörn, fäst i
        // nederkant av overlayn). Desktop (sm+): centrerad panel, max-bredd, alla hörn
        // rundade. max-h + intern scroll på kroppen säkrar att långt innehåll aldrig
        // svämmar över, även på 280px-skärmar.
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-card border border-border bg-surface shadow-[var(--vm-shadow-raised)] sm:max-h-[88dvh] sm:rounded-card"
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
      </motion.div>
    </motion.div>
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
