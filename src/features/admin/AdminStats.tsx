// Admin-statistik-vyn (T45, #76): arrangörens överblick över HELA ligan , alla rum +
// medlemmar + engagemang, och "vem tippar bäst" (per rum + globalt).
//
// GATING: renderas BARA inifrån admin-vyn (AdminResultEntry, bakom official.isAdmin).
// Datan kommer från de SERVER-GATADE RPC:erna (is_app_admin), så även om vyn på något
// sätt nåddes av en icke-admin skulle den få tom data (servern är det riktiga skyddet).
//
// Den FUNKTIONELLA + tillgängliga basen (semantiska tabeller, rubriker, stabila
// data-*-hakar). PREMIUM-design (arena-estetik) lämnas till design-frontend, samma
// arbetsdelning som resten av admin-/tips-ytorna. Datan kommer ur den rena
// deriveAdminStats via use-admin-stats (en sanning för poängen, delad med T17).

import { useOfficialResultsStore } from '../official-results';
import { useAdminStats } from './use-admin-stats';
import type { AdminRoomOverview } from './derive-admin-stats';

/** Sammanfattnings-kort: liga-nivå-siffror (antal rum, tippare). */
function StatSummary({ rooms, tipsters }: { rooms: number; tipsters: number }) {
  return (
    <dl data-admin-stats-summary="" className="flex flex-wrap gap-4">
      <div className="flex flex-col">
        <dt className="text-sm text-fg-muted">Rum totalt</dt>
        <dd data-admin-stats-total-rooms="" className="font-display text-2xl font-semibold">
          {rooms}
        </dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-sm text-fg-muted">Tippare totalt</dt>
        <dd data-admin-stats-total-tipsters="" className="font-display text-2xl font-semibold">
          {tipsters}
        </dd>
      </div>
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
    <table data-admin-stats-top="" className="w-full border-collapse text-sm">
      <caption className="sr-only">Vem tippar bäst, hela ligan</caption>
      <thead>
        <tr>
          <th scope="col" className="text-left">
            #
          </th>
          <th scope="col" className="text-left">
            Tippare
          </th>
          <th scope="col" className="text-left">
            Rum
          </th>
          <th scope="col" className="text-right">
            Poäng
          </th>
        </tr>
      </thead>
      <tbody>
        {top.map((entry) => (
          <tr key={`${entry.roomId}|${entry.userId}`} data-admin-stats-top-row="">
            <td data-admin-stats-top-rank="">{entry.rank}</td>
            <th scope="row" className="text-left font-normal">
              {entry.displayName}
            </th>
            <td className="text-fg-muted">{entry.roomName}</td>
            <td data-admin-stats-top-points="" className="text-right tabular-nums">
              {entry.points}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ett rum-kort: namn/kod + engagemang + rummets egen topplista. */
function RoomCard({ room }: { room: AdminRoomOverview }) {
  return (
    <li data-admin-stats-room="" data-room-id={room.roomId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-base font-semibold">{room.name}</h4>
        <span className="text-xs text-fg-muted">
          kod <code data-admin-stats-room-code="">{room.code}</code>
        </span>
      </div>
      <p data-admin-stats-room-engagement="" className="text-sm text-fg-muted">
        {room.memberCount} {room.memberCount === 1 ? 'medlem' : 'medlemmar'} ,{' '}
        {room.matchPredictionCount} matchtips, {room.groupPredictionCount} grupptips,{' '}
        {room.bracketPredictionCount} slutspelstips
      </p>
      {room.leaderboard.length > 0 ? (
        <table data-admin-stats-room-leaderboard="" className="w-full border-collapse text-sm">
          <caption className="sr-only">Topplista för {room.name}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                #
              </th>
              <th scope="col" className="text-left">
                Medlem
              </th>
              <th scope="col" className="text-right">
                Poäng
              </th>
            </tr>
          </thead>
          <tbody>
            {room.leaderboard.map((entry) => (
              <tr key={entry.userId} data-admin-stats-member-row="">
                <td>{entry.rank}</td>
                <th scope="row" className="text-left font-normal">
                  {entry.displayName}
                </th>
                <td className="text-right tabular-nums">{entry.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <p role="status" data-admin-stats-loading="">
        Laddar ligastatistiken…
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p role="alert" data-admin-stats-error="">
        {error ?? 'Kunde inte ladda ligastatistiken.'}
      </p>
    );
  }
  if (!overview) {
    return null;
  }

  return (
    <section data-admin-stats="" aria-label="Ligastatistik" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">Ligastatistik</h3>
        <p className="text-sm text-fg-muted">
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
          <ul data-admin-stats-rooms="" className="flex flex-col gap-5">
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
