// "MIN SIDA": en personlig PROFIL-hub i Mer-fliken (T97).
//
// VARFÖR (north-star §4-5, Daniels brief): Mer är den lugna, personliga platsen. "Min sida"
// samlar VEM DU ÄR + DIN STÄLLNING + DINA RUM + DITT FAVORITLAG på ETT ställe, så man hittar
// "sitt" direkt. Den är ett SKYLTFÖNSTER mot data som redan finns , den re-renderar ALDRIG
// hela "Dina poäng"/"Din statistik"-panelerna (de bor i Tips), utan visar en KOMPAKT,
// glanceable sammanfattning härledd ur samma källor (deriveMinSidaProfile -> deriveSelfSummary
// + selfStats), så profilen aldrig kan drifta från panelerna eller topplistan.
//
// VISUELL IDENTITET ÄR LÅST (brief): inga nya idiom. Vi ÅTERANVÄNDER kodbasens etablerade
// byggstenar , profil-toppen bär samma "arena i kvällsljus"-glow som rums-hero:n (.vm-rooms-hero),
// avataren är samma monogram-bricka med stabil per-person-färg som medlemslistan
// (.vm-rooms-avatar + --vm-avatar-hue, member-avatar.ts), ställningens poäng är den STOLTA
// solida guld-brickan (.vm-tips-summary-total) och placeringen den lugna pill:en
// (.vm-tips-summary-rank-badge), favoritlaget bär TeamFlag, och korten är appens ENA Surface-
// primitiv (via den injicerade `surface`-render-propen, samma som resten av Mer). Inga NYA
// färgkombinationer införs, så ingen ny kontrast-mätning krävs (alla idiom är redan AA-proven).
//
// GATAS HONEST (brief STATES): i fixtures/lokalt läge (rummen inaktiva) eller utan
// identitet + rum renderar sektionen INGET (deriveMinSidaProfile -> null), precis som
// RoomSection. När det inte finns någon ställning (inget aktivt rum / inte med i ett rum än)
// visas en lugn "gå med i ett rum"-rad i stället för tomma stat-rutor, och de delar som HAR
// data (rum, favoritlag) renderar ändå.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useLeaderboardStore } from '../leaderboard';
import { useRoomsStore } from '../rooms';
import { avatarHueFromId, initialsFromName } from '../rooms/member-avatar';
import { useFavoriteTeam, resolveFavoriteTeam } from '../favorite-team';
import { useResultsStore } from '../results';
import { TeamFlag } from '../daily/TeamFlag';
import { teamShortName } from '../../domain/team-name';
import { deriveMinSidaProfile, type MinSidaStanding } from './derive-min-sida';
import './min-sida.css';

/** Formatera träffsäkerheten (0-1) som hel procent ("75 %"), samma enhet som PersonalStatsSection. */
function formatAccuracy(accuracy: number): string {
  return `${Math.round(accuracy * 100)} %`;
}

export interface MinSidaSectionProps {
  /** Yt-formen från call-sitet (App ger Panel/Surface), så sektionen matchar Mer-familjen. */
  surface: (children: ReactNode) => ReactNode;
}

/**
 * Profil-toppen (hero): monogram-avatar + namn + en lugn underrubrik. Samma kvällsljus-glow
 * som rums-hero:n. Avataren är DEKOR (aria-hidden); namnet bär identiteten som text (a11y).
 * `name` null = neutral topp (ingen identitet ännu), då visas en lugn platshållar-disc + en
 * generell rubrik i stället för ett gissat namn.
 */
function ProfileHero({ userId, name }: { userId: string | null; name: string | null }) {
  const hasIdentity = userId !== null && name !== null;
  const hue = hasIdentity ? avatarHueFromId(userId) : 0;
  const initials = hasIdentity ? initialsFromName(name) : null;

  return (
    <header className="vm-rooms-hero relative overflow-hidden rounded-card p-5 sm:p-6">
      <div className="relative flex items-center gap-4">
        {hasIdentity ? (
          <span
            aria-hidden="true"
            className="vm-rooms-avatar vm-min-sida-avatar flex shrink-0 items-center justify-center rounded-pill font-display font-bold leading-none"
            style={{ '--vm-avatar-hue': hue } as CSSProperties}
          >
            {initials}
          </span>
        ) : (
          // Neutral platshållar-disc (ingen identitet än): en lugn, dämpad bricka, inte ett
          // gissat monogram. Dekor (aria-hidden); rubriken bär betydelsen.
          <span
            aria-hidden="true"
            className="vm-min-sida-avatar vm-min-sida-avatar-empty flex shrink-0 items-center justify-center rounded-pill font-display font-bold leading-none"
          >
            VM
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p
            aria-hidden="true"
            className="font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-accent"
          >
            Min sida
          </p>
          <h2 className="m-0 truncate font-display text-xl font-bold leading-tight sm:text-2xl">
            {hasIdentity ? name : 'Din profil'}
          </h2>
          <p className="m-0 text-sm text-fg-muted">Din VM 2026</p>
        </div>
      </div>
    </header>
  );
}

/**
 * Ställnings-kortet: en KOMPAKT, glanceable rad , placering "#N av M", total poäng (stolt
 * guld-bricka) och, om den finns, träffsäkerhet. Bär en ärlig "preliminär"-not när topplistan
 * är live just nu. Detta är medvetet INTE hela "Dina poäng"-panelen, bara dess kärna.
 */
function StandingCard({ standing }: { standing: MinSidaStanding }) {
  return (
    <section
      data-min-sida-standing=""
      data-rank={standing.rank}
      data-points={standing.points}
      aria-labelledby="min-sida-standing-rubrik"
      className="vm-tips-score-summary flex flex-col gap-4 rounded-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p
            aria-hidden="true"
            className="font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning"
          >
            Din ställning
          </p>
          <h3
            id="min-sida-standing-rubrik"
            className="m-0 font-display text-sm font-semibold leading-tight"
          >
            I ditt aktiva rum
          </h3>
        </div>

        <div className="flex items-center gap-2.5">
          {/* PLACERINGEN: hela meningen som sr-only (skärmläsaren får placeringen i ord +
              testet ser exakt text), "#N" som lugn pill + "av M" som dämpad text för seende.
              Samma form som tips-summeringens placerings-bricka. */}
          <span
            data-min-sida-rank=""
            className="inline-flex items-baseline gap-1.5 font-display text-sm font-semibold tabular-nums text-fg-muted"
          >
            <span className="sr-only">
              Plats {standing.rank} av {standing.totalMembers}
            </span>
            <span
              aria-hidden="true"
              className="vm-tips-summary-rank-badge rounded-pill px-2 py-1 text-[0.8125rem]"
            >
              #{standing.rank}
            </span>
            <span aria-hidden="true">av {standing.totalMembers}</span>
          </span>

          {/* TOTALEN: den stolta solida guld-brickan (samma som tips-summeringen). */}
          <span
            data-min-sida-points=""
            className="vm-tips-summary-total rounded-pill px-3 py-1.5 text-base"
          >
            {standing.points} poäng
          </span>
        </div>
      </div>

      {/* TRÄFFSÄKERHETEN: en lugn rad UNDER skyltfönstret, bara när den finns (avgjorda tips).
          Utelämnas helt annars (ingen falsk 0 %), samma fail-safe som PersonalStatsSection. */}
      {standing.accuracy !== null ? (
        <p
          data-min-sida-accuracy=""
          className="vm-min-sida-divider m-0 flex items-baseline justify-between gap-3 pt-3 text-sm"
        >
          <span className="text-fg-muted">Träffsäkerhet</span>
          <span className="font-display font-semibold tabular-nums text-fg">
            {formatAccuracy(standing.accuracy)}
          </span>
        </p>
      ) : null}

      {/* ÄRLIG live-not: när topplistan är preliminär (en match pågår) säger vi det rakt ut,
          så placeringen inte läses som definitiv. role="status" -> uppläst när den dyker upp. */}
      {standing.livePreliminary ? (
        <p
          data-min-sida-live=""
          role="status"
          className="m-0 inline-flex items-center gap-1.5 text-xs text-fg-muted"
        >
          <span aria-hidden="true" className="vm-min-sida-live-dot" />
          Preliminär ställning, en match pågår just nu.
        </p>
      ) : null}
    </section>
  );
}

/**
 * "Gå med i ett rum"-noten: visas i ställnings-kortets plats när det INTE finns en egen rad
 * (inget aktivt rum / inte med i ett rum än). En lugn uppmaning, inte tomma stat-rutor.
 */
function NoStandingHint() {
  return (
    <section
      data-min-sida-no-standing=""
      aria-labelledby="min-sida-no-standing-rubrik"
      className="vm-tips-score-summary flex flex-col gap-1.5 rounded-card p-4 sm:p-5"
    >
      <p
        aria-hidden="true"
        className="font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning"
      >
        Din ställning
      </p>
      <h3
        id="min-sida-no-standing-rubrik"
        className="m-0 font-display text-sm font-semibold leading-tight"
      >
        Gå med i ett rum för att se din ställning
      </h3>
      <p className="m-0 text-sm text-fg-muted">
        I ett rum tippar ni tillsammans och din placering räknas fram. Skapa eller gå med via en kod
        under Tips.
      </p>
    </section>
  );
}

/**
 * "Dina rum": en KOMPAKT lista över användarens rum, det aktiva tydligt markerat + pinnat
 * först. Den cross-room "var hör jag hemma"-översikten som inte finns någon annanstans
 * (RoomSection visar bara det aktiva rummets innehåll). Ren visning, ingen byt-rum-handling
 * (det bor i RoomSection/RoomPill, vi duplicerar inte logiken).
 */
function RoomsCard({
  rooms,
}: {
  rooms: readonly { id: string; name: string; isActive: boolean }[];
}) {
  return (
    <section
      data-min-sida-rooms=""
      aria-labelledby="min-sida-rooms-rubrik"
      className="flex flex-col gap-3"
    >
      <h3
        id="min-sida-rooms-rubrik"
        className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted"
      >
        Dina rum ({rooms.length})
      </h3>
      <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
        {rooms.map((room) => (
          <li
            key={room.id}
            data-min-sida-room=""
            data-active={room.isActive}
            className="vm-min-sida-room flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5"
          >
            {/* Aktiv-markör: en liten prick (dekor); markeringen bärs av "Aktivt"-pillen +
                texten (form + text, inte enbart färg), samma "ditt direkt"-anda som rummen. */}
            <span
              aria-hidden="true"
              className="vm-min-sida-room-dot h-2 w-2 shrink-0 rounded-pill"
              data-active={room.isActive}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{room.name}</span>
            {room.isActive ? (
              <span className="shrink-0 rounded-pill bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] px-2 py-0.5 font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-fg">
                Aktivt
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Favoritlag": det pinnade laget (TeamFlag-emblem + namn), eller en lugn en-radig uppmaning
 * att pinna ett under "Favoritlag" längre ner i Mer (väljaren bor där, vi länkar inte bort
 * fokus , bara en mjuk hint). Läser favoritlags-storen + lag-listan, samma källor som väljaren.
 */
function FavoriteCard() {
  const { favoriteTeamId } = useFavoriteTeam();
  const { teams } = useResultsStore();
  const team = useMemo(() => resolveFavoriteTeam(favoriteTeamId, teams), [favoriteTeamId, teams]);

  return (
    <section
      data-min-sida-favorite=""
      data-has-favorite={team !== null}
      aria-labelledby="min-sida-favorite-rubrik"
      className="flex flex-col gap-3"
    >
      <h3
        id="min-sida-favorite-rubrik"
        className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted"
      >
        Favoritlag
      </h3>
      {team !== null ? (
        <div className="flex items-center gap-3">
          <TeamFlag code={team.code} size="md" />
          <span className="min-w-0 truncate font-display text-base font-semibold text-fg">
            {teamShortName(team)}
          </span>
        </div>
      ) : (
        <p className="m-0 text-sm text-fg-muted">
          Inget favoritlag pinnat än. Välj ett under Favoritlag längre ner, så lyfts dess matcher
          fram.
        </p>
      )}
    </section>
  );
}

/**
 * "Min sida": profil-hubben i Mer. Läser de tre stores, härleder profilen (ren, testbar) och
 * gatar honest. Returnerar inget i fixtures/lokalt läge eller utan identitet + rum (samma
 * gate som RoomSection), annars renderar den de delar som FAKTISKT har data.
 */
export function MinSidaSection({ surface }: MinSidaSectionProps) {
  const leaderboard = useLeaderboardStore();
  const rooms = useRoomsStore();

  const profile = useMemo(
    () =>
      deriveMinSidaProfile({
        roomsEnabled: rooms.enabled,
        userId: rooms.userId,
        myRooms: rooms.myRooms,
        activeRoom: rooms.activeRoom,
        members: rooms.members,
        leaderboard: leaderboard.leaderboard,
        selfStats: leaderboard.selfStats,
        livePreliminary: leaderboard.livePreliminary,
      }),
    [
      rooms.enabled,
      rooms.userId,
      rooms.myRooms,
      rooms.activeRoom,
      rooms.members,
      leaderboard.leaderboard,
      leaderboard.selfStats,
      leaderboard.livePreliminary,
    ]
  );

  // Ingen meningsfull profil (lokalt läge / ingen identitet + inga rum): rendera inget alls,
  // ingen tom platta (samma honest-gate som RoomSection).
  if (profile === null) {
    return null;
  }

  return surface(
    <section data-min-sida-section="" aria-label="Min sida" className="flex flex-col gap-5">
      <ProfileHero
        userId={profile.identity?.userId ?? null}
        name={profile.identity?.displayName ?? null}
      />

      {/* Ställningen: kompakt kort om vi har en egen rad, annars en lugn "gå med"-uppmaning. */}
      {profile.standing !== null ? (
        <StandingCard standing={profile.standing} />
      ) : (
        <NoStandingHint />
      )}

      {/* Dina rum: bara när användaren faktiskt har rum (annars utelämnas , ingen tom lista). */}
      {profile.rooms.length > 0 ? <RoomsCard rooms={profile.rooms} /> : null}

      {/* Favoritlaget: alltid med (visar laget eller en mjuk uppmaning att pinna ett). */}
      <FavoriteCard />
    </section>
  );
}
