// Admin-statistik-vyn (T45, #76): arrangörens överblick över HELA ligan , alla rum +
// medlemmar + engagemang, och "vem tippar bäst" (per rum + globalt).
//
// GATING: renderas BARA inifrån admin-vyn (AdminResultEntry, bakom official.isAdmin).
// Datan kommer från de SERVER-GATADE RPC:erna (is_app_admin), så även om vyn på något
// sätt nåddes av en icke-admin skulle den få tom data (servern är det riktiga skyddet).
//
// PREMIUM-FINISH (designen, T45-visuellt): arrangörens KONTROLLPANEL. Funktion
// före fluff (det är ett verktyg bara Daniel ser), men den hör tydligt hemma i appens
// premium-familj , inte en grå admin-tabell. Tre lager bär känslan:
//   1. ÖVERSIKTS-KORTEN (Rum/Tippare totalt): stat-kort med grön arena-glow + talet som
//      en SOLID guld-bricka (färg-oberoende solid-bricka-form, DRY mot tips-summeringen).
//   2. GLOBAL TOPPLISTA: samma PODIUM-estetik som rummens topplista (T17) , topp-3 bär
//      pallplats-MEDALJER (.vm-pool-medal, DRY mot T16/T17), ledar-raden får topplistans
//      varma guld-glow (.vm-board-row[data-leader]-receptet). Lång lista -> max-höjd +
//      scroll (KISS, ingen onödig expander-mekanik).
//   3. RUM-KORTEN: lugna, täta kort med guld-hörn-glow (kupong-värmen), kod-CHIP +
//      engagemangs-PILLAR (skan-bara) + en mini-topplista (max-höjd + scroll).
//
// KONTRAST (lessons aa-kontrast-...-varsta-fall + guld-på-tint-fällan): all läsbar text
// står på opak surface/surface-raised eller en LÅG-alfa tint mätt som canvas-komposit
// (scripts/contrast-t45.mjs). Stat-talen + medalj-siffrorna är mörk ink på en SOLID yta
// (aldrig ljus guld/silver/brons-text på tint), ledar-poängen använder guld-TEXT-tonen
// (text-warning, aldrig rå --vm-gold). Uppmätt MIN: mörkt 6.12:1 / ljust 4.87:1.
// REDUCED-MOTION: inga layout-/transform-animationer, bara lugna färg-övergångar (hover).
//
// Datan kommer ur den rena deriveAdminStats via use-admin-stats (en sanning för poängen,
// delad med T17). VYN är ren presentation; ingen poäng räknas om här.

import { useOfficialResultsStore } from '../official-results';
import { useAdminStats } from './use-admin-stats';
import type { AdminRoomOverview } from './derive-admin-stats';

/**
 * Medalj-modifierare per topp-3-placering (1=guld, 2=silver, 3=brons). DRY mot
 * topplistans podium (T16/T17, .vm-pool-medal). En PLAIN literal (inga importerade
 * värden), så modulen kan importeras utan att binda någon mockad symbol (T66-lärdomen).
 */
const MEDAL_CLASS: Record<number, string> = {
  1: 'vm-pool-medal--gold',
  2: 'vm-pool-medal--silver',
  3: 'vm-pool-medal--bronze',
};

/** Den gemensamma rank-brickan: topp-3 = pallplats-medalj, plats 4+ = neutral pill. */
function RankBadge({ rank }: { rank: number }) {
  const medalClass = MEDAL_CLASS[rank];
  return (
    <span
      aria-label={`Placering ${rank}`}
      className={
        medalClass
          ? `vm-pool-medal ${medalClass} inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums`
          : 'vm-board-rank inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums'
      }
    >
      {rank}
    </span>
  );
}

/**
 * Ett översikts-kort: ett liga-tal som en stolt stat. Talet bärs av en SOLID guld-
 * bricka (färg-oberoende solid-bricka-form), etiketten står lugnt ovanför.
 */
function StatCard({ label, value, hook }: { label: string; value: number; hook: string }) {
  return (
    <div className="vm-admin-stat-card flex flex-col gap-2 rounded-card border border-border p-4">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd>
        <span
          {...{ [hook]: '' }}
          className="vm-admin-stat-value rounded-lg px-3 py-1 font-display text-2xl font-semibold tabular-nums"
        >
          {value}
        </span>
      </dd>
    </div>
  );
}

/** Sammanfattnings-korten: liga-nivå-siffror (antal rum, tippare) som två stat-kort. */
function StatSummary({ rooms, tipsters }: { rooms: number; tipsters: number }) {
  return (
    <dl data-admin-stats-summary="" className="grid grid-cols-2 gap-3 sm:gap-4">
      <StatCard label="Rum totalt" value={rooms} hook="data-admin-stats-total-rooms" />
      <StatCard label="Tippare totalt" value={tipsters} hook="data-admin-stats-total-tipsters" />
    </dl>
  );
}

/** Den globala "vem tippar bäst": alla (rum, medlem)-poster över hela ligan. */
function TopTipsters({ overview }: { overview: ReturnType<typeof useAdminStats>['overview'] }) {
  const top = overview?.topTipsters ?? [];
  if (top.length === 0) {
    return (
      <p data-admin-stats-top-empty="" className="text-sm text-fg-muted">
        Ingen har fått poäng än (poäng tickar in när matcher avgjorts).
      </p>
    );
  }
  return (
    <div className="vm-admin-scroll rounded-card border border-border">
      <table data-admin-stats-top="" className="w-full border-collapse text-sm">
        <caption className="sr-only">Vem tippar bäst, hela ligan</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Placering</th>
            <th scope="col">Tippare</th>
            <th scope="col">Rum</th>
            <th scope="col">Poäng</th>
          </tr>
        </thead>
        <tbody>
          {top.map((entry) => {
            const isLeader = entry.rank === 1;
            return (
              <tr
                key={`${entry.roomId}|${entry.userId}`}
                data-admin-stats-top-row=""
                data-leader={isLeader ? 'true' : undefined}
                className="vm-board-row"
              >
                {/* Placering: medalj (topp-3) eller neutral pill, i en egen cell. */}
                <td data-admin-stats-top-rank="" className="py-2 pl-3 pr-2 align-middle">
                  <RankBadge rank={entry.rank} />
                </td>
                {/* Tippare + rum staplas på smal skärm (namn över, rum under), bredvid
                    varandra först när det får plats. Namnet är radens rubrik (th). */}
                <th scope="row" className="py-2 pr-2 text-left align-middle font-normal">
                  <span className="block truncate font-medium">{entry.displayName}</span>
                  <span className="block truncate text-xs text-fg-muted sm:hidden">
                    {entry.roomName}
                  </span>
                </th>
                {/* Rum-kolumnen (egen kolumn först från sm; på mobil bärs rummet av raden
                    ovan, så ingen info tappas men tabellen håller sig smal). */}
                <td className="hidden truncate py-2 pr-2 align-middle text-fg-muted sm:table-cell">
                  {entry.roomName}
                </td>
                {/* Poängen: ledaren får den AA-säkra guld-TEXT-tonen, övriga fg. */}
                <td
                  data-admin-stats-top-points=""
                  className={`py-2 pl-2 pr-3 text-right align-middle font-display font-semibold tabular-nums ${
                    isLeader ? 'text-warning' : ''
                  }`}
                >
                  {entry.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * En liten engagemangs-pill: ett tal + en etikett (skan-bart faktum). Talet och
 * etiketten skiljs av ett RIKTIGT mellanslags-tecken (inte bara flex-gap), så pillens
 * textContent läser naturligt ("10 matchtips") , det är den sanning admin-vyns test
 * vaktar på engagemangs-containern (`toContain('10 matchtips')`).
 */
function EngagementPill({ value, label }: { value: number; label: string }) {
  return (
    <span className="vm-admin-pill px-2.5 py-1 text-xs text-fg-muted">
      <span className="font-display text-sm font-semibold tabular-nums text-fg">{value}</span>{' '}
      {label}
    </span>
  );
}

/** Ett rum-kort: namn/kod + engagemang + rummets egen topplista. */
function RoomCard({ room }: { room: AdminRoomOverview }) {
  const memberLabel = room.memberCount === 1 ? 'medlem' : 'medlemmar';
  return (
    <li
      data-admin-stats-room=""
      data-room-id={room.roomId}
      className="vm-admin-room-card flex flex-col gap-3 rounded-card border border-border p-4"
    >
      {/* Rubrik-raden: rum-namn + kod-chip. Namnet truncar; chippet är shrink-0. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="min-w-0 truncate font-display text-base font-semibold">{room.name}</h4>
        <span className="vm-admin-pill shrink-0 px-2.5 py-1 text-xs text-fg-muted">
          kod{' '}
          <code data-admin-stats-room-code="" className="vm-admin-code text-fg">
            {room.code}
          </code>
        </span>
      </div>

      {/* Engagemanget som skan-bara pillar. Varje pill bär sin egen läsbara text ("12
          medlemmar", "64 matchtips", ...) så en skärmläsare läser dem som fyra tydliga
          chunkar, ingen separat aria-label behövs (och en aria-label på en role-lös div
          ignoreras ändå). data-admin-stats-room-engagement bär hela textcontenten (en
          sanning, samma som test vaktar: "10 matchtips" är ett sammanhängande spann i
          matchtips-pillen). */}
      <div data-admin-stats-room-engagement="" className="flex flex-wrap gap-1.5">
        <EngagementPill value={room.memberCount} label={memberLabel} />
        <EngagementPill value={room.matchPredictionCount} label="matchtips" />
        <EngagementPill value={room.groupPredictionCount} label="grupptips" />
        <EngagementPill value={room.bracketPredictionCount} label="slutspelstips" />
      </div>

      {/* Rummets egen mini-topplista (max-höjd + scroll om lång). */}
      {room.leaderboard.length > 0 ? (
        <div className="vm-admin-scroll vm-admin-scroll--room rounded-md border border-border">
          <table data-admin-stats-room-leaderboard="" className="w-full border-collapse text-sm">
            <caption className="sr-only">Topplista för {room.name}</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Placering</th>
                <th scope="col">Medlem</th>
                <th scope="col">Poäng</th>
              </tr>
            </thead>
            <tbody>
              {room.leaderboard.map((entry) => {
                const isLeader = entry.rank === 1;
                return (
                  <tr
                    key={entry.userId}
                    data-admin-stats-member-row=""
                    data-leader={isLeader ? 'true' : undefined}
                    className="vm-board-row"
                  >
                    <td className="py-1.5 pl-2.5 pr-2 align-middle">
                      <RankBadge rank={entry.rank} />
                    </td>
                    <th
                      scope="row"
                      className="truncate py-1.5 pr-2 text-left align-middle font-normal font-medium"
                    >
                      {entry.displayName}
                    </th>
                    <td
                      className={`py-1.5 pl-2 pr-2.5 text-right align-middle font-display font-semibold tabular-nums ${
                        isLeader ? 'text-warning' : 'text-fg-muted'
                      }`}
                    >
                      {entry.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Inga medlemmar med poäng än.</p>
      )}
    </li>
  );
}

/**
 * Admin-statistik-vyn. Laddar via use-admin-stats (de två RPC:erna + facit), visar
 * laddning/fel fail-loud, och annars liga-överblicken. Klienten tas ur official-
 * storen (admin-sessionen, samma klient facit-skrivningen använder).
 */
export function AdminStats() {
  const official = useOfficialResultsStore();
  const { status, overview, error } = useAdminStats(official.client);

  if (status === 'loading') {
    return (
      <p role="status" data-admin-stats-loading="" className="text-sm text-fg-muted">
        Laddar ligastatistiken…
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p
        role="alert"
        data-admin-stats-error=""
        className="rounded-md border px-4 py-3 text-sm"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
          color: 'var(--color-danger)',
        }}
      >
        {error ?? 'Kunde inte ladda ligastatistiken.'}
      </p>
    );
  }
  if (!overview) {
    return null;
  }

  return (
    <section data-admin-stats="" aria-label="Ligastatistik" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          Arrangörens panel
        </p>
        <h3 className="font-display text-lg font-semibold sm:text-xl">Ligastatistik</h3>
        <p className="max-w-2xl text-sm text-fg-muted">
          Överblick över alla rum, medlemmar och vem som tippar bäst. Bara du som arrangör ser den
          här. Poängen räknas ut åt alla mot de officiella resultaten du matar in.
        </p>
      </div>

      <StatSummary rooms={overview.totalRooms} tipsters={overview.totalTipsters} />

      <div className="flex flex-col gap-2">
        <h4 className="font-display text-base font-semibold">Vem tippar bäst (hela ligan)</h4>
        <TopTipsters overview={overview} />
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="font-display text-base font-semibold">Alla rum</h4>
        {overview.rooms.length > 0 ? (
          <ul data-admin-stats-rooms="" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {overview.rooms.map((room) => (
              <RoomCard key={room.roomId} room={room} />
            ))}
          </ul>
        ) : (
          <p data-admin-stats-rooms-empty="" className="text-sm text-fg-muted">
            Inga rum har skapats än.
          </p>
        )}
      </div>
    </section>
  );
}
