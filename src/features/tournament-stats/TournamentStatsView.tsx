// TURNERINGSSTATISTIK (T88, #180): Daniels stora "fyll på FLITIGT med roliga turnerings-stats"-
// del, i Turnering-fliken under skytteligan (T87). Visar en RIK uppsättning härledda VM-stats,
// NEAR-LIVE där det passar (kort/mål-fördelning/lag-stats uppdateras live via cross-match-
// hookarna; clean sheets/skrällar blir slutgiltiga vid FT via den resolvade matchplanen).
//
// PRESENTATION (north-star §2 progressive disclosure + §3 ETT komponentsprak): EN omslags-
// Surface med en kort intro, sedan flera stat-KORT. Varje LISTA börjar KOMPRIMERAD med bara
// början synlig + "Visa alla"-utfäll, via den DELADE CollapsibleList-primitiven (Daniels
// mönster: många listor får INTE bli väggar). Ytan bärs av Surface + tokens, lag-identitet av
// den delade TeamFlag-discen , konsekvent med skytteligan och resten av appen.
//
// DATA (en sanning, gissa aldrig en siffra):
//   - events-härledda stats (kort-liga, mål-tidning, lag-mål) <- useCrossMatchEvents (T87)
//   - statistics-härledda lag-medel (innehav/skott/fouls) <- useCrossMatchStats (T88)
//   - tabell-härledda stats (clean sheets, skrällar) <- den resolvade matchplanen
//     (useResultsStore, vävt ur official_match_results) + lagens källåkrade FIFA-ranking
//
// A11y: laddning = role=status, fel = role=alert (fail-loud), listor är <ol> med rank-aria.
// Motion ärvs av husets primitiver (reduced-motion-gatat där). Responsiv: namn truncar,
// siffer-kolumner shrink-0 (samma grepp som skytteligan/LeaderboardRow).

import { useId, useMemo } from 'react';
import { Surface } from '../../components/Surface';
import { resolveAppTeamId } from '../../data/livescore';
import { useResultsStore } from '../results';
import { useCrossMatchEvents } from './use-cross-match-events';
import { useCrossMatchStats } from './use-cross-match-stats';
import {
  aggregateCardLeague,
  aggregateGoalTiming,
  aggregateTeamGoals,
} from './tournament-stats-events';
import { aggregateTeamMetric } from './tournament-stats-team-metrics';
import { aggregateCleanSheets, aggregateUpsets } from './tournament-stats-tables';
import {
  GoalTimingCard,
  HighlightStatRow,
  MetricListCard,
  type MetricListItem,
} from './tournament-stat-cards';

/** Topp-N synliga i komprimerat läge innan "Visa alla" (north-star: topp-N). */
const COLLAPSED_VISIBLE = 5;

/** Lag-koden (gemen FIFA) för flagg-discen ur ett API-team-id (events-rader). null -> ingen disc. */
function flagFromApiId(teamApiId: number): string | null {
  return resolveAppTeamId(teamApiId);
}

/**
 * Turneringsstatistik-vyn. Laddar de tre datakällorna (events near-live, statistics near-live,
 * den resolvade matchplanen), aggregerar rent + memoiserat, och visar en rik uppsättning
 * stat-kort. Tål alla tillstånd: laddning (status), fel (alert, fail-loud), tom data (lugna
 * rader). I fixtures-läge renderas allt ur committad demo-data (utan backend).
 */
export function TournamentStatsView() {
  const events = useCrossMatchEvents();
  const stats = useCrossMatchStats();
  const { teams, matches: planMatches, status: resultsStatus, simulating } = useResultsStore();
  const listId = useId();

  // SIM-GRIND (F2, samma intention som skytteligan ligger UTANFÖR SimulationFrame): de
  // resultat-härledda korten (clean sheets/skrällar) läser results-storens matchlista, som i
  // what-if-läge är de EFFEKTIVA (sim-overlaid) matcherna. Turneringsstatistiken ska visa
  // VERKLIG turneringsdata, inte sandlåde-resultat, så vi gatar dem på att what-if-läget är AV.
  // Event-/statistik-korten är oberoende av storen (egna live-hookar) och påverkas inte.
  const realResultsAvailable = resultsStatus === 'ready' && !simulating;

  // En ranking-uppslagning ur de källåkrade lag-profilerna (fifaRanking bärs av Team).
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const rankOf = useMemo(
    () =>
      (teamId: string): number | null =>
        teamById.get(teamId)?.fifaRanking ?? null,
    [teamById]
  );
  const nameOf = (teamId: string): string => teamById.get(teamId)?.name ?? teamId;
  const codeOf = (teamId: string): string | null => teamById.get(teamId)?.code ?? null;

  // --- Aggregat (rena, memoiserade: räknas om bara när råvaran faktiskt ändras) ---
  const cardLeague = useMemo(() => aggregateCardLeague(events.matches), [events.matches]);
  const goalTiming = useMemo(() => aggregateGoalTiming(events.matches), [events.matches]);
  const teamGoals = useMemo(() => aggregateTeamGoals(events.matches), [events.matches]);
  const possession = useMemo(
    () => aggregateTeamMetric(stats.matches, 'possession'),
    [stats.matches]
  );
  const shots = useMemo(() => aggregateTeamMetric(stats.matches, 'shotsTotal'), [stats.matches]);
  const fouls = useMemo(() => aggregateTeamMetric(stats.matches, 'fouls'), [stats.matches]);
  const cleanSheets = useMemo(() => aggregateCleanSheets(planMatches), [planMatches]);
  const upsets = useMemo(() => aggregateUpsets(planMatches, rankOf), [planMatches, rankOf]);

  // --- Vy-modeller (lag-kod -> flagg-disc) för list-korten ---
  const cardPlayerItems: MetricListItem[] = cardLeague.players.map((p) => ({
    key: `p-${p.playerId}`,
    title: p.playerName,
    subtitle: p.teamName,
    teamCode: flagFromApiId(p.teamApiId),
    value: String(p.total),
    valueUnit: p.total === 1 ? 'kort' : 'kort',
    note: noteForCards(p.yellow, p.red),
  }));
  const cardTeamItems: MetricListItem[] = cardLeague.teams.map((t) => ({
    key: `t-${t.teamApiId}`,
    title: t.teamName,
    subtitle: null,
    teamCode: flagFromApiId(t.teamApiId),
    value: String(t.total),
    valueUnit: t.total === 1 ? 'kort' : 'kort',
    note: noteForCards(t.yellow, t.red),
  }));
  const teamGoalItems: MetricListItem[] = teamGoals.teams.map((t) => ({
    key: `g-${t.teamApiId}`,
    title: t.teamName,
    subtitle: `${t.matches} ${t.matches === 1 ? 'match' : 'matcher'}`,
    teamCode: flagFromApiId(t.teamApiId),
    value: String(t.goals),
    valueUnit: 'mål',
    note: null,
  }));
  const possessionItems = metricItems(possession, '%');
  const shotsItems = metricItems(shots, '', 'skott/match');
  const foulsItems = metricItems(fouls, '', 'fouls/match');
  const cleanSheetItems: MetricListItem[] = cleanSheets.map((c) => ({
    key: `cs-${c.teamId}`,
    title: nameOf(c.teamId),
    subtitle: `${c.played} ${c.played === 1 ? 'match' : 'matcher'}`,
    teamCode: codeOf(c.teamId),
    value: String(c.cleanSheets),
    valueUnit: c.cleanSheets === 1 ? 'nolla' : 'nollor',
    note: null,
  }));
  const upsetItems: MetricListItem[] = upsets.map((u) => ({
    key: `up-${u.matchId}`,
    title: `${nameOf(u.winnerTeamId)} slog ${nameOf(u.loserTeamId)}`,
    subtitle: `Ranking ${u.winnerRank} mot ${u.loserRank}`,
    teamCode: codeOf(u.winnerTeamId),
    value: `+${u.rankGap}`,
    valueUnit: 'placeringar',
    note: null,
  }));

  const eventsReady = events.status === 'ready';
  const statsReady = stats.status === 'ready';
  // De resultat-härledda korten är "klara" bara när vi har VERKLIGT facit (inte i what-if-läge,
  // se sim-grinden ovan). I sim-läge visas en lugn notering i stället för sandlåde-siffror.
  const planReady = realResultsAvailable;

  return (
    <Surface aria-labelledby="tournament-stats-heading" data-tournament-stats-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          VM-statistik
        </p>
        <h2
          id="tournament-stats-heading"
          className="font-display text-xl font-semibold sm:text-2xl"
        >
          Turneringsstatistik
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Roliga siffror ur hela turneringen, allt härlett ur matchdatan. Stats med live-data
          uppdateras direkt; clean sheets och skrällar låses när matchen är slutspelad.
        </p>
      </header>

      {events.status === 'error' ? (
        <p role="alert" data-tournament-stats-error="" className="mt-5 py-2 text-sm text-danger">
          Kunde inte ladda turneringsstatistiken{events.error ? `: ${events.error}` : '.'}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-8">
        {/* ===== Höjdpunkter: snabbaste mål + målsnitt (kompakta nyckeltal) ===== */}
        <section aria-label="Höjdpunkter" className="grid gap-3 sm:grid-cols-2">
          <HighlightStatRow
            label="Snabbaste mål"
            ready={eventsReady}
            value={goalTiming.fastest ? formatMinute(goalTiming.fastest) : null}
            detail={
              goalTiming.fastest
                ? `${goalTiming.fastest.scorerName ?? 'Okänd skytt'} (${goalTiming.fastest.teamName})`
                : 'Inget mål än'
            }
          />
          <HighlightStatRow
            label="Mål per match"
            ready={eventsReady}
            value={
              teamGoals.matchesPlayed > 0
                ? teamGoals.goalAverage.toFixed(2).replace('.', ',')
                : null
            }
            detail={
              teamGoals.matchesPlayed > 0
                ? `${teamGoals.totalGoals} mål på ${teamGoals.matchesPlayed} ${
                    teamGoals.matchesPlayed === 1 ? 'match' : 'matcher'
                  }${teamGoals.ownGoals > 0 ? `, varav ${teamGoals.ownGoals} självmål` : ''}`
                : 'Inga matcher spelade än'
            }
          />
        </section>

        {/* ===== Mål-fördelning över matchtiden (15-min-hinkar) ===== */}
        <GoalTimingCard timing={goalTiming} ready={eventsReady} />

        {/* ===== Flest mål per lag ===== */}
        <MetricListCard
          title="Flest mål per lag"
          description="Lagens mål genom turneringen (självmål räknas inte på laget)."
          items={teamGoalItems}
          ready={eventsReady}
          emptyText="Inga mål gjorda än."
          listId={`${listId}-team-goals`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />

        {/* ===== Kort-liga (spelare + lag) ===== */}
        <MetricListCard
          title="Flest kort, spelare"
          description="Gula och röda kort räknas båda."
          items={cardPlayerItems}
          ready={eventsReady}
          emptyText="Inga kort utdelade än."
          listId={`${listId}-card-players`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
        <MetricListCard
          title="Flest kort, lag"
          description="Vilket lag samlar på sig flest tillsägelser?"
          items={cardTeamItems}
          ready={eventsReady}
          emptyText="Inga kort utdelade än."
          listId={`${listId}-card-teams`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />

        {/* ===== Lag-medel ur matchstatistiken (near-live) ===== */}
        <MetricListCard
          title="Mest bollinnehav"
          description="Snittinnehav per match, för lag med rapporterad statistik."
          items={possessionItems}
          ready={statsReady}
          emptyText="Ingen bollinnehav-statistik än."
          listId={`${listId}-possession`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
        <MetricListCard
          title="Flest skott"
          description="Snitt antal skott per match."
          items={shotsItems}
          ready={statsReady}
          emptyText="Ingen skott-statistik än."
          listId={`${listId}-shots`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
        <MetricListCard
          title="Mest fouls"
          description="Snitt antal frisparksförseelser per match, det stökigaste laget."
          items={foulsItems}
          ready={statsReady}
          emptyText="Ingen fouls-statistik än."
          listId={`${listId}-fouls`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />

        {/* ===== Clean sheets + skrällar (resultat-härledda, slutgiltiga vid FT) ===== */}
        <MetricListCard
          title="Flest hållna nollor"
          description="Lag som höll motståndaren mållös, clean sheets."
          items={cleanSheetItems}
          ready={planReady}
          emptyText="Ingen nolla hållen än."
          notReadyText={
            simulating ? 'Visas med verkliga resultat (du är i tänk-om-läge).' : 'Laddar...'
          }
          listId={`${listId}-clean-sheets`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
        <MetricListCard
          title="Största skrällarna"
          description="När ett lägre rankat lag slog ett högre, sorterat på ranking-avstånd."
          items={upsetItems}
          ready={planReady}
          emptyText="Ingen skräll än, favoriterna har hållit."
          notReadyText={
            simulating ? 'Visas med verkliga resultat (du är i tänk-om-läge).' : 'Laddar...'
          }
          listId={`${listId}-upsets`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
      </div>
    </Surface>
  );
}

/** "varav N gula, M röda"-noteringen för en kort-rad (null när inget att visa). */
function noteForCards(yellow: number, red: number): string | null {
  const parts: string[] = [];
  if (yellow > 0) {
    parts.push(`${yellow} ${yellow === 1 ? 'gult' : 'gula'}`);
  }
  if (red > 0) {
    parts.push(`${red} ${red === 1 ? 'rött' : 'röda'}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Formatera en spelad minut "12'" / "90+3'" (svensk minut-notation). */
function formatMinute(g: { minute: number; extra: number | null }): string {
  return g.extra !== null ? `${g.minute}+${g.extra}'` : `${g.minute}'`;
}

/**
 * Projicera ett lag-medel-aggregat (statistik-rader, team-API-id-nyckade) till list-items.
 * Flaggan löses via team-bryggan (resolveAppTeamId), inte via name/code-uppslaget, eftersom
 * statistik-rader bär API-team-id (cross-match), inte appens lag-id.
 */
function metricItems(
  rows: ReadonlyArray<{ teamApiId: number; teamName: string; average: number; samples: number }>,
  suffix: string,
  unit = ''
): MetricListItem[] {
  return rows.map((r) => ({
    key: `m-${r.teamApiId}`,
    title: r.teamName,
    subtitle: `${r.samples} ${r.samples === 1 ? 'match' : 'matcher'}`,
    teamCode: flagFromApiId(r.teamApiId),
    value: formatAverage(r.average) + suffix,
    valueUnit: unit,
    note: null,
  }));
}

/** Avrunda ett medel snyggt: heltal utan decimal, annars en decimal med svenskt komma. */
function formatAverage(n: number): string {
  if (Number.isInteger(n)) {
    return String(n);
  }
  return n.toFixed(1).replace('.', ',');
}
