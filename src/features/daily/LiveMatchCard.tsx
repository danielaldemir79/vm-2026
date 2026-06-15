// LIVEKORTET: den synliga live-/resultat-panelen som BERIKAR ett matchkort när det
// finns live-data för matchen. Renderas för BÅDE en pågående OCH en avslutad (frusen,
// bläddringsbar) match, faller tillbaka till matchkortets vanliga utseende när live-data
// saknas (komponenten renderas då helt enkelt inte, se MatchCard).
//
// DANIELS DESIGN-SPEC (omdesign, kompakt + enhetlig, exakt följd):
//   - DIREKT SYNLIGT på kortet: ställning + status/klocka (EN gång, överst), målskyttar
//     (skytt på en rad, ASSIST på egen indenterad rad under), och kort (gul/röd). Inget mer.
//   - MÅL: målskytt + lag-tillhörighet (lag-kod-bricka) på en rad; assisten på en EGEN,
//     mindre, indenterad rad under, så raden läses snabbt och hierarkin är tydlig.
//   - KORT (gul/röd): en FÄRGAD kort-ikon (gul = gul, röd = röd) + spelarnamn + lag-bricka.
//     INGEN "gult kort"/"rött kort"-TEXT , färgen bär betydelsen. A11y bevaras: ikonen får
//     en dold (sr-only) "gult kort"/"rött kort" så en skärmläsare ändå hör vilket kort.
//   - RESULTATET visas EN gång (överst). Ingen andra ställnings-visning någonstans.
//   - "VISA MER" i ordning: (a) STATISTIK (hemma vänster | etikett | borta höger,
//     jämförelse-staplar, UTAN kort-räkning , korten syns i förloppet), (b) LAGUPPSTÄLLNING,
//     (c) BYTEN längst ned, under laguppställningen, namnen staplade (in/ut).
//   - AVSLUTAD match: "Slut" + slutställning, fryst, INGEN tickande klocka (klockan via
//     liveClockFor: finished -> "Slut", ticking false).
//   - ENHETLIG struktur: samma sektions-ordning oavsett antal mål/kort/byten , en match med
//     0 händelser och en med 12 ser konsekventa ut (bara olika långa, aldrig "trasiga").
//
// KLOCKA: useLiveClock kör Bit 1:s status-styrda klocka (vattenpaus-säkerheten bor där),
// vi implementerar INGEN egen tid-logik. STATISTIK/EVENTS/LINEUPS formas av det rena
// live-card-model-lagret (par-uppdelning hemma/borta + urval + sortering), inte här.
//
// A11Y: panelen är en region med ett tillgängligt namn som sammanfattar live-läget
// ("Live: <hemma> 1-0 <borta>, 29 minuter spelade"), så en skärmläsare hör läget utan
// att navigera varje rad. "Visa mer" återbrukar den delade ExpandToggle (aria-expanded
// /-controls, fokus, chevron) , samma komprimerings-affordans som hela appen har.
// Klockans pulsande punkt + kortens färg är FÄRG-OBEROENDE förstärkta: status-ordet +
// minuten + namnen + den dolda kort-etiketten bär betydelsen, färgen är bara en cue.

import { useId, useMemo, useState } from 'react';
import type { LiveData, LiveLineup } from '../../data/livescore';
import { ExpandToggle } from '../../components/ExpandToggle';
import { useLiveClock } from './use-live-clock';
import {
  buildStatRows,
  formatEventMinute,
  pairLineups,
  selectCards,
  selectGoals,
  selectSubs,
  type CardEntry,
  type GoalEntry,
  type MatchSide,
  type StatRow,
  type SubEntry,
} from './live-card-model';
import './live-card.css';

export interface LiveMatchCardProps {
  /** Den projicerade live-raden (status/ställning/events/statistik/laguppställningar). */
  data: LiveData;
  /** Hemmalagets visningsnamn (appens, så live-panelen talar samma namn som kortet). */
  homeName: string;
  /** Bortalagets visningsnamn. */
  awayName: string;
  /**
   * Hemmalagets API-Football-id (härlett ur appens hemmalag via bryggan), för att para
   * events/statistik/laguppställningar till rätt SIDA. null -> positions-fallback i
   * model-lagret (block 0 = hemma), så kortet renderas även när id:t inte kan härledas.
   */
  homeApiId: number | null;
  /**
   * Hemmalagets FIFA-landskod (t.ex. "NED"), för lag-tillhörighets-brickan på mål/kort.
   * null -> ingen kod-bricka för hemma (en initial-fallback ur namnet används i stället).
   */
  homeCode?: string | null;
  /** Bortalagets FIFA-landskod. null -> initial-fallback ur bortanamnet. */
  awayCode?: string | null;
  /** Nuet (epoch-ms), injiceras för test. Default Date.now() i appen (klockan tickar). */
  now?: number;
}

/** Är status ett pågående live-läge (driver LIVE-indikatorn)? */
function isLiveStatus(status: LiveData['status']): boolean {
  return status === 'live' || status === 'paused';
}

/**
 * En kompakt lag-tillhörighets-etikett för en händelse-rad: lagets FIFA-kod om den finns
 * (t.ex. "NED"), annars de tre första bokstäverna ur visningsnamnet (versalt). Så ett mål
 * eller kort ALLTID bär synlig lag-tillhörighet utan att gissa, även när koden saknas.
 */
function teamTagText(code: string | null, name: string): string {
  if (code !== null && code.length > 0) {
    return code.toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
}

export function LiveMatchCard({
  data,
  homeName,
  awayName,
  homeApiId,
  homeCode = null,
  awayCode = null,
  now,
}: LiveMatchCardProps) {
  const clock = useLiveClock(data, now);
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();

  // Rena härledningar ur model-lagret (memoiserade per data/id, inte per render).
  const goals = useMemo(() => selectGoals(data.events, homeApiId), [data.events, homeApiId]);
  const cards = useMemo(() => selectCards(data.events, homeApiId), [data.events, homeApiId]);
  const subs = useMemo(() => selectSubs(data.events, homeApiId), [data.events, homeApiId]);
  const statRows = useMemo(
    () => buildStatRows(data.statistics, homeApiId),
    [data.statistics, homeApiId]
  );
  const lineups = useMemo(() => pairLineups(data.lineups, homeApiId), [data.lineups, homeApiId]);

  const live = isLiveStatus(data.status);
  const finished = data.status === 'finished';
  const homeGoals = data.homeGoals ?? 0;
  const awayGoals = data.awayGoals ?? 0;

  // Lag-tillhörighets-etikett per sida (kod om känd, annars initialer ur namnet). EN
  // sanning, vidare till mål- och kort-raderna så de talar samma kod.
  const tagForSide = (side: MatchSide): string =>
    side === 'home' ? teamTagText(homeCode, homeName) : teamTagText(awayCode, awayName);

  // Tillgängligt namn: hela live-läget som en mening (status + ställning + klocka).
  const stateWord = finished ? 'Slutresultat' : live ? 'Live' : clock.label;
  const regionLabel = `${stateWord}: ${homeName} ${homeGoals}-${awayGoals} ${awayName}, ${clock.label}`;

  // Det finns något att fälla ut bara om vi faktiskt har statistik, laguppställning ELLER
  // byten (bytena flyttades hit, längst ned i "Visa mer", under laguppställningen).
  const hasDetail =
    statRows.length > 0 || lineups.home !== null || lineups.away !== null || subs.length > 0;

  return (
    <section
      data-live-card=""
      data-live-status={data.status}
      data-live-ticking={clock.ticking ? '' : undefined}
      aria-label={regionLabel}
      className="vm-live-card mt-1 flex flex-col gap-3 rounded-card border p-3.5"
    >
      {/* RAD 1: klock-/status-chip + (live) en diskret pulsande LIVE-indikator. */}
      <div className="flex items-center justify-between gap-2">
        <span
          data-live-clock=""
          className="vm-live-clock inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-display text-xs font-bold tabular-nums"
        >
          {/* Pulsande punkt BARA under faktisk live-tick (ticking). I paus/slut är
              den en stilla punkt, så rörelsen ärligt signalerar "klockan går nu".
              Reduced-motion nollar pulsen (live-card.css). aria-hidden:
              status-ORDET bär betydelsen för skärmläsare, punkten är ren cue. */}
          {live ? (
            <span
              aria-hidden="true"
              data-live-dot=""
              className={`vm-live-card-dot inline-block h-1.5 w-1.5 rounded-pill ${
                clock.ticking ? 'vm-live-card-dot-ticking' : ''
              }`}
            />
          ) : null}
          <span>{clock.label}</span>
        </span>

        {/* LIVE-/SLUT-etikett: färg-oberoende (text bär betydelsen). */}
        <span
          data-live-badge={finished ? 'finished' : live ? 'live' : 'other'}
          className="vm-live-badge inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.12em]"
        >
          {finished ? 'Slut' : live ? 'Live' : 'Följ matchen'}
        </span>
      </div>

      {/* RAD 2: ställningen, stor och tydlig, EN gång (resultatet visas aldrig dubbelt).
          tabular-nums så siffran sitter still när ett mål faller. Namnen kapas inom
          bredden (min-w-0 + truncate). */}
      <div className="flex items-center gap-3" data-live-score-row="">
        <span className="min-w-0 flex-1 truncate text-right font-display text-sm font-semibold">
          {homeName}
        </span>
        <span
          data-live-score=""
          className="shrink-0 font-display text-2xl font-bold tabular-nums leading-none"
        >
          {homeGoals}
          <span className="px-1 text-fg-muted">-</span>
          {awayGoals}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-display text-sm font-semibold">
          {awayName}
        </span>
      </div>

      {/* RAD 3 (KÄRNAN, alltid synlig): målskyttar (+ assist på egen rad) och kort.
          Bytena ligger INTE här utan längst ned i "Visa mer" (Daniels ordning). Varje
          lista visas bara om den har innehåll (en tidig 0-0 utan events ger ingen tom yta);
          sektions-ORDNINGEN är alltid mål -> kort, så strukturen är enhetlig. */}
      {goals.length > 0 ? <GoalList goals={goals} tagForSide={tagForSide} /> : null}
      {cards.length > 0 ? <CardList cards={cards} tagForSide={tagForSide} /> : null}

      {/* "VISA MER": återbrukar den delade ExpandToggle (aria-expanded/-controls,
          fokus, chevron). Visas bara när det FINNS detaljer att fälla ut (ärligt
          löfte, samma princip som CollapsibleBody). Ordning i panelen: statistik ->
          laguppställning -> byten (Daniels spec). */}
      {hasDetail ? (
        <div data-live-detail-wrap="" className="flex flex-col gap-3">
          <div className="flex">
            <ExpandToggle
              name="live-detail"
              expanded={expanded}
              hiddenCount={0}
              labels={{ expand: 'Visa mer (statistik + laguppställning)', collapse: 'Visa mindre' }}
              controls={detailId}
              onToggle={() => setExpanded((v) => !v)}
              position="top"
            />
          </div>
          {expanded ? (
            <div id={detailId} data-live-detail="" className="flex flex-col gap-5">
              {statRows.length > 0 ? <StatBlock rows={statRows} /> : null}
              {lineups.home !== null || lineups.away !== null ? (
                <LineupBlock
                  home={lineups.home}
                  away={lineups.away}
                  homeName={homeName}
                  awayName={awayName}
                />
              ) : null}
              {/* BYTEN längst ned, under laguppställningen (Daniels ordning), namnen
                  staplade (in/ut). */}
              {subs.length > 0 ? <SubBlock subs={subs} tagForSide={tagForSide} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Lag-tillhörighets-brickan på en händelse-rad: lagets kod/initialer som TEXT i full fg
 * (AA-säkert, ingen text på en genererad färg) plus en liten dekorativ färg-punkt (cue).
 * data-live-event-team-side bär sidan så CSS:en kan tona punkten per lag (hemma = accent,
 * borta = neutral), färg-oberoende: koden bär lag-tillhörigheten, punkten är förstärkning.
 */
function TeamTag({ side, text }: { side: MatchSide; text: string }) {
  return (
    <span
      data-live-event-team=""
      data-live-event-team-side={side}
      className="vm-live-event-team inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-wide"
    >
      <span
        aria-hidden="true"
        className="vm-live-event-team-dot inline-block h-1.5 w-1.5 rounded-pill"
      />
      {text}
    </span>
  );
}

/**
 * Mål-listan: en rad per mål med minut + lag-bricka + målskytt; ASSISTEN på en EGEN,
 * indenterad rad under (Daniels spec), så skytt och assist aldrig trängs på samma rad.
 */
function GoalList({
  goals,
  tagForSide,
}: {
  goals: readonly GoalEntry[];
  tagForSide: (side: MatchSide) => string;
}) {
  return (
    <ul data-live-goals="" className="flex flex-col gap-2">
      {goals.map((g, i) => (
        <li key={`${g.minute}-${g.scorer}-${i}`} data-live-goal="" data-live-goal-side={g.side}>
          {/* Rad 1: ikon + minut + lag-bricka + skytt (+ ev. straff/självmål-markering). */}
          <div className="flex items-baseline gap-2 text-sm">
            <span aria-hidden="true" className="vm-live-icon-goal shrink-0 text-base leading-none">
              ⚽
            </span>
            <span className="w-9 shrink-0 text-right font-display text-xs font-bold tabular-nums text-fg-muted">
              {formatEventMinute(g.minute, g.extra)}
            </span>
            <TeamTag side={g.side} text={tagForSide(g.side)} />
            <span className="min-w-0">
              <span className="font-semibold">{g.scorer}</span>
              {g.penalty ? <span className="text-fg-muted"> (str.)</span> : null}
              {g.ownGoal ? <span className="text-fg-muted"> (självmål)</span> : null}
            </span>
          </div>
          {/* Rad 2 (bara om assist finns): assisten, mindre + indenterad i linje med
              skyttens namn (minut-bredd 2.25rem + ikon/lag-bricka-bredd) så hierarkin
              läses i en blick. */}
          {g.assist !== null ? (
            <p data-live-goal-assist="" className="ml-[3.75rem] text-xs text-fg-muted">
              assist: {g.assist}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Kort-listan: minut + lag-bricka + en FÄRGAD kort-ikon (gul/röd) + spelare. INGEN
 * "gult/rött kort"-text (färgen bär betydelsen); a11y bevaras via en dold (sr-only)
 * "gult kort"/"rött kort" på ikonen, så en skärmläsare ändå hör vilket kort det är.
 */
function CardList({
  cards,
  tagForSide,
}: {
  cards: readonly CardEntry[];
  tagForSide: (side: MatchSide) => string;
}) {
  return (
    <ul data-live-cards="" className="flex flex-col gap-2">
      {cards.map((c, i) => (
        <li
          key={`${c.minute}-${c.player}-${i}`}
          data-live-card-event=""
          data-live-card-color={c.color}
          className="flex items-baseline gap-2 text-sm"
        >
          {/* Den färgade kort-ikonen. Färgen ÄR informationen (gul/röd); den dolda
              etiketten ger samma besked till en skärmläsare (WCAG: inte enbart färg). */}
          <span
            className={`vm-live-card-pip shrink-0 self-center ${
              c.color === 'red' ? 'vm-live-card-pip-red' : 'vm-live-card-pip-yellow'
            }`}
          >
            <span className="sr-only">{c.color === 'red' ? 'rött kort' : 'gult kort'}</span>
          </span>
          <span className="w-9 shrink-0 text-right font-display text-xs font-bold tabular-nums text-fg-muted">
            {formatEventMinute(c.minute, c.extra)}
          </span>
          <TeamTag side={c.side} text={tagForSide(c.side)} />
          <span className="min-w-0 font-medium">{c.player}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Byte-blocket: längst ned i "Visa mer", under laguppställningen. Namnen STAPLADE
 * (in på en rad, ut på raden under) så ett byte läses tydligt även när två namn är långa.
 */
function SubBlock({
  subs,
  tagForSide,
}: {
  subs: readonly SubEntry[];
  tagForSide: (side: MatchSide) => string;
}) {
  return (
    <div data-live-subs="" className="flex flex-col gap-2.5">
      <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
        Byten
      </h4>
      <ul className="flex flex-col gap-2.5">
        {subs.map((s, i) => (
          <li
            key={`${s.minute}-${s.playerIn}-${i}`}
            data-live-sub=""
            data-live-sub-side={s.side}
            className="flex items-baseline gap-2 text-sm"
          >
            <span aria-hidden="true" className="shrink-0 self-start text-sm leading-none">
              🔁
            </span>
            <span className="w-9 shrink-0 text-right font-display text-xs font-bold tabular-nums text-fg-muted">
              {formatEventMinute(s.minute, s.extra)}
            </span>
            <TeamTag side={s.side} text={tagForSide(s.side)} />
            {/* Namnen STAPLADE: in (grön pil) på en rad, ut (dämpad) på raden under. */}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="vm-live-sub-in font-medium" data-live-sub-in="">
                <span aria-hidden="true" className="vm-live-sub-arrow">
                  ▲
                </span>{' '}
                {s.playerIn}
              </span>
              {s.playerOut !== null ? (
                <span className="text-xs text-fg-muted" data-live-sub-out="">
                  <span aria-hidden="true" className="vm-live-sub-arrow-out">
                    ▼
                  </span>{' '}
                  {s.playerOut}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Statistik-blocket: en jämförelse-stapel per nyckeltal (hemma | etikett | borta). */
function StatBlock({ rows }: { rows: readonly StatRow[] }) {
  return (
    <div data-live-stats="" className="flex flex-col gap-2.5">
      <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
        Statistik
      </h4>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.label} data-live-stat-row="" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold tabular-nums" data-live-stat-home="">
                {r.homeText}
              </span>
              <span className="text-fg-muted">{r.label}</span>
              <span className="font-semibold tabular-nums" data-live-stat-away="">
                {r.awayText}
              </span>
            </div>
            {/* Jämförelse-stapeln (aria-hidden: talen ovan bär betydelsen). De två
                segmenten möts i mitten, så övervikten syns direkt. */}
            <div
              aria-hidden="true"
              className="vm-live-stat-bar flex h-1.5 overflow-hidden rounded-pill"
            >
              <span
                className="vm-live-stat-bar-home"
                style={{ flexGrow: r.homeShare, flexBasis: 0 }}
              />
              <span
                className="vm-live-stat-bar-away"
                style={{ flexGrow: r.awayShare, flexBasis: 0 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Laguppställnings-blocket: formation + startelva + avbytare per lag. */
function LineupBlock({
  home,
  away,
  homeName,
  awayName,
}: {
  home: LiveLineup | null;
  away: LiveLineup | null;
  homeName: string;
  awayName: string;
}) {
  return (
    <div data-live-lineups="" className="flex flex-col gap-4">
      <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
        Laguppställning
      </h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <LineupColumn lineup={home} fallbackName={homeName} />
        <LineupColumn lineup={away} fallbackName={awayName} />
      </div>
    </div>
  );
}

/** En lag-kolumn i laguppställningen: namn + formation, startelva, avbytare. */
function LineupColumn({
  lineup,
  fallbackName,
}: {
  lineup: LiveLineup | null;
  fallbackName: string;
}) {
  if (lineup === null) {
    return null;
  }
  return (
    <div data-live-lineup="" className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-semibold">
          {lineup.teamName || fallbackName}
        </span>
        {lineup.formation ? (
          <span
            data-live-formation=""
            className="vm-live-formation rounded-pill px-2 py-0.5 font-display text-[0.625rem] font-bold tabular-nums"
          >
            {lineup.formation}
          </span>
        ) : null}
      </p>
      {lineup.startXI.length > 0 ? (
        <ol data-live-startxi="" className="flex flex-col gap-1 text-xs">
          {lineup.startXI.map((p) => (
            <li key={p.apiPlayerId} className="flex items-baseline gap-2">
              <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-fg-muted">
                {p.number}
              </span>
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="ml-auto shrink-0 text-[0.625rem] uppercase text-fg-muted">
                {p.position}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {lineup.substitutes.length > 0 ? (
        <details data-live-subs-list="" className="text-xs text-fg-muted">
          <summary className="vm-live-subs-summary cursor-pointer select-none font-medium">
            Avbytare ({lineup.substitutes.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {lineup.substitutes.map((p) => (
              <li key={p.apiPlayerId} className="flex items-baseline gap-2">
                <span className="w-5 shrink-0 text-right tabular-nums">{p.number}</span>
                <span className="min-w-0 truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
