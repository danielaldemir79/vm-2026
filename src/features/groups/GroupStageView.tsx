// Gruppspelsvyn: alla 12 grupper (A-L) med live-tabeller (T5, issue #5).
//
// Ansvar: ladda data via useGroupData och rendera en GroupTable per grupp, plus
// hantera ICKE-happy-path: laddning, fel (fail loud) och tom data. Tabellerna är
// LIVE, useGroupData härleder dem reaktivt ur matchstate (en resultatinmatning i
// T6 räknar om dem). Resultat-INMATNINGEN är T6, inte här, vyn visar den härledda
// tabellen.
//
// STYLING är minimal/strukturell (token-klasser, semantisk struktur). Den
// premium-visuella designen (kort-layout, responsivt rutnät, framhävd
// kvalificeringszon, rörelse) ägs av design-frontend-agenten som kör efter T5.
// Strukturen är gjord lätt att styla: ett <section> per grupp med stabil
// semantik och data-attribut.

import { useMemo } from 'react';
import type { Team } from '../../domain/types';
import { useGroupData } from './use-group-data';
import { GroupTable } from './GroupTable';

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

export interface GroupStageViewProps {
  /** Injicerbar miljö (testbarhet), default = den riktiga via useGroupData. */
  env?: ImportMetaEnv;
}

export function GroupStageView({ env }: GroupStageViewProps) {
  const { status, tables, teams, mode, error } = useGroupData(env);
  const teamsById = useMemo(() => indexTeams(teams), [teams]);

  return (
    <section aria-labelledby="gruppspel-rubrik" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 id="gruppspel-rubrik" className="font-display text-2xl font-bold sm:text-3xl">
          Gruppspelet
        </h2>
        <p className="text-sm text-fg-muted">
          De 12 grupperna A till L. Tabellerna räknas om automatiskt när resultat ändras, etta och
          tvåa går vidare direkt.
          {mode === 'fixtures' ? ' Visar demo-data tills den riktiga matchplanen kopplas in.' : ''}
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
      </header>

      {status === 'loading' ? (
        // role="status" så skärmläsare annonserar laddningen (aria-live: polite).
        <p role="status" className="text-sm text-fg-muted">
          Laddar gruppspelet ...
        </p>
      ) : null}

      {status === 'error' ? (
        // role="alert" så felet annonseras direkt (fail loud, inte tyst tom vy).
        <p role="alert" className="rounded-md border border-danger px-4 py-3 text-sm text-danger">
          Kunde inte ladda gruppspelet: {error}
        </p>
      ) : null}

      {status === 'ready' && tables.length === 0 ? (
        <p className="text-sm text-fg-muted">Inga grupper att visa än.</p>
      ) : null}

      {status === 'ready' && tables.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <div
              key={table.groupId}
              className="overflow-x-auto rounded-card border border-border bg-surface p-4"
            >
              <GroupTable
                groupId={table.groupId}
                standings={table.standings}
                teamsById={teamsById}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
