// Den SIMULERADE slutspels-vyn ur grupp-tipsen (T51, #88).
//
// DANIELS ÖNSKAN: efter att ha tippat grupperna vill han SE hur sextondelen
// (och vägen mot finalen) blir UR TIPSEN, "vilka som möter varandra". Denna vy
// renderar deriveTipsBracket-bilden som ett träd, med EXAKT samma layout-hakar
// som det riktiga slutspelsträdet (BracketView) så design-frontends premium-
// bracket-CSS (bracket.css) gäller utan dubblering.
//
// HARD ÄRLIGHET (gissa aldrig + tydlig märkning, AC i #88):
//   - Vyn är TYDLIGT märkt som en SIMULERING ur tipsen, inte facit/riktiga
//     resultat (rubrik + förklarande not + ett "Simulering"-märke).
//   - Bästa-trea-slots visas ÖPPNA ("3:a A/B/C/D/F, avgörs av riktiga resultat"),
//     aldrig med ett gissat lag.
//   - Åttondel och framåt visas strukturellt ("Vinnare M73"), eftersom tipsen
//     inte säger vem som vinner en match.
//   Inga skrivningar: vyn är en ren konsument av tipsen, de riktiga resultaten rörs ej.
//
// SEMANTIK + a11y FÖRST (senior-devs lager): section + rubrik, en lista per runda,
// varje slot en list-rad med läsbar etikett. Stabila data-attribut (data-bracket-
// round/-match/-slot, data-tips-slot-resolution) som design-frontend bygger
// premium ovanpå. Den horisontella kolumn-layouten tål mobil (overflow-x-auto).

import { useMemo, type ReactNode } from 'react';
import type { Team } from '../../domain/types';
import { teamDisplayName } from '../daily/match-display';
import { ROUND_LABELS, ROUND_ORDER } from '../bracket/derive-bracket';
// Återanvänder det riktiga slutspelsträdets premium-CSS-hakar (bracket.css):
// samma kolumn-/kort-/slot-klasser, så simuleringen ser ut som "appens slutspel".
import '../bracket/bracket.css';
import { useTipsBracketData, type TipsBracketData } from './use-tips-bracket-data';
import type { TipsMatchState, TipsSlotState } from './derive-tips-bracket';

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

/**
 * Visnings-texten för en slot:
 *   - 'tipped': det tippade lagets namn (i id-rymden, slås upp i lag-listan).
 *   - 'open-third'/'tbd': positions-/struktur-etiketten ("3:a A/B/C/D/F",
 *     "Vinnare M73", "1:a grupp A"), så man ser VAR laget kommer ifrån.
 */
function slotText(slot: TipsSlotState, teamsById: ReadonlyMap<string, Team>): string {
  if (slot.resolution === 'tipped' && slot.teamId !== null) {
    return teamDisplayName(slot.teamId, teamsById);
  }
  return slot.label;
}

/**
 * En slot-rad i en simulerad slutspelsmatch. data-tips-slot-resolution
 * (tipped | open-third | tbd) är design-seamen: en tippad rad kan lyftas, en
 * öppen trea tonas som "platshållare". Vi återanvänder .vm-bracket-slot för bas-
 * stilen men bär ett TIPS-eget resolution-attribut (inte data-slot-resolution,
 * som det riktiga trädets vinnar-/möjliga-stil hänger på) så de inte krockar.
 */
function TipsSlotRow({
  slot,
  teamsById,
}: {
  slot: TipsSlotState;
  teamsById: ReadonlyMap<string, Team>;
}) {
  const text = slotText(slot, teamsById);
  const isTipped = slot.resolution === 'tipped';
  return (
    <li
      data-bracket-slot=""
      data-tips-slot-resolution={slot.resolution}
      className="vm-bracket-slot flex items-center justify-between gap-2 px-2.5 py-1.5"
    >
      <span className="min-w-0 truncate text-[0.8125rem] leading-tight" title={text}>
        <span
          className={`vm-bracket-slot-name ${isTipped ? 'font-semibold text-fg' : 'text-fg-muted'}`}
        >
          {text}
        </span>
      </span>
      {/* En öppen bästa-trea-plats märks tydligt som "öppen" (avgörs av riktiga
          resultat), så det aldrig läses som ett gissat lag. */}
      {slot.resolution === 'open-third' ? (
        <span
          data-tips-open-third=""
          className="vm-tips-open-badge shrink-0 rounded-pill border px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-fg-muted"
        >
          Öppen
        </span>
      ) : null}
    </li>
  );
}

/** Ett simulerat match-kort: dess två slots (hemma/borta), med matchnummer. */
function TipsMatchCard({
  match,
  teamsById,
}: {
  match: TipsMatchState;
  teamsById: ReadonlyMap<string, Team>;
}) {
  return (
    <article
      data-bracket-match={match.matchId}
      className="vm-bracket-match overflow-hidden rounded-card border border-border bg-surface shadow-[var(--vm-shadow-card)]"
    >
      <p
        aria-hidden="true"
        className="border-b border-border/60 px-2.5 py-1 font-display text-[0.625rem] font-semibold uppercase tracking-wide text-fg-muted"
      >
        {match.matchId}
      </p>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        <TipsSlotRow slot={match.home} teamsById={teamsById} />
        <TipsSlotRow slot={match.away} teamsById={teamsById} />
      </ul>
    </article>
  );
}

/** Grammatiskt korrekt antals-text för skärmläsaren ("1 match" / "16 matcher"). */
function matchCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'match' : 'matcher'}`;
}

/**
 * Runda-markörens innehåll: ett ordningstal (sextondel = 1 ... semifinal = 4) som
 * låter ögat följa progressionen mot finalen, en "3" för bronsmatchen, och en pokal-
 * glyf för finalen (slutet). Samma redaktionella språk som det riktiga trädet
 * (BracketView) och slutspels-tipset (BracketPredictionsView), så sim-trädet hör
 * tydligt till samma slutspels-värld. Ren dekoration (markören är aria-hidden).
 */
const ROUND_STEP: Readonly<Record<string, string>> = {
  'round-of-32': '1',
  'round-of-16': '2',
  'quarter-final': '3',
  'semi-final': '4',
  'third-place': '3',
};

function RoundMarkerGlyph({ stage }: { stage: string }) {
  if (stage === 'final') {
    // Pokal-glyf (finalen är trädets krona), samma form som slutspels-tipsets markör.
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
        <path d="M7 5H4.5a1.5 1.5 0 0 0 0 5H7M17 5h2.5a1.5 1.5 0 0 1 0 5H17" />
        <path d="M12 13v3M9 20h6M9.5 20a2.5 2.5 0 0 1 5 0" />
      </svg>
    );
  }
  return <span className="leading-none">{ROUND_STEP[stage] ?? ''}</span>;
}

/** En runda som en KOLUMN av match-kort, med rubrik (samma layout som BracketView). */
function RoundColumn({
  label,
  matchCount,
  stage,
  children,
}: {
  label: string;
  matchCount: number;
  stage: string;
  children: ReactNode;
}) {
  const isCrown = stage === 'final';
  return (
    <section
      data-bracket-round={stage}
      aria-label={`${label} (${matchCountLabel(matchCount)})`}
      className="vm-bracket-round flex w-60 shrink-0 flex-col gap-3"
    >
      {/* Rubrik-rad: en numrerad/ikon-markör (progression mot finalen) + runda-namnet.
          Finalen lyfts till full fg (krona), övriga rundor är dämpade. */}
      <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide">
        <span aria-hidden="true" data-round={stage} className="vm-tips-bracket-marker">
          <RoundMarkerGlyph stage={stage} />
        </span>
        <span className={isCrown ? 'text-fg' : 'text-fg-muted'}>{label}</span>
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** En runda med sina matcher (för kolumn-per-runda-rendering). */
interface TipsRound {
  stage: TipsMatchState['stage'];
  label: string;
  matches: TipsMatchState[];
}

/**
 * Dela upp den tips-härledda bilden i rundor i officiell progressions-ordning.
 * Återanvänder ROUND_ORDER + ROUND_LABELS (en sanning, derive-bracket.ts), så
 * simuleringen och det riktiga trädet ALLTID har samma rund-ordning/-namn (DRY).
 */
function groupTipsByRound(matches: readonly TipsMatchState[]): TipsRound[] {
  const byStage = new Map<TipsMatchState['stage'], TipsMatchState[]>();
  for (const match of matches) {
    const bucket = byStage.get(match.stage);
    if (bucket) {
      bucket.push(match);
    } else {
      byStage.set(match.stage, [match]);
    }
  }
  const rounds: TipsRound[] = [];
  for (const stage of ROUND_ORDER) {
    const inStage = byStage.get(stage);
    if (inStage && inStage.length > 0) {
      rounds.push({ stage, label: ROUND_LABELS[stage], matches: inStage });
    }
  }
  return rounds;
}

export interface TipsBracketViewProps {
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar data (testbarhet/Storybook), default = den riktiga hooken. */
  data?: TipsBracketData;
}

/**
 * Den simulerade slutspels-vyn (CONNECTED). Renderas inuti grupp-tips-providern.
 *
 * Är `data` injicerat (test/Storybook) renderar vi DIREKT den rena presentationen
 * UTAN att anropa hooken, så testet inte behöver hela provider-/Supabase-kedjan
 * (hooken fail-loud:ar utan provider). Annars kopplar vi upp hooken. Uppdelningen
 * undviker villkorliga hook-anrop (Rules of Hooks): varje gren har en stabil
 * hook-uppsättning, eftersom de är SKILDA komponenter.
 */
export function TipsBracketView({ env, data }: TipsBracketViewProps) {
  if (data) {
    return <TipsBracketPresentation data={data} />;
  }
  return <ConnectedTipsBracketView env={env} />;
}

/** Kopplar hooken (live-data) och delegerar till presentationen. */
function ConnectedTipsBracketView({ env = import.meta.env }: { env?: ImportMetaEnv }) {
  const data = useTipsBracketData(env);
  return <TipsBracketPresentation data={data} />;
}

/** Ren presentation av den tips-härledda bilden (ingen hook, helt injicerad). */
function TipsBracketPresentation({ data }: { data: TipsBracketData }) {
  const { bracket } = data;

  const teamsById = useMemo(() => indexTeams(data.teams), [data.teams]);
  const rounds = useMemo(() => (bracket ? groupTipsByRound(bracket.matches) : []), [bracket]);

  const tippedGroupCount = bracket?.tippedGroupCount ?? 0;

  // Inget tippat än: visa en lugn uppmaning i stället för ett tomt skelett-träd.
  if (tippedGroupCount === 0) {
    return (
      <section
        aria-labelledby="tips-bracket-heading"
        data-tips-bracket-empty=""
        className="flex flex-col gap-3"
      >
        <Header tippedGroupCount={0} />
        <p className="rounded-card border border-border bg-surface px-4 py-6 text-center text-sm text-fg-muted">
          Tippa minst en grupp ovanför, så ritar vi upp hur slutspelet skulle kunna se ut ur dina
          tips.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="tips-bracket-heading" className="flex flex-col gap-4">
      <Header tippedGroupCount={tippedGroupCount} />

      <div className="vm-bracket flex flex-col gap-2">
        <p
          aria-hidden="true"
          className="vm-bracket-hint self-end text-[0.6875rem] font-medium uppercase tracking-wide text-fg-muted"
        >
          Svep i sidled
          <span className="vm-bracket-hint-arrow" aria-hidden="true">
            →
          </span>
        </p>
        <div data-bracket-scroll="" className="vm-bracket-scroll -mx-1 overflow-x-auto px-1 pb-2">
          <div className="flex min-w-max gap-5">
            {rounds.map((round) => (
              <RoundColumn
                key={round.stage}
                stage={round.stage}
                label={round.label}
                matchCount={round.matches.length}
              >
                {round.matches.map((match) => (
                  <TipsMatchCard key={match.matchId} match={match} teamsById={teamsById} />
                ))}
              </RoundColumn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Vy-rubriken: bär den HARD-märkningen att detta är en SIMULERING ur tipsen, inte
 * riktiga resultat eller facit (AC i #88), + en kort ärlig förklaring av hur
 * treorna och vägen vidare hanteras (så ingen tror att en öppen plats är ett fel).
 */
function Header({ tippedGroupCount }: { tippedGroupCount: number }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="tips-bracket-heading" className="font-display text-lg font-semibold sm:text-xl">
          Slutspelet ur dina tips
        </h3>
        {/* Tydligt simulerings-märke: detta är INTE facit. SOLID guld-bricka med mörk
            ink (.vm-tips-sim-badge), den färg-OBEROENDE AA-säkra formen, samma
            hejarklacks-guld som kupong-/slutspels-tips-världen men lugn, inte
            alarmistisk (guld-som-text-på-tint föll under AA, uppmätt 2.51:1 ljust). */}
        <span
          data-tips-bracket-badge=""
          className="vm-tips-sim-badge inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
        >
          <span aria-hidden="true" className="inline-flex">
            {/* En liten "labb/utkast"-kolv-glyf, samma hypotetisk-signal som what-if-
                läget, men i kupong-guld. Ren dekor; texten bär betydelsen. */}
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 3h6M10 3v6.5L5.5 18a1.5 1.5 0 0 0 1.3 2.3h10.4a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3" />
              <path d="M7.5 14h9" />
            </svg>
          </span>
          Simulering
        </span>
        {tippedGroupCount < 12 ? (
          <span
            role="status"
            className="rounded-pill border border-border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-fg-muted"
          >
            {tippedGroupCount} av 12 grupper tippade
          </span>
        ) : null}
      </div>
      <p className="max-w-2xl text-sm text-fg-muted">
        En simulering ur dina grupp-tips, inte riktiga resultat. Vi placerar dina tippade ettor och
        tvåor i sextondelsfinalen så du ser vilka som möts. De åtta bästa treorna avgörs av de
        verkliga resultaten (FIFA-seedning), så de platserna står öppna. Vem som sen går vidare mot
        finalen beror på matcherna, det visas som strukturen (Vinnare M73 och så vidare).
      </p>
    </header>
  );
}
