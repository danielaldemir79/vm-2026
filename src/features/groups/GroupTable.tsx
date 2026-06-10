// En tillgänglig grupptabell för EN grupp (semantisk HTML + premium-visuell design, T5).
//
// FOKUS (senior-devs lager, OFÖRÄNDRAT): KORREKT, TILLGÄNGLIG tabell-semantik.
// Riktig <table> med <caption>, en kolumn-header-rad (<th scope="col">) och
// lagnamnet som rad-header (<th scope="row">), så en skärmläsare läser "Mexiko,
// spelade 3, vunna 2 ..." i stället för lösryckta siffror. Kolumnerna följer
// GroupStanding (SPEC §6): Placering, Lag, S (spelade), V, O, F, GM, IM, MS, P.
// Förkortningarna får title-attribut + en synlig teckenförklaring i vyn
// (GroupStageView). computeStandings har redan sorterat raderna och satt rank.
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå strukturen): den
// "arena i kvällsljus"-premiumkänslan. Den lyfter utan att röra a11y-semantiken:
//   - Kvalificeringszonen (etta + tvåa) markeras FÄRG-OBEROENDE: en placerings-
//     medalj (rank-disc), en vänsterställd accent-list, en diskret upphöjd
//     yt-ton och en "går vidare"-avdelare efter tvåan. Detta är medvetet (T7-pin):
//     i ljust tema är accent === success (samma skogsgrön), så zonen får ALDRIG
//     bara luta sig mot en accent/success-färg. Form + medalj + list + typografi
//     bär den, så den läses även när färgerna sammanfaller, och T7 kan sen ge
//     success en egen ton utan att bryta designen.
//   - Inga råa hex: allt går via semantiska tokens (color-mix mot --color-*).

import type { CSSProperties } from 'react';
import type { GroupStanding, GroupId, Team } from '../../domain/types';
import { TeamNameButton } from '../team-profile';

/** Hur många lag som går vidare DIREKT från gruppen (etta + tvåa, SPEC §5). */
const DIRECT_ADVANCE_RANK = 2;

interface ColumnDef {
  /** Kort kolumn-etikett (synlig). */
  label: string;
  /** Full betydelse, blir <th title> + teckenförklaring (a11y, ej kryptiskt). */
  title: string;
  /** Plocka ut cellvärdet ur en standings-rad. */
  value: (row: GroupStanding) => number;
  /**
   * Visuell vikt. Poäng + målskillnad är de avgörande talen och hålls starka;
   * gjorda/insläppta mål är stödsiffror och dämpas (visuell komprimering, SPEC
   * §7), så ögat läser tabellen i rätt ordning utan att en kolumn tas bort
   * (a11y: alla 8 statistik-kolumner är alltid kvar i DOM).
   */
  emphasis?: 'strong' | 'muted';
}

// Sifferkolumnerna i FIFA-tabellordning. Lag + placering hanteras separat (de är
// rad-header respektive en egen ledande cell), resten är numeriska data-celler.
const NUMERIC_COLUMNS: readonly ColumnDef[] = [
  { label: 'S', title: 'Spelade matcher', value: (r) => r.played },
  { label: 'V', title: 'Vunna', value: (r) => r.won },
  { label: 'O', title: 'Oavgjorda', value: (r) => r.drawn },
  { label: 'F', title: 'Förlorade', value: (r) => r.lost },
  { label: 'GM', title: 'Gjorda mål', value: (r) => r.goalsFor, emphasis: 'muted' },
  { label: 'IM', title: 'Insläppta mål', value: (r) => r.goalsAgainst, emphasis: 'muted' },
  { label: 'MS', title: 'Målskillnad', value: (r) => r.goalDifference, emphasis: 'strong' },
  { label: 'P', title: 'Poäng', value: (r) => r.points, emphasis: 'strong' },
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
 * Färg-OBEROENDE placerings-medalj för rank-cellen. Etta = guld-medalj
 * (--vm-gold), tvåa = upphöjd silver-medalj, trea/fyra = neutral. Medaljen är en
 * av flera signaler för kvalificeringszonen (se fil-headern, T7-pin), inte den
 * enda. Värdena kommer ur color-mix mot semantiska tokens, inte råa hex.
 *
 * KONTRAST (WCAG): siffran i medaljen håller alltid full fg-kontrast (--color-fg
 * mot ytan), guld-/silver-tonen lever i medaljens BAKGRUND + KANT. Så placeringen
 * läses skarpt i båda teman utan att luta sig mot en låg guld-på-guld-kontrast.
 */
function rankDiscStyle(rank: number): CSSProperties {
  if (rank === 1) {
    return {
      backgroundColor: 'color-mix(in srgb, var(--vm-gold) 24%, transparent)',
      color: 'var(--color-fg)',
      borderColor: 'color-mix(in srgb, var(--vm-gold) 60%, transparent)',
    };
  }
  if (rank === DIRECT_ADVANCE_RANK) {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-fg) 12%, transparent)',
      color: 'var(--color-fg)',
      borderColor: 'color-mix(in srgb, var(--color-fg) 30%, transparent)',
    };
  }
  return {
    backgroundColor: 'transparent',
    color: 'var(--color-fg-muted)',
    borderColor: 'transparent',
  };
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
      <caption className="sr-only">Grupp {groupId}</caption>
      <thead>
        <tr className="text-[0.6875rem] uppercase tracking-wide text-fg-muted">
          <th
            scope="col"
            className="w-7 px-0.5 pb-2 text-center font-semibold"
            title="Placering i gruppen"
          >
            #
          </th>
          <th scope="col" className="px-1.5 pb-2 font-semibold">
            Lag
          </th>
          {NUMERIC_COLUMNS.map((col) => (
            <th
              key={col.label}
              scope="col"
              className={`w-7 px-0.5 pb-2 text-right font-semibold tabular-nums ${
                col.emphasis === 'muted' ? 'opacity-70' : ''
              }`}
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
          // De direkt kvalificerade (etta + tvåa) markeras FÄRG-OBEROENDE
          // (se fil-headern, T7-pin): data-qualified-haken finns kvar för
          // styling/test, men den VISUELLA framhävningen bärs av medalj +
          // vänster-list + upphöjd yta + "går vidare"-avdelare, inte en
          // accent/success-färg (som krockar i ljust tema). a11y: oförändrad
          // sr-only-text "(kvalificerad till slutspel)".
          const qualified = row.rank <= DIRECT_ADVANCE_RANK;
          // Sista kvalificerade raden får en tydligare under-avdelare ("snittet"
          // där gruppen delas i går-vidare vs utslagen).
          const isCutoffRow = row.rank === DIRECT_ADVANCE_RANK;
          return (
            <tr
              key={row.teamId}
              className={`group/row border-b border-border/50 transition-colors last:border-b-0 ${
                isCutoffRow ? 'border-b-2 border-b-border' : ''
              }`}
              data-qualified={qualified ? 'true' : undefined}
              // Upphöjd yt-ton + vänster accent-list bara på kvalificerade rader.
              // color-mix mot tokens, så det följer temat och inte är rå hex.
              style={
                qualified
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
                      boxShadow: 'inset 3px 0 0 0 var(--color-accent)',
                    }
                  : undefined
              }
            >
              <td className="px-0.5 py-2 text-center align-middle">
                <span
                  className="inline-flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-pill border text-[0.6875rem] font-bold tabular-nums"
                  style={rankDiscStyle(row.rank)}
                >
                  {row.rank}
                </span>
              </td>
              <th scope="row" className="px-1.5 py-2 align-middle font-medium">
                {/* min-w-0 låter namnet truncas i stället för att tvinga ut tabellen
                    i sidled; kod-chippet (aria-hidden, FIFA-landskod) krymper aldrig.
                    Lagnamnet är en KLICKBAR knapp som öppnar lagprofilen (T10): ett
                    grupplag är alltid känt (teamId aldrig null), så knappen visas alltid. */}
                <span className="flex min-w-0 items-center gap-1.5">
                  <TeamNameButton teamId={row.teamId} name={name} className="min-w-0 truncate" />
                  <span
                    className="shrink-0 rounded-sm px-1 py-0.5 font-display text-[0.625rem] font-semibold tracking-wider text-fg-muted"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-fg) 8%, transparent)',
                    }}
                    aria-hidden="true"
                  >
                    {code}
                  </span>
                </span>
                {qualified ? <span className="sr-only"> (kvalificerad till slutspel)</span> : null}
              </th>
              {NUMERIC_COLUMNS.map((col) => (
                <td
                  key={col.label}
                  className={`px-0.5 py-2 text-right align-middle tabular-nums ${
                    col.emphasis === 'strong'
                      ? 'font-semibold text-fg'
                      : col.emphasis === 'muted'
                        ? 'text-fg-muted'
                        : ''
                  }`}
                >
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
