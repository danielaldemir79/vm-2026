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
//
// RESPONSIV TÄTHET (T103): på smala telefoner (ner till 360px) visas en KOMPAKT
// kolumn-uppsättning (#, Lag, S, MS, P) så poäng-kolumnen P aldrig klipps i sidled.
// Fler kolumner (V/O/F vid >=sm, GM/IM vid >=md) avslöjas progressivt när det finns
// plats. Detta är ren VISUELL täthet via media-queries (REVEAL_CLASS); ALLA 10
// kolumn-headers + celler är kvar i DOM:en, så tabell-semantiken/a11y är oförändrad.

import type { CSSProperties } from 'react';
import type { GroupStanding, GroupId, Team } from '../../domain/types';
import { teamShortName } from '../../domain';
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
   * §7), så ögat läser tabellen i rätt ordning utan att en kolumn tas bort.
   */
  emphasis?: 'strong' | 'muted';
  /**
   * RESPONSIV KOLUMN-AVSLÖJNING (T103, Daniels skärmdump: P klipptes på mobil).
   * Tabellen har 8 statistik-kolumner bredvid #/Lag i ett SMALT grupp-kort (1 kol
   * på mobil). På en ~360px-telefon blev raden för bred, kortet skrollade i sidled
   * och den HÖGRA, viktigaste kolumnen , P (poäng) , hamnade utanför kanten.
   *
   * FIX: en KOMPAKT kolumn-uppsättning på de smalaste skärmarna, fler kolumner
   * avslöjas progressivt när det finns plats. `revealAt` styr när cellen visas:
   *   - 'always'  : # / Lag / S / MS / P , standard kompakt fotbollstabell, P
   *                 ryms ALLTID (även på 360px). Avgörande tal (MS, P) + spelade (S).
   *   - 'sm'      : V/O/F , utfall (vunna/oavgjorda/förlorade) när det finns plats.
   *   - 'md'      : GM/IM , stöd-siffror (gjorda/insläppta) sist, bara på breda kort.
   * Detta är KOLUMN-REDUKTION, inte sid-skroll: P kan aldrig skrollas ur vy.
   * I jsdom (testerna) tillämpas inga media-queries, så ALLA 10 kolumn-headers är
   * i DOM:en , a11y/semantiken är oförändrad, bara den VISUELLA tätheten skiljer.
   */
  revealAt: 'always' | 'sm' | 'md';
}

// Sifferkolumnerna i FIFA-tabellordning. Lag + placering hanteras separat (de är
// rad-header respektive en egen ledande cell), resten är numeriska data-celler.
// `revealAt` ger den kompakta mobil-uppsättningen (#, Lag, S, MS, P) + progressiv
// avslöjning, så P (poäng) alltid syns helt , se ColumnDef.revealAt (T103).
const NUMERIC_COLUMNS: readonly ColumnDef[] = [
  { label: 'S', title: 'Spelade matcher', value: (r) => r.played, revealAt: 'always' },
  { label: 'V', title: 'Vunna', value: (r) => r.won, revealAt: 'sm' },
  { label: 'O', title: 'Oavgjorda', value: (r) => r.drawn, revealAt: 'sm' },
  { label: 'F', title: 'Förlorade', value: (r) => r.lost, revealAt: 'sm' },
  { label: 'GM', title: 'Gjorda mål', value: (r) => r.goalsFor, emphasis: 'muted', revealAt: 'md' },
  {
    label: 'IM',
    title: 'Insläppta mål',
    value: (r) => r.goalsAgainst,
    emphasis: 'muted',
    revealAt: 'md',
  },
  {
    label: 'MS',
    title: 'Målskillnad',
    value: (r) => r.goalDifference,
    emphasis: 'strong',
    revealAt: 'always',
  },
  { label: 'P', title: 'Poäng', value: (r) => r.points, emphasis: 'strong', revealAt: 'always' },
];

/**
 * Tailwind-synlighetsklasser per `revealAt`. EN sanning för hur en kolumn döljs/
 * visas, delas av <th> och <td> så header + cell ALLTID följs åt (annars glider
 * de isär och en rubrik pekar på fel kolumn). `table-cell` återställer display
 * vid brytpunkten (vi döljer med `hidden`, som är display:none).
 *   - always: alltid synlig (kompakt mobil-set: #, Lag, S, MS, P).
 *   - sm    : dold < 640px, visas >= sm (V/O/F).
 *   - md    : dold < 768px, visas >= md (GM/IM).
 */
const REVEAL_CLASS: Record<ColumnDef['revealAt'], string> = {
  always: '',
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
};

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
  /** Är laget känt i uppslaget? Falskt = data-inkonsistens, då finns ingen profil. */
  known: boolean;
} {
  const team = teamsById.get(teamId);
  // Grupptabellens lag-kolumn är TRÅNG (8 statistik-kolumner bredvid), så vi visar
  // det KORTA namnet (teamShortName: shortName om satt, annars name), t.ex. "Bosnien"
  // i stället för "Bosnien och Hercegovina" som tryckte ihop kolumnerna (T50). Det
  // fulla namnet står kvar i lagprofilen (TeamProfilePanel) där det finns plats.
  // Saknas laget i uppslaget är det en data-inkonsistens; visa id:t synligt i
  // stället för att tyst dölja det (fail loud light), så felet märks i UI:t.
  return {
    name: team ? teamShortName(team) : teamId,
    code: team?.code ?? '???',
    known: team !== undefined,
  };
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
                REVEAL_CLASS[col.revealAt]
              } ${col.emphasis === 'muted' ? 'opacity-70' : ''}`}
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
          const { name, code, known } = teamLabel(row.teamId, teamsById);
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
                    Lagnamnet är en KLICKBAR knapp som öppnar lagprofilen (T10) BARA när
                    laget är känt i uppslaget. Saknas det (data-inkonsistens, fallback
                    {namn: id, kod: '???'}) skickar vi teamId=null, så TeamNameButton
                    degraderar till ren text: en klickbar knapp för ett okänt lag skulle
                    öppna profilen på ett id som inte finns i teamsById, och modalen
                    (TeamProfilePanel) hittar inget lag -> klicket gör tyst ingenting (C8). */}
                <span className="flex min-w-0 items-center gap-1.5">
                  <TeamNameButton
                    teamId={known ? row.teamId : null}
                    name={name}
                    className="min-w-0 truncate"
                  />
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
                    REVEAL_CLASS[col.revealAt]
                  } ${
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
