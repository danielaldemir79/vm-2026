// PERSONLIG TIPS-STATISTIK i tips-vyn (T23, #23). FUNKTIONELLT + a11y-lager
// (senior-dev); PREMIUM-FINISH (design-frontend) ovanpå data-attribut-seamen.
//
// VARFÖR (acceptanskriterium): varje användare ska se sin egen träffsäkerhet över
// tid, bästa call och antal rätt utfall/exakta. Datan HÄRLEDS ur SAMMA score.ts-
// poängväg som topplistan (store.selfStats <- derivePersonalStats), ingen omräkning,
// ingen extra hämtning (samma delade LeaderboardProvider som TipsScoreSummary läser).
//
// GATAR tyst: utan en egen statistik-rad (selfStats null: ingen identitet / inte
// medlem) renderar sektionen inget. Och utan NÅGOT avgjort tips än (decidedTips 0)
// visas en lugn "ingen statistik än"-rad i stället för falska nollor, samma fail-safe
// som deriveSelfSummary (hellre ärligt tomt än en gissad 0 %).
//
// DESIGN-HAKAR: data-personal-stats + data-stat (accuracy/exact/outcome/miss) +
// data-best-call, så design-frontend kan finputsa utan att röra semantiken.

import { useMemo } from 'react';
import { useLeaderboardStore } from './leaderboard-context';
import { teamShortName } from '../../domain/team-name';
import type { Team } from '../../domain/types';
import type { BestCall } from './personal-stats';

/** Formatera träffsäkerheten (0-1) som hel procent ("75 %"). Avrundat, svensk enhet. */
function formatAccuracy(accuracy: number): string {
  return `${Math.round(accuracy * 100)} %`;
}

/** Den svenska "varför"-etiketten för bästa callets poäng-typ (samma vokabulär som poängguiden). */
function pointTypeLabel(pointType: BestCall['pointType']): string {
  return pointType === 'exact' ? 'Exakt resultat' : 'Rätt utfall';
}

/** Matchup-rubriken för bästa call ("Brasilien mot Bosnien"), kort namn ur lag-listan. */
function bestCallMatchup(best: BestCall, teamsById: ReadonlyMap<string, Team>): string {
  const home = best.homeTeamId !== null ? teamsById.get(best.homeTeamId) : undefined;
  const away = best.awayTeamId !== null ? teamsById.get(best.awayTeamId) : undefined;
  // Ett okänt lag (saknas i listan / null) faller till "?", aldrig en gissad rubrik.
  const homeName = home ? teamShortName(home) : '?';
  const awayName = away ? teamShortName(away) : '?';
  return `${homeName} mot ${awayName}`;
}

export function PersonalStatsSection() {
  const store = useLeaderboardStore();
  const stats = store.selfStats;

  const teamsById = useMemo(() => new Map(store.teams.map((t) => [t.id, t])), [store.teams]);

  // Samma gate som TipsScoreSummary: bara i ready-läge OCH med en egen statistik-rad.
  const ready = store.enabled && store.status === 'ready';
  if (!ready || stats === null) {
    return null;
  }

  return (
    <section
      data-personal-stats=""
      aria-labelledby="personal-stats-rubrik"
      // SYSKON till poäng-summeringen ovanför (TipsScoreSummary, §20), INTE en kopia:
      // .vm-personal-stats är samma kvällsljus-familj (surface + svag guld-glow), men en
      // LUGNARE glow + en NEUTRAL inset-topplist (inte guld), så panelen läser som "din
      // SPELSTIL" under "din STÄLLNING" utan att två guld-block tävlar (tokens.css §25).
      className="vm-personal-stats flex flex-col gap-4 rounded-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-0.5">
        {/* EYEBROW: den AA-säkra guld-TEXT-tonen (--color-warning), samma varma signatur
            som summeringens eyebrow, så de hör ihop. ALDRIG rå --vm-gold (faller under AA
            som text, lessons). Mätt 8.80 mörkt / 5.48 ljust på panel-glow:en. */}
        <p
          aria-hidden="true"
          className="font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning"
        >
          Din statistik
        </p>
        <h3
          id="personal-stats-rubrik"
          className="m-0 font-display text-sm font-semibold leading-tight"
        >
          Hur du tippar
        </h3>
      </div>

      {stats.decidedTips === 0 ? (
        // Inga avgjorda tips än: ärligt tomt, inte falska nollor (samma anda som
        // deriveSelfSummary null -> ingen gissad rad).
        <p data-stats-empty="" className="text-sm text-fg-muted">
          Ingen statistik än, den fylls i när dina tippade matcher är spelade.
        </p>
      ) : (
        <>
          {/* NYCKELTAL-RADEN: fyra brickor. TRÄFFSÄKERHETEN är HERO-brickan (det
              viktigaste talet, "hur ofta prickar JAG rätt"), varmt lyft med en guld-tint
              + guld-TEXT-etikett (.vm-stat-accuracy, §25), så ögat landar där först. De
              tre räkne-brickorna (exakta/utfall/avgjorda) är LUGNA neutrala surface-raised-
              rutor, så de stödjer hero-talet utan att tävla. Medvetet INGEN solid guld-yta
              här (det skulle eka summeringens total ovanför). Varje tal bär en synlig dt-
              etikett + tabular-nums (siffrorna hoppar inte). data-stat = design-/test-hak. */}
          <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              data-stat="accuracy"
              className="vm-stat-accuracy flex flex-col gap-0.5 rounded-md p-3"
            >
              <dt className="vm-stat-accuracy-label text-[0.6875rem] font-semibold uppercase tracking-wide">
                Träffsäkerhet
              </dt>
              <dd className="m-0 font-display text-lg font-bold tabular-nums text-fg">
                {/* accuracy är aldrig null här (decidedTips > 0), men vi narrowar ärligt. */}
                {stats.accuracy !== null ? formatAccuracy(stats.accuracy) : '–'}
              </dd>
            </div>
            <div
              data-stat="exact"
              className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-raised p-3"
            >
              <dt className="text-[0.6875rem] uppercase tracking-wide text-fg-muted">Exakta</dt>
              <dd className="m-0 font-display text-lg font-bold tabular-nums">{stats.exactHits}</dd>
            </div>
            <div
              data-stat="outcome"
              className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-raised p-3"
            >
              <dt className="text-[0.6875rem] uppercase tracking-wide text-fg-muted">
                Rätt utfall
              </dt>
              <dd className="m-0 font-display text-lg font-bold tabular-nums">
                {stats.outcomeHits}
              </dd>
            </div>
            <div
              data-stat="decided"
              className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-raised p-3"
            >
              <dt className="text-[0.6875rem] uppercase tracking-wide text-fg-muted">
                Avgjorda tips
              </dt>
              <dd className="m-0 font-display text-lg font-bold tabular-nums">
                {stats.decidedTips}
              </dd>
            </div>
          </dl>

          {/* BÄSTA CALL: det enskilda tips som gav mest poäng, "det stolta
              ögonblicket". Bara när ett tips faktiskt gett poäng (bestCall !== null); annars
              utelämnas raden. .vm-best-call (§25) ger en surface-raised-bricka med en LÅG
              guld-glow + hårfin guld-topplist (kvällsljus-värmen ekar, dämpat), så den känns
              som ett litet firande utan att skrika. En liten guld-eyebrow-etikett binder den
              till tips-världens guld-signatur. */}
          {stats.bestCall !== null ? (
            <div data-best-call="" className="vm-best-call flex flex-col gap-1 rounded-md p-3">
              <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-warning">
                <span aria-hidden="true" className="leading-none">
                  ★
                </span>
                Bästa call
              </p>
              <p className="m-0 text-sm font-semibold text-fg">
                {bestCallMatchup(stats.bestCall, teamsById)}
              </p>
              <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                <span>{pointTypeLabel(stats.bestCall.pointType)}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums text-fg">{stats.bestCall.points} p</span>
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
