// En tillgänglig grupptabell för EN grupp (semantisk HTML, T5).
//
// FOKUS (senior-devs lager): KORREKT, TILLGÄNGLIG tabell-semantik. Riktig
// <table> med <caption>, en kolumn-header-rad (<th scope="col">) och lagnamnet
// som rad-header (<th scope="row">), så en skärmläsare läser "Mexiko, spelade 3,
// vunna 2 ..." i stället för lösryckta siffror. Kolumnerna följer GroupStanding
// (SPEC §6): Placering, Lag, S (spelade), V, O, F, GM, IM, MS, P. Förkortningarna
// får title-attribut + en synlig teckenförklaring i vyn (GroupStageView), så de
// inte är kryptiska. computeStandings har redan sorterat raderna och satt rank.
//
// STYLING är medvetet MINIMAL/STRUKTURELL (token-klasser, inga råa hex). Den
// premium-visuella designen (layout-finess, responsiv polish, rörelse, framhävd
// kvalificeringszon) ägs av design-frontend-agenten som kör EFTER denna task.
// Strukturen är gjord lätt att styla: tydlig semantik + stabila data-attribut
// (data-qualified) så design kan haka på utan att bygga om markupen.

import type { GroupStanding, GroupId, Team } from '../../domain/types';

/** Hur många lag som går vidare DIREKT från gruppen (etta + tvåa, SPEC §5). */
const DIRECT_ADVANCE_RANK = 2;

interface ColumnDef {
  /** Kort kolumn-etikett (synlig). */
  label: string;
  /** Full betydelse, blir <th title> + teckenförklaring (a11y, ej kryptiskt). */
  title: string;
  /** Plocka ut cellvärdet ur en standings-rad. */
  value: (row: GroupStanding) => number;
}

// Sifferkolumnerna i FIFA-tabellordning. Lag + placering hanteras separat (de är
// rad-header respektive en egen ledande cell), resten är numeriska data-celler.
const NUMERIC_COLUMNS: readonly ColumnDef[] = [
  { label: 'S', title: 'Spelade matcher', value: (r) => r.played },
  { label: 'V', title: 'Vunna', value: (r) => r.won },
  { label: 'O', title: 'Oavgjorda', value: (r) => r.drawn },
  { label: 'F', title: 'Förlorade', value: (r) => r.lost },
  { label: 'GM', title: 'Gjorda mål', value: (r) => r.goalsFor },
  { label: 'IM', title: 'Insläppta mål', value: (r) => r.goalsAgainst },
  { label: 'MS', title: 'Målskillnad', value: (r) => r.goalDifference },
  { label: 'P', title: 'Poäng', value: (r) => r.points },
];

export interface GroupTableProps {
  groupId: GroupId;
  standings: readonly GroupStanding[];
  /** Lag-uppslag (teamId -> Team) för namn + landskod. */
  teamsById: ReadonlyMap<string, Team>;
}

/** Visa ett lag med namn (+ landskod som diskret komplement). Fail-safe vid okänt id. */
function teamLabel(
  teamId: string,
  teamsById: ReadonlyMap<string, Team>
): {
  name: string;
  code: string;
} {
  const team = teamsById.get(teamId);
  // Saknas laget i uppslaget är det en data-inkonsistens; visa id:t synligt i
  // stället för att tyst dölja det (fail loud light), så felet märks i UI:t.
  return { name: team?.name ?? teamId, code: team?.code ?? '???' };
}

/**
 * En grupptabell. Ren presentation: tar färdigsorterade standings (rank ifylld
 * av computeStandings) och renderar dem tillgängligt. Ingen beräkning här, en
 * sanning bor i härledningen.
 */
export function GroupTable({ groupId, standings, teamsById }: GroupTableProps) {
  return (
    <table
      className="w-full border-collapse text-left text-sm"
      data-testid={`group-table-${groupId}`}
    >
      <caption className="mb-2 font-display text-base font-bold">Grupp {groupId}</caption>
      <thead>
        <tr className="border-b border-border text-fg-muted">
          <th
            scope="col"
            className="px-2 py-1.5 text-right font-medium"
            title="Placering i gruppen"
          >
            #
          </th>
          <th scope="col" className="px-2 py-1.5 font-medium">
            Lag
          </th>
          {NUMERIC_COLUMNS.map((col) => (
            <th
              key={col.label}
              scope="col"
              className="px-2 py-1.5 text-right font-medium"
              title={col.title}
            >
              <abbr title={col.title} className="no-underline">
                {col.label}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {standings.map((row) => {
          const { name, code } = teamLabel(row.teamId, teamsById);
          // De direkt kvalificerade (etta + tvåa) markeras med ett DATA-attribut,
          // inte en färg. Statusfärger är T7:s domän (i ljust tema krockar accent
          // och success, T7-pinnen), så vi exponerar bara en stabil hake (a11y
          // via aria-label "kvalificerad") och låter design-frontend måla den.
          const qualified = row.rank <= DIRECT_ADVANCE_RANK;
          return (
            <tr
              key={row.teamId}
              className="border-b border-border/60 last:border-b-0"
              data-qualified={qualified ? 'true' : undefined}
            >
              <td className="px-2 py-1.5 text-right tabular-nums text-fg-muted">{row.rank}</td>
              <th scope="row" className="px-2 py-1.5 font-medium">
                <span>{name}</span>{' '}
                <span className="text-xs text-fg-muted" aria-hidden="true">
                  {code}
                </span>
                {qualified ? <span className="sr-only"> (kvalificerad till slutspel)</span> : null}
              </th>
              {NUMERIC_COLUMNS.map((col) => (
                <td key={col.label} className="px-2 py-1.5 text-right tabular-nums">
                  {col.value(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
