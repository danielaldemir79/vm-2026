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
//   - events-härledda stats (kort-liga, snabbaste mål, mål-tidning) <- useCrossMatchEvents (T87).
//     VIKTIGT (T100, #207): events täcker bara en DELMÄNGD matcher (match_live_data, de auto-
//     pollade), så dessa kort coverage-MÄRKS ("baseras på N matcher med detaljerad spelardata").
//   - statistics-härledda lag-medel (innehav/skott/fouls) <- useCrossMatchStats (T88), samma
//     event-täcknings-förbehåll (coverage-märks).
//   - facit-härledda stats (Flest mål per lag, Mål per match, Flest mål i en match, clean sheets,
//     skrällar) <- den resolvade matchplanen (useResultsStore, vävt ur official_match_results) +
//     lagens källåkrade FIFA-ranking. T100 (#207) FLYTTADE "Flest mål per lag" + "Mål per match"
//     hit FRÅN events: de måste täcka ALLA färdiga matcher, annars blir en match utan event-rad
//     (t.ex. en 7-1 utan auto-poll) osynlig och stat:en fel.
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
import { aggregateCardLeague, aggregateGoalTiming } from './tournament-stats-events';
import { aggregateTeamMetric } from './tournament-stats-team-metrics';
import {
  aggregateCleanSheets,
  aggregateTeamScoreGoals,
  aggregateUpsets,
} from './tournament-stats-tables';
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

  // COVERAGE-COUNT (T100, #207): hur många matcher har detaljerad event-/spelardata? Varje post i
  // events.matches är EN match med event-rad (match_live_data), så längden ÄR antalet matcher med
  // sådan data , härledd, aldrig hårdkodad. Driver coverage-noteringen på de event-täckande korten.
  const eventCoverageCount = events.matches.length;

  // --- Aggregat (rena, memoiserade: räknas om bara när råvaran faktiskt ändras) ---
  const cardLeague = useMemo(() => aggregateCardLeague(events.matches), [events.matches]);
  const goalTiming = useMemo(() => aggregateGoalTiming(events.matches), [events.matches]);
  // T100 (#207): lag-mål + turnerings-mål ur OFFICIELLT facit (planMatches), inte events , så en
  // match utan event-rad (t.ex. 7-1 utan auto-poll) räknas och stat:en blir sann.
  const teamScoreGoals = useMemo(() => aggregateTeamScoreGoals(planMatches), [planMatches]);
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
  // "Flest mål per lag" ur facit (T100): app-lag-id -> nameOf/codeOf (samma uppslag som clean
  // sheets), INTE API-id-bryggan. Så här matchar siffran grupptabellens GM-kolumn (compute-standings).
  const teamGoalItems: MetricListItem[] = teamScoreGoals.teams.map((t) => ({
    key: `g-${t.teamId}`,
    title: nameOf(t.teamId),
    subtitle: `${t.matches} ${t.matches === 1 ? 'match' : 'matcher'}`,
    teamCode: codeOf(t.teamId),
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
  // COVERAGE-NOTERING (T100, #207, truth-in-labeling): de event-/statistik-täckande korten ser bara
  // matcher med detaljerad spelardata (match_live_data, en delmängd). En lugn en-rads-not gör det
  // ärligt varför en skytt/ett mål från en manuell-facit-match (t.ex. 7-1:an) inte syns här. N
  // härleds (events.matches.length), aldrig hårdkodad. Null när inget täcks än (inget att förklara).
  const eventCoverageNote =
    eventCoverageCount > 0
      ? `Baseras på ${eventCoverageCount} ${
          eventCoverageCount === 1 ? 'match' : 'matcher'
        } med detaljerad spelardata.`
      : null;
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
            // Event-täckt höjdpunkt (T100): bär samma ärliga coverage-not som de andra
            // event-korten, så den inte läses som hela turneringen bredvid det facit-täckta
            // "Mål per match". "Mål per match"/"Flest mål i en match" är facit-täckta -> ingen not.
            coverageNote={eventCoverageNote}
          />
          {/* Mål per match: ur OFFICIELLT facit (T100, #207), gatat på planReady (verkligt facit,
              inte what-if), så snittet räknar ALLA färdiga matcher , inte bara de event-pollade. */}
          <HighlightStatRow
            label="Mål per match"
            ready={planReady}
            value={
              teamScoreGoals.matchesPlayed > 0
                ? teamScoreGoals.goalAverage.toFixed(2).replace('.', ',')
                : null
            }
            detail={
              teamScoreGoals.matchesPlayed > 0
                ? `${teamScoreGoals.totalGoals} mål på ${teamScoreGoals.matchesPlayed} ${
                    teamScoreGoals.matchesPlayed === 1 ? 'match' : 'matcher'
                  }`
                : 'Inga matcher spelade än'
            }
            notReadyText={simulating ? 'Visas med verkliga resultat (tänk-om-läge).' : undefined}
          />
          {/* Flest mål i en match: den färdiga matchen med högst total scoreline (ur facit), som
              Daniel uttryckligen efterfrågade , den hör hemma i facit-källan, inte i events. */}
          <HighlightStatRow
            label="Flest mål i en match"
            ready={planReady}
            value={
              teamScoreGoals.biggestMatch
                ? `${teamScoreGoals.biggestMatch.homeGoals}-${teamScoreGoals.biggestMatch.awayGoals}`
                : null
            }
            detail={
              teamScoreGoals.biggestMatch
                ? `${nameOf(teamScoreGoals.biggestMatch.homeTeamId)} mot ${nameOf(
                    teamScoreGoals.biggestMatch.awayTeamId
                  )}`
                : 'Ingen match spelad än'
            }
            notReadyText={simulating ? 'Visas med verkliga resultat (tänk-om-läge).' : undefined}
          />
        </section>

        {/* ===== Mål-fördelning över matchtiden (15-min-hinkar, event-täckt) ===== */}
        <GoalTimingCard timing={goalTiming} ready={eventsReady} coverageNote={eventCoverageNote} />

        {/* ===== Flest mål per lag (ur OFFICIELLT facit, T100 , matchar grupptabellens GM) ===== */}
        <MetricListCard
          title="Flest mål per lag"
          description="Lagens gjorda mål genom turneringen, ur de officiella resultaten."
          items={teamGoalItems}
          ready={planReady}
          emptyText="Inga mål gjorda än."
          notReadyText={
            simulating ? 'Visas med verkliga resultat (du är i tänk-om-läge).' : 'Laddar...'
          }
          listId={`${listId}-team-goals`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />

        {/* ===== Kort-liga (spelare + lag, event-täckt) ===== */}
        <MetricListCard
          title="Flest kort, spelare"
          description="Gula och röda kort räknas båda."
          items={cardPlayerItems}
          ready={eventsReady}
          emptyText="Inga kort utdelade än."
          coverageNote={eventCoverageNote}
          listId={`${listId}-card-players`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
        <MetricListCard
          title="Flest kort, lag"
          description="Vilket lag samlar på sig flest tillsägelser?"
          items={cardTeamItems}
          ready={eventsReady}
          emptyText="Inga kort utdelade än."
          coverageNote={eventCoverageNote}
          listId={`${listId}-card-teams`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />

        {/* ===== Lag-medel ur matchstatistiken (near-live, event-täckt) ===== */}
        <MetricListCard
          title="Mest bollinnehav"
          description="Snittinnehav per match, för lag med rapporterad statistik."
          items={possessionItems}
          ready={statsReady}
          emptyText="Ingen bollinnehav-statistik än."
          coverageNote={eventCoverageNote}
          listId={`${listId}-possession`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
        <MetricListCard
          title="Flest skott"
          description="Snitt antal skott per match."
          items={shotsItems}
          ready={statsReady}
          emptyText="Ingen skott-statistik än."
          coverageNote={eventCoverageNote}
          listId={`${listId}-shots`}
          collapsedVisibleCount={COLLAPSED_VISIBLE}
        />
        <MetricListCard
          title="Mest fouls"
          description="Snitt antal frisparksförseelser per match, det stökigaste laget."
          items={foulsItems}
          ready={statsReady}
          emptyText="Ingen fouls-statistik än."
          coverageNote={eventCoverageNote}
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
