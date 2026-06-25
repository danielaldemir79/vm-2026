// Gruppspelsvyn: alla 12 grupper (A-L) med live-tabeller (T5, issue #5).
//
// Ansvar: ladda data via useGroupData och rendera en GroupTable per grupp, plus
// hantera ICKE-happy-path: laddning, fel (fail loud) och tom data. Tabellerna är
// LIVE, useGroupData härleder dem reaktivt ur matchstate (en resultatinmatning i
// T6 räknar om dem). Resultat-INMATNINGEN är T6, inte här, vyn visar den härledda
// tabellen.
//
// VISUELL DESIGN (design-lagret): "arena i kvällsljus"-premium.
// Varje grupp blir ett kort med en stark bokstavs-badge i kort-headern, mjuk
// elevation och ett responsivt rutnät (1 kol mobil -> 2 -> 3 -> 4 ultrawide).
// Korten glider in med en stagger (rörelse-primitiverna, reducerad rörelse
// respekteras). Laddning/fel/tom-tillstånd har en egen premium-ton. All färg
// går via semantiska tokens (inga råa hex).

import { useMemo } from 'react';
import { GROUP_IDS } from '../../domain/types';
import type { GroupTable as GroupTableData, Team } from '../../domain/types';
import { Fade, Slide, transitions } from '../../motion';
import { CollapsibleBody } from '../../components/CollapsibleSection';
import { useResultsStore } from '../results/results-context';
import { useGroupData } from './use-group-data';
import { GroupTable } from './GroupTable';
import { useGroupPredictionResults } from './use-group-prediction-results';
import { GroupPointsBadge, GroupPickSummary } from './GroupPredictionOverlay';
import type { GroupResultEntry } from './derive-group-prediction-results';

/**
 * Teckenförklaring för kolumn-förkortningarna, så de inte är kryptiska (a11y).
 * En sanning: härleds inte ur GroupTable för att hålla komponenterna frikopplade,
 * men håll dessa i synk med NUMERIC_COLUMNS där (få och stabila förkortningar).
 */
const ABBREVIATIONS: ReadonlyArray<{ short: string; long: string }> = [
  { short: 'S', long: 'spelade' },
  { short: 'V', long: 'vunna' },
  { short: 'O', long: 'oavgjorda' },
  { short: 'F', long: 'förlorade' },
  { short: 'GM', long: 'gjorda mål' },
  { short: 'IM', long: 'insläppta mål' },
  { short: 'MS', long: 'målskillnad' },
  { short: 'P', long: 'poäng' },
];

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista, inte per tabell). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

/**
 * Ett grupp-kort: en stark bokstavs-badge i kort-headern + grupptabellen.
 * Hover-lyft och mjuk elevation ger premium-känslan; korten staplar på mobil och
 * fyller rutnätet på stora skärmar. Tabellens a11y-semantik bärs av GroupTable.
 */
function GroupCard({
  table,
  teamsById,
  index,
  result,
}: {
  table: GroupTableData;
  teamsById: ReadonlyMap<string, Team>;
  index: number;
  /** Grupp-tips-resultatet för den inloggades aktiva rum, om gruppen är avgjord
   *  och man tippat på den. Saknas = kortet renderas utan tips-overlay. */
  result?: GroupResultEntry;
}) {
  // Stagger: varje kort glider in en aning efter det förra. Delay-taket håller
  // den sista gruppen från att kännas trög; reducerad rörelse nollar resan i
  // Slide-primitiven (bara opacitet kvar), så detta är a11y-säkert.
  const delay = Math.min(index * 0.04, 0.4);

  return (
    <Slide direction="up" transition={{ ...transitions.smooth, delay }} className="h-full">
      <article className="group/card flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-[var(--vm-shadow-card)] transition-shadow duration-300 hover:shadow-[var(--vm-shadow-raised)]">
        {/* Kort-header: bokstavs-badge + label. Den dekorativa gröna glorian ger
            arena-ljus-känslan, tema-trogen via --vm-glow-accent. */}
        <div
          className="relative flex items-center gap-3 border-b border-border px-4 py-3"
          style={{
            backgroundImage:
              'radial-gradient(120% 140% at 0% 0%, rgb(var(--vm-glow-accent) / 0.12), transparent 60%)',
          }}
        >
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md font-display text-lg font-bold leading-none text-accent-fg shadow-sm"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {table.groupId}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-display text-base font-bold">Grupp {table.groupId}</span>
            <span className="truncate text-[0.6875rem] uppercase tracking-wide text-fg-muted">
              4 lag · 2 vidare
            </span>
          </span>
          {/* Grupp-tips-poäng för avgjord grupp man tippat på (annars inget). */}
          {result ? <GroupPointsBadge points={result.points} /> : null}
        </div>

        {/* Tabellen. Den responsiva kolumn-avslöjningen (GroupTable, T103) håller raden
            inom kort-bredden ner till 360px , poäng-kolumnen P klipps aldrig. overflow-x-auto
            blir bara en sista skyddsnät-rem mot oväntat långa lag-namn (inget göms, P förblir
            synlig utan att skrolla eftersom de breda stöd-kolumnerna fälls bort först). */}
        <div className="overflow-x-auto px-3 py-2">
          <GroupTable
            groupId={table.groupId}
            standings={table.standings}
            teamsById={teamsById}
            predictionMarks={
              result
                ? { winnerCorrect: result.winnerCorrect, runnerUpCorrect: result.runnerUpCorrect }
                : undefined
            }
          />
          {/* "Du tippade"-raden under tabellen för en avgjord grupp man tippat på. */}
          {result ? <GroupPickSummary result={result} teamsById={teamsById} /> : null}
        </div>
      </article>
    </Slide>
  );
}

/**
 * Ett enskilt skelett-kort under laddning. Samma kort-form som de riktiga, så
 * layouten inte hoppar när datan landar (ingen layout-shift, CLS). aria-hidden:
 * skärmläsare får statusbeskedet via role="status"-raden i stället, inte tomma
 * platshållar-block.
 */
function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-[var(--vm-shadow-card)]"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="h-9 w-9 animate-pulse rounded-md bg-border" />
        <span className="h-4 w-24 animate-pulse rounded-pill bg-border" />
      </div>
      <div className="flex flex-col gap-2 px-4 py-4">
        {[0, 1, 2, 3].map((r) => (
          <span key={r} className="h-6 w-full animate-pulse rounded-pill bg-border/70" />
        ))}
      </div>
    </div>
  );
}

export function GroupStageView() {
  // Läser den DELADE results-storen via useGroupData (T6). Miljö-injektionen
  // (fixtures/live) sköts av <ResultsProvider> ovanför i trädet, inte här, så
  // vyn är en ren konsument. Måste därför renderas inuti en ResultsProvider.
  const { status, tables, teams, mode, error } = useGroupData();
  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  // Grupp-tips-resultat per avgjord grupp för det aktiva rummet (tom utan rum/tips,
  // då renderas korten utan overlay). Additiv ovanpå de härledda tabellerna.
  const predictionResults = useGroupPredictionResults(tables);
  // WHAT-IF-GRIND: tabellerna här är SIMULERINGS-påverkade (vyn bor i SimulationFrame).
  // I sim-läge är "avgjord" + placeringar HYPOTETISKA, så vi döljer tips-overlayen,
  // annars skulle poäng-pillen påstå intjänade poäng som inte är verkliga. Riktiga
  // poäng visas igen så fort man avslutar simuleringen.
  const { simulating } = useResultsStore();

  return (
    <section aria-labelledby="gruppspel-rubrik" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="gruppspel-rubrik" className="font-display text-xl font-semibold sm:text-2xl">
            Gruppspelet
          </h2>
          {mode === 'fixtures' ? <span className="vm-demo-chip">Demo-data</span> : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          De 12 grupperna A till L. Tabellerna räknas om automatiskt när resultat ändras, etta och
          tvåa går vidare direkt.
          {mode === 'fixtures'
            ? ' Resultaten är ett smakprov tills den riktiga matchplanen kopplas in.'
            : ''}
        </p>
        {/* Teckenförklaring så förkortningarna i tabellerna inte är kryptiska. */}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          {ABBREVIATIONS.map((a) => (
            <div key={a.short} className="flex gap-1">
              <dt className="font-semibold">{a.short}</dt>
              <dd>{a.long}</dd>
            </div>
          ))}
        </dl>
        {/* Förklaring av kvalificeringszonens visuella markör (färg-oberoende, T7-pin). */}
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1.5 rounded-pill"
            style={{ backgroundColor: 'var(--color-accent)' }}
          />
          Markerade rader (etta och tvåa) går vidare till slutspelet.
        </p>
      </header>

      {/* KOMPRIMERING (T68/#129): rubrik + beskrivning ovan ALLTID synliga, här under
          komprimeras grid:en så FÖRSTA RADEN grupper syns HEL som default (responsivt
          antal: höjd-klipp visar en kort-rad oavsett hur många kort som ryms per rad på
          skärmbredden). Faden tonar mot app-bakgrunden (--color-bg), denna sektion
          ligger inte på en surface-Panel. ~20rem = ett HELT grupp-kort (header + 4
          lag-rader, uppmätt ~15.5rem) + lite av nästa rad som faden veil:ar, så klippet
          aldrig skär mitt i ett kort. Tomma/laddnings-/fel-tillstånd är korta, faden
          stör dem inte. */}
      <CollapsibleBody
        name="groups"
        toggleLabels={{ expand: 'Visa alla 12 grupper', collapse: 'Visa färre grupper' }}
        collapsedMaxHeight="20rem"
        fadeTo="var(--color-bg)"
      >
        {status === 'loading' ? (
          <>
            {/* role="status" så skärmläsare annonserar laddningen (aria-live: polite). */}
            <p role="status" className="text-sm text-fg-muted">
              Laddar gruppspelet ...
            </p>
            {/* Skelett-kort i samma rutnät OCH samma antal som det förväntade
              gruppantalet (GROUP_IDS.length, en sanning ur domänmodellen), så
              ready-läget renderar lika många kort och inget under vyn (typografi-
              panel, footer) skjuts ned när datan landar (ingen layout-shift, CLS).
              Härleds ur GROUP_IDS, aldrig en magisk siffra, så det inte kan glida
              isär från det verkliga gruppantalet. */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {GROUP_IDS.map((groupId) => (
                <SkeletonCard key={groupId} />
              ))}
            </div>
          </>
        ) : null}

        {status === 'error' ? (
          // role="alert" så felet annonseras direkt (fail loud, inte tyst tom vy).
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
              <span>Kunde inte ladda gruppspelet: {error}</span>
            </p>
          </Fade>
        ) : null}

        {status === 'ready' && tables.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
            Inga grupper att visa än.
          </p>
        ) : null}

        {status === 'ready' && tables.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {tables.map((table, i) => (
              <GroupCard
                key={table.groupId}
                table={table}
                teamsById={teamsById}
                index={i}
                result={simulating ? undefined : predictionResults.get(table.groupId)}
              />
            ))}
          </div>
        ) : null}
      </CollapsibleBody>
    </section>
  );
}
