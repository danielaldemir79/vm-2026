// "Vad krävs"-vyn (T11, issue #11): live-scenarier för sista gruppomgången.
//
// Ansvar (senior-devs lager): KORREKT + TILLGÄNGLIG struktur. Per grupp en
// sektion; per lag en rad med en STATUS-CHIP (Klar / Ute / Beror på) + en svensk
// villkorstext. Datan är LIVE (useGroupScenarios härleder den reaktivt ur den
// delade storen, en resultatinmatning räknar om). Icke-happy-path hanteras:
// laddning (role="status"), fel (role="alert", fail loud), tom data.
//
// DESIGN-SEAM: vyn bär stabil semantik + DATA-ATTRIBUT (data-scenario-group,
// data-scenario-team, data-scenario-status, data-scenario-margin-dependent,
// data-scenario-decided) som designen stylar premium-finishen ovanpå
// utan att röra logik/semantik (samma princip som GroupTable/BracketView).
//
// FÄRG-OBEROENDE status (T7-pin, samma anda som kvalificeringszonen): chip:en
// bär status via TEXT + form + data-attribut, inte bara en färg, så den läses i
// båda teman och för färgblinda. Premium-färgläggningen lämnas till design.

import { useMemo } from 'react';
import type { AdvancementStatus, GroupScenario, TeamScenario } from './scenario-engine';
import type { Team } from '../../domain/types';
import { Fade, Slide, transitions } from '../../motion';
import { CollapsibleBody } from '../../components/CollapsibleSection';
import { useGroupScenarios } from './use-group-scenarios';
// Premium-visuella lagret (status-chips, arena-kort, väntande-tillstånd). Stylas
// ENBART via seamens data-attribut + klass-hakar nedan, så senior-devs semantik +
// alla tester står kvar (samma seam-princip som GroupTable/BracketView, T7/T9).
import './scenario.css';

/** Svensk etikett + a11y-beskrivning per status (en sanning för UI:t). */
const STATUS_LABELS: Readonly<Record<AdvancementStatus, string>> = {
  qualified: 'Klar',
  eliminated: 'Ute',
  depends: 'Beror på',
};

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

/** Visa ett lags namn (+ landskod). Fail-safe: visa id:t synligt vid okänt lag. */
function teamLabel(
  teamId: string,
  teamsById: ReadonlyMap<string, Team>
): { name: string; code: string } {
  const team = teamsById.get(teamId);
  return { name: team?.name ?? teamId, code: team?.code ?? '???' };
}

/**
 * En status-chip: FÄRG-OBEROENDE (T7/T8-pin). Bär status via TEXT + form + en
 * glyf + data-attribut, inte bara en färg, så Klar/Ute/Beror på skiljs i båda
 * teman och för färgblinda. Glyfen + tonen läggs av scenario.css ur data-attributet
 * (vm-scenario-chip-haken), så denna förblir ren semantik. Bas-formen (pill,
 * padding, vikt) bor här; status-färgläggningen i CSS-lagret.
 */
function StatusChip({ status }: { status: AdvancementStatus }) {
  return (
    <span
      data-scenario-status={status}
      className="vm-scenario-chip shrink-0 rounded-pill border px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** En rad per lag: placering + namn + status-chip + villkorstext. */
function TeamRow({
  team,
  teamsById,
}: {
  team: TeamScenario;
  teamsById: ReadonlyMap<string, Team>;
}) {
  const { name, code } = teamLabel(team.teamId, teamsById);
  return (
    <li
      data-scenario-team={team.teamId}
      data-scenario-status={team.status}
      data-scenario-margin-dependent={team.marginDependent ? 'true' : undefined}
      // vm-scenario-row: CSS-lagret lyfter raden FÄRG-OBEROENDE ur status-attributet
      // (Klar = vänster-list + upphöjd yta, Ute = diskret nedtoning, Beror på =
      // guld-list), så klassningen läses även i gråskala (T7-pin). -mx-2 px-2 låter
      // radens yt-ton/list nå ut till kortets kant utan att texten flyttar.
      className="vm-scenario-row -mx-2 flex flex-col gap-1 border-b border-border/50 px-2 py-2 last:border-b-0"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="vm-scenario-rank inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border text-[0.625rem] font-bold tabular-nums"
        >
          {team.currentRank}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {name}
          <span className="ml-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-fg-muted">
            {code}
          </span>
        </span>
        <StatusChip status={team.status} />
      </div>
      {/* Villkorstexten: vad laget behöver, på svenska. Knuten till raden. */}
      <p className="pl-7 text-xs text-fg-muted">{team.condition}</p>
    </li>
  );
}

/** En grupp-sektion: rubrik + en lista lag-rader. */
function GroupScenarioCard({
  scenario,
  teamsById,
  index,
}: {
  scenario: GroupScenario;
  teamsById: ReadonlyMap<string, Team>;
  index: number;
}) {
  const delay = Math.min(index * 0.04, 0.4);
  const isLive = scenario.phase === 'scenarios';
  return (
    <Slide direction="up" transition={{ ...transitions.smooth, delay }} className="h-full">
      <article
        data-scenario-group={scenario.groupId}
        data-scenario-decided={scenario.decided ? 'true' : undefined}
        // vm-scenario-card: CSS-lagret lägger en mjuk "arena i kvällsljus"-glow ur
        // kortets övre hörn (grön i live-läget, guld när gruppen är färdigspelad).
        className="vm-scenario-card flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-[var(--vm-shadow-card)]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="font-display text-base font-bold">Grupp {scenario.groupId}</h3>
          <span
            data-scenario-phase={scenario.phase}
            className="vm-scenario-phase text-[0.6875rem] font-semibold uppercase tracking-wide text-fg-muted"
          >
            {/* Live-läget får en lugn andnings-prick (det här lever just nu), de
                andra faserna en ren etikett. Pricken är dekorativ (aria-hidden). */}
            {isLive ? <span aria-hidden="true" className="vm-scenario-live-dot" /> : null}
            {scenario.phase === 'decided'
              ? 'Färdigspelad'
              : scenario.phase === 'too-early'
                ? 'Inför sista omgången'
                : `${scenario.remainingMatches} ${
                    scenario.remainingMatches === 1 ? 'match' : 'matcher'
                  } kvar`}
          </span>
        </div>
        {scenario.phase === 'too-early' ? (
          <TooEarlyBody />
        ) : (
          <ul className="flex flex-col px-4 py-2">
            {scenario.teams.map((team) => (
              <TeamRow key={team.teamId} team={team} teamsById={teamsById} />
            ))}
          </ul>
        )}
      </article>
    </Slide>
  );
}

/**
 * Det ELEGANTA väntande-tillståndet (fas 'too-early'): ett lugnt platshållar-block
 * i stället för en rad lag utan klassning. En stiliserad arena-ring (ren CSS, ingen
 * extra asset) + en kort, varm copy som FÖRKLARAR varför scenarierna inte visas än,
 * så det läser som "snart", inte som ett tomt fel.
 *
 * COPY-NOT: fasen "Inför sista omgången" står redan i kortets rubrik-etikett (en
 * sanning, och senior-devs test pinnar den texten EXAKT 12 gånger = en per grupp).
 * Body-copyn upprepar därför INTE den frasen, utan utvecklar vad som väntar, så
 * etikett-räkningen hålls intakt och budskapet inte dubbelt.
 */
function TooEarlyBody() {
  return (
    <div className="vm-scenario-tooearly flex-1">
      <span aria-hidden="true" className="vm-scenario-tooearly-icon" />
      {/* max-w-[16rem] men ALDRIG bredare än kortet (min-w-0 + w-full-cap), så den
          smalaste skärmen (280px vikbar cover) inte tvingas bredare än viewporten:
          en fast max-w utan w-full-tak sätter grid-kolumnens MIN-bredd till textens
          och spränger kortet. Verifierat 280px: noll horisontell overflow. */}
      <p className="w-full max-w-[16rem] text-xs leading-relaxed text-fg-muted">
        När färre matcher återstår visar vi exakt vad varje lag behöver för att gå vidare.
      </p>
    </div>
  );
}

export function ScenarioView() {
  // Läser den DELADE results-storen via useGroupScenarios (samma store som
  // gruppspel + inmatning). Måste renderas inuti en ResultsProvider.
  const { status, scenarios, teams, mode, error } = useGroupScenarios();
  const teamsById = useMemo(() => indexTeams(teams), [teams]);

  return (
    <section aria-labelledby="vad-kravs-rubrik" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="vad-kravs-rubrik" className="font-display text-xl font-semibold sm:text-2xl">
            Vad krävs
          </h2>
          {mode === 'fixtures' ? <span className="vm-demo-chip">Demo-data</span> : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Vad varje lag behöver för att gå vidare, utifrån nuvarande tabelläge och återstående
          matcher. "Klar" och "Ute" påstås bara när resultaten garanterar det, allt målskillnads-
          eller trea-beroende visas ärligt som "Beror på".
        </p>
      </header>

      {/* KOMPRIMERING (T68/#129): rubrik + beskrivning alltid synliga; här under
          komprimeras grid:en så FÖRSTA RADEN grupper syns som default (höjd-klipp,
          responsivt antal per skärmbredd). Faden tonar mot app-bakgrunden (ingen
          surface-Panel runt denna sektion). ~20rem visar ett helt scenario-kort + en
          fade-veiled glimt av nästa rad, samma kort-höjd-mått som gruppspelet, så
          klippet inte skär mitt i ett kort. */}
      <CollapsibleBody
        name="scenarios"
        toggleLabels={{ expand: 'Visa alla grupper', collapse: 'Visa färre grupper' }}
        collapsedMaxHeight="20rem"
        fadeTo="var(--color-bg)"
      >
        {status === 'loading' ? (
          <p role="status" className="text-sm text-fg-muted">
            Laddar scenarierna ...
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
              <span>Kunde inte ladda scenarierna: {error}</span>
            </p>
          </Fade>
        ) : null}

        {status === 'ready' && scenarios.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
            Inga grupper att visa än.
          </p>
        ) : null}

        {status === 'ready' && scenarios.length > 0 ? (
          // grid-cols-1 vid bas är AVGÖRANDE: utan en explicit single-kolumn flödar
          // korten i en implicit `auto`-kolumn (= max-content av bredaste kortet), som
          // på 280px (vikbar cover) blir bredare än viewporten och klipps av appens
          // overflow-x-clip. minmax(0,1fr) (= grid-cols-1) låter kolumnen krympa till
          // viewporten så villkorstext + chips ryms. Verifierat 280px: noll overflow.
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {scenarios.map((scenario, i) => (
              <GroupScenarioCard
                key={scenario.groupId}
                scenario={scenario}
                teamsById={teamsById}
                index={i}
              />
            ))}
          </div>
        ) : null}
      </CollapsibleBody>
    </section>
  );
}
