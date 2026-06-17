// LIVEKORTET: den synliga live-/resultat-panelen som BERIKAR ett matchkort när det
// finns live-data för matchen. Renderas för BÅDE en pågående OCH en avslutad (frusen,
// bläddringsbar) match, faller tillbaka till matchkortets vanliga utseende när live-data
// saknas (komponenten renderas då helt enkelt inte, se MatchCard).
//
// DANIELS DESIGN-SPEC (omdesign, kompakt + enhetlig, exakt följd):
//   - DIREKT SYNLIGT på kortet: ställning + status/klocka (EN gång, överst), målskyttar
//     (skytt på en rad, ASSIST på egen indenterad rad under), och kort (gul/röd). Inget mer.
//   - FÖRLOPPET ÄR SPEGLAT (hemma vänster | borta höger): ett mål eller kort hamnar på
//     den SIDA laget hör till, precis som statistik-panelen (hemma till vänster, borta
//     till höger). Positionen i sig visar alltså laget, så man ser direkt vems händelse
//     det är utan att läsa lag-koden. Minuten sitter i en central "spine" mellan sidorna,
//     tydlig per rad. På mobil är varje rad fortfarande en spegel (vänster-block resp.
//     höger-block runt minut-spinen), inte ett rörigt enkel-flöde.
//   - MÅL: boll-ikon + målskytt på lagets sida (SIDAN bär lag-tillhörigheten, ingen kod-
//     bricka på raden); assisten på en EGEN, mindre rad under skytten (på samma sida), så
//     raden läses snabbt och hierarkin är tydlig.
//   - KORT (gul/röd): en FÄRGAD kort-ikon (gul = gul, röd = röd) + spelarnamn på lagets
//     sida (SIDAN bär laget). INGEN "gult kort"/"rött kort"-TEXT , färgen bär betydelsen.
//     A11y bevaras: ikonen får en dold (sr-only) "gult kort"/"rött kort" så en skärmläsare
//     ändå hör vilket kort.
//   - INGEN LAG-KOD-BRICKA (NED/JPN) på någon förlopps-rad: SIDAN bär lag-tillhörigheten
//     överallt (mål, kort OCH byten), precis som statistik-panelen, så positionen visar
//     laget utan att läsa en kod (brickan trängde dessutom namnen på smal skärm).
//   - RESULTATET visas EN gång (överst). Ingen andra ställnings-visning någonstans.
//   - "VISA MER" i ordning: (a) STATISTIK (hemma vänster | etikett | borta höger,
//     jämförelse-staplar, UTAN kort-räkning , korten syns i förloppet), (b) LAGUPPSTÄLLNING,
//     (c) BYTEN längst ned, under laguppställningen, SPEGLADE (hemma vänster | borta höger),
//     namnen staplade (in/ut).
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
import type { ReactNode } from 'react';
import { isMatchInProgress, type LiveData, type LiveLineup } from '../../data/livescore';
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
   * Hemmalagets FIFA-landskod (t.ex. "NED"). RESERVERAD i kontraktet men ritas inte längre:
   * HELA förloppet (mål, kort OCH byten) bär nu lag-tillhörigheten via SIDAN (hemma vänster
   * | borta höger), så ingen kod-bricka behövs på någon rad. Behålls som valfri prop så
   * anroparna (MatchCard, LiveNowSection) inte behöver ändras, men konsumeras inte här.
   */
  homeCode?: string | null;
  /** Bortalagets FIFA-landskod. RESERVERAD (ritas inte, sidan bär laget), se homeCode. */
  awayCode?: string | null;
  /** Nuet (epoch-ms), injiceras för test. Default Date.now() i appen (klockan tickar). */
  now?: number;
}

export function LiveMatchCard({ data, homeName, awayName, homeApiId, now }: LiveMatchCardProps) {
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

  const live = isMatchInProgress(data.status);
  const finished = data.status === 'finished';
  const homeGoals = data.homeGoals ?? 0;
  const awayGoals = data.awayGoals ?? 0;

  // Tillgängligt namn: hela live-läget som en mening (status + ställning + klocka).
  const stateWord = finished ? 'Slutresultat' : live ? 'Live' : clock.label;
  const regionLabel = `${stateWord}: ${homeName} ${homeGoals}-${awayGoals} ${awayName}, ${clock.label}`;

  // A11Y: en ARTIG live-region annonserar STÄLLNINGEN när den ändras (ett mål faller) eller
  // när matchen tar slut, så en skärmläsar-användare HÖR mål utan att navigera kortet. Den
  // section-aria-label ovan är bara ett statiskt tillgängligt NAMN , en ändring där annonseras
  // inte. Annonsen EXKLUDERAR medvetet den tickande klockan (minuten ändras var 60:e sekund och
  // får inte spamma uppläsningar); ställnings-raden ändras bara på mål / slutsignal. Tom sträng
  // när matchen varken är live eller slut (inget pågående skeende att annonsera då).
  const liveAnnouncement =
    live || finished
      ? `${finished ? 'Slutresultat' : 'Ställning'}: ${homeName} ${homeGoals}-${awayGoals} ${awayName}`
      : '';

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
      {/* ARTIG live-region (sr-only, ingen visuell yta): annonserar ställningen vid mål /
          slutsignal. aria-atomic så HELA raden läses som en enhet (inte bara den ändrade
          siffran). Ligger alltid i DOM:en när kortet renderas, så efterföljande text-
          ändringar (mål) faktiskt annonseras av skärmläsaren. */}
      <p data-live-announce="" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement}
      </p>

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

      {/* RAD 3 (KÄRNAN, alltid synlig): målskyttar (+ assist på egen rad) och kort,
          SPEGLADE (hemma vänster | borta höger) runt en central minut-spine, så sidan
          i sig visar laget , konsekvent med statistik-panelen. Bytena ligger INTE här
          utan längst ned i "Visa mer" (Daniels ordning). Varje lista visas bara om den
          har innehåll (en tidig 0-0 utan events ger ingen tom yta); sektions-ORDNINGEN
          är alltid mål -> kort, så strukturen är enhetlig. */}
      {goals.length > 0 ? <GoalList goals={goals} /> : null}
      {cards.length > 0 ? <CardList cards={cards} /> : null}

      {/* "VISA MER": återbrukar den delade ExpandToggle (aria-expanded/-controls,
          fokus, chevron). Visas bara när det FINNS detaljer att fälla ut (ärligt
          löfte, samma princip som CollapsibleBody). Ordning i panelen: statistik ->
          laguppställning -> byten (Daniels spec). */}
      {hasDetail ? (
        <div data-live-detail-wrap="" className="flex flex-col gap-3">
          {/* "Visa mer"-knappen centrerad horisontellt i kortet (Daniels finlinjering):
              justify-center på flex-radens enda barn (knappens egen self-center räcker inte
              när radens default-justering är start). */}
          <div className="flex justify-center">
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
              {/* BYTEN längst ned, under laguppställningen (Daniels ordning): speglade
                  (hemma vänster | borta höger), namnen staplade (in/ut). */}
              {subs.length > 0 ? <SubBlock subs={subs} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * En SPEGLAD händelse-rad (Daniels feedback + finlinjering): tre kolumner
 * [hemma | minut-spine | borta]. Innehållet hamnar i HEMMA-kolumnen om side === 'home',
 * annars i BORTA-kolumnen, så POSITIONEN visar laget , konsekvent med statistik-panelen.
 * Den motsatta kolumnen är tom. Minuten sitter i en smal central spine, tydlig per rad.
 *
 * GEOMETRI (finlinjering, Daniels skärmdump-feedback): varje sidas innehåll är ETT prydligt
 * block , en fast ikon INNERST (flankerar minut-spinen, så ikonernas inre kant bildar en
 * ren vertikal linje på båda sidor) och ett TEXT-block (namn + ev. underrad) tätt intill
 * ikonen med en JÄMN, konsekvent lucka (gap-2), oavsett hur långt namnet är. Blocket trycks
 * mot mitten (hemma justify-end, så ikonen alltid sitter direkt vid spinen), och namnet
 * KAPAS med ellipsis i stället för att radbryta, så radhöjden hålls konsekvent även för
 * "Memphis Depay". Hemma höger-ställt mot mitten, borta vänster-ställt mot mitten ,
 * spegelbilder runt minuten. En ev. underrad (assist, ut-spelare) ligger i samma text-block
 * och ärver justeringen, så den linjerar exakt under namnet på samma sida.
 *
 * `icon` är den sid-flankerande ikonen (boll/kort/byte), `children` text-blockets rader. Att
 * skicka dem som SKILDA props (inte en klump i children) låter skalet placera ikonen innerst
 * och texten ytterst rätt för båda sidor, så kallaren slipper upprepa spegel-logiken.
 *
 * VARFÖR ett delat radskal: mål-, kort- OCH byte-raderna delar EXAKT samma spegel-geometri
 * (grid + minut-spine + ikon-innerst + text-block), bara innehållet skiljer (DRY, rule of
 * three uppfyllt: tre kallare nu, geometrin bor på ETT ställe), så hela förloppet ser
 * konsekvent ut oavsett antal händelser. Mobil: grid:en behåller de tre kolumnerna även på
 * smal bredd (minmax(0,1fr)-kolumnerna krymper, namnet ellipsar, minuten står fast), så
 * raden är en spegel även på en vikbar telefon, aldrig ett hopträngt enkel-flöde.
 */
function MirroredEventRow({
  side,
  minute,
  extra,
  icon,
  children,
}: {
  side: MatchSide;
  minute: number;
  extra: number | null;
  /** Den sid-flankerande ikonen (boll/kort/byte), placeras INNERST mot minut-spinen. */
  icon: ReactNode;
  /** Text-blockets rader (namn + ev. underrad), placeras tätt intill ikonen, kapas med ellipsis. */
  children: ReactNode;
}) {
  const isHome = side === 'home';
  // Blocket trycks mot mitten: hemma justify-end (ikonen vid spinen, namnet till vänster),
  // borta justify-start (ikonen vid spinen, namnet till höger). DOM-ordning: hemma
  // [text][ikon] (text-right), borta [ikon][text] (text-left), så ikonen alltid ligger
  // INNERST (vid spinen) och text-blockens inre kant bildar en ren vertikal linje. items-
  // start så ikonen sitter i linje med namn-raden (inte mitt emot ett ev. tvåradigt block).
  const cellClass = `flex min-w-0 items-start gap-2 text-sm ${
    isHome ? 'justify-end text-right' : 'justify-start text-left'
  }`;
  // Ikonen centreras vertikalt i FÖRSTA radens höjd (h-5 = text-sm-radhöjd), så boll/kort
  // ligger snyggt mitt emot namnet OCH minuten oavsett om en underrad (assist) flödar nedan.
  const iconBox = <span className="flex h-5 shrink-0 items-center">{icon}</span>;
  // Text-blocket: namn-raden (+ ev. underrad) staplade, min-w-0 så ellipsis kan slå till.
  const textBlock = <span className="flex min-w-0 flex-col gap-0.5">{children}</span>;
  return (
    <div
      data-live-event-side={side}
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2"
    >
      {/* HEMMA-cellen (kolumn 1): innehåll bara på hemma-sidan, annars tom platshållare.
          data-live-event-cell="home" är test-/design-haken så hemma-innehållet kan
          bevisas ligga i VÄNSTER kolumn (spegel-layouten). */}
      {isHome ? (
        <div data-live-event-cell="home" className={cellClass}>
          {textBlock}
          {iconBox}
        </div>
      ) : (
        <div aria-hidden="true" />
      )}
      {/* MINUT-SPINEN: alltid centrerad mellan sidorna, i linje med ikon + namn-rad (h-5). */}
      <span className="flex h-5 shrink-0 items-center justify-center px-1 font-display text-xs font-bold tabular-nums text-fg-muted">
        {formatEventMinute(minute, extra)}
      </span>
      {/* BORTA-cellen (kolumn 3): innehåll bara på borta-sidan, annars tom platshållare. */}
      {isHome ? (
        <div aria-hidden="true" />
      ) : (
        <div data-live-event-cell="away" className={cellClass}>
          {iconBox}
          {textBlock}
        </div>
      )}
    </div>
  );
}

/**
 * Mål-listan: en SPEGLAD rad per mål (hemma vänster | borta höger) med boll-ikon innerst
 * (vid minut-spinen) + målskyttens namn tätt intill; ASSISTEN på en EGEN, mindre rad DIREKT
 * under skytten, i SAMMA text-block, så den linjerar exakt under namnet på samma sida
 * (Daniels finlinjering). Skytt och assist trängs aldrig på samma rad och hör tydligt ihop.
 *
 * INGEN lag-kod-bricka på raden: SIDAN (vänster = hemma, höger = borta) bär lag-
 * tillhörigheten (positionen visar laget). Namnet KAPAS med ellipsis i stället för att
 * radbryta, så långa namn ("Memphis Depay") håller en konsekvent radhöjd. Eventuella
 * straff-/självmåls-markörer ligger på namn-raden (kapas med namnet om det blir trångt).
 */
function GoalList({ goals }: { goals: readonly GoalEntry[] }) {
  return (
    <ul data-live-goals="" className="flex flex-col gap-2">
      {goals.map((g, i) => (
        <li key={`${g.minute}-${g.scorer}-${i}`} data-live-goal="" data-live-goal-side={g.side}>
          <MirroredEventRow
            side={g.side}
            minute={g.minute}
            extra={g.extra}
            icon={
              <span
                aria-hidden="true"
                className="vm-live-icon-goal shrink-0 text-base leading-none"
              >
                ⚽
              </span>
            }
          >
            {/* Namn-raden: skytt + ev. straff/självmål, kapas med ellipsis (truncate) så
                ett långt namn håller radhöjden. */}
            <span className="truncate font-semibold">
              {g.scorer}
              {g.penalty ? <span className="font-normal text-fg-muted"> (str.)</span> : null}
              {g.ownGoal ? <span className="font-normal text-fg-muted"> (självmål)</span> : null}
            </span>
            {/* Assist-underraden (bara om assist finns): mindre + dämpad, i samma text-block
                så den linjerar exakt under skyttens namn på samma sida. */}
            {g.assist !== null ? (
              <span data-live-goal-assist="" className="truncate text-xs text-fg-muted">
                assist: {g.assist}
              </span>
            ) : null}
          </MirroredEventRow>
        </li>
      ))}
    </ul>
  );
}

/**
 * Kort-listan: en SPEGLAD rad per kort (hemma vänster | borta höger) med en FÄRGAD kort-
 * ikon (gul/röd) + spelare runt minut-spinen. SIDAN bär lag-tillhörigheten (ingen kod-
 * bricka, samma motiv som mål-listan: positionen visar laget + håller raden ren). INGEN
 * "gult/rött kort"-text (färgen bär betydelsen); a11y bevaras via en dold (sr-only)
 * "gult kort"/"rött kort" på ikonen, så en skärmläsare ändå hör vilket kort det är.
 */
function CardList({ cards }: { cards: readonly CardEntry[] }) {
  return (
    <ul data-live-cards="" className="flex flex-col gap-2">
      {cards.map((c, i) => (
        <li
          key={`${c.minute}-${c.player}-${i}`}
          data-live-card-event=""
          data-live-card-color={c.color}
          data-live-event-side={c.side}
        >
          <MirroredEventRow
            side={c.side}
            minute={c.minute}
            extra={c.extra}
            icon={
              // Den färgade kort-ikonen. Färgen ÄR informationen (gul/röd); den dolda
              // etiketten ger samma besked till en skärmläsare (WCAG: inte enbart färg).
              <span
                className={`vm-live-card-pip shrink-0 ${
                  c.color === 'red' ? 'vm-live-card-pip-red' : 'vm-live-card-pip-yellow'
                }`}
              >
                <span className="sr-only">{c.color === 'red' ? 'rött kort' : 'gult kort'}</span>
              </span>
            }
          >
            {/* Spelarnamnet, kapas med ellipsis (truncate) så långa namn håller radhöjden. */}
            <span className="truncate font-medium">{c.player}</span>
          </MirroredEventRow>
        </li>
      ))}
    </ul>
  );
}

/**
 * Byte-blocket: längst ned i "Visa mer", under laguppställningen. SPEGLAT precis som
 * mål-/kort-förloppet (hemma vänster | borta höger) , samma MirroredEventRow-skal, så
 * SIDAN bär lag-tillhörigheten och hela kortet talar samma layout-språk. Ingen separat
 * lag-kod-bricka längre (positionen visar laget, precis som på mål-/kort-raderna). Per
 * byte är namnen STAPLADE: in-spelaren (in-pil) på en rad, ut-spelaren (ut-pil) på raden
 * under, så ett byte läses tydligt även när två namn är långa. Minuten sitter i samma
 * centrala spine som resten av förloppet.
 *
 * Mobil (enkel-kolumn): hemma-bytet hamnar i vänster-blocket, borta-bytet i höger, runt
 * minut-spinen , aldrig ett hopträngt enkel-flöde (samma spegel-geometri som mål/kort).
 */
function SubBlock({ subs }: { subs: readonly SubEntry[] }) {
  return (
    <div data-live-subs="" className="flex flex-col gap-2.5">
      <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
        Byten
      </h4>
      <ul className="flex flex-col gap-2.5">
        {subs.map((s, i) => (
          <li key={`${s.minute}-${s.playerIn}-${i}`} data-live-sub="" data-live-sub-side={s.side}>
            <MirroredEventRow
              side={s.side}
              minute={s.minute}
              extra={s.extra}
              icon={
                <span aria-hidden="true" className="shrink-0 text-sm leading-none">
                  🔁
                </span>
              }
            >
              {/* Namnen STAPLADE: in (accent-pil) på en rad, ut (dämpad) under. Ärver
                  text-blockets justering (hemma höger mot spinen, borta vänster utåt), så
                  stapeln speglar sidan. Båda kapas med ellipsis så långa namn håller höjden. */}
              <span className="vm-live-sub-in truncate font-medium" data-live-sub-in="">
                <span aria-hidden="true" className="vm-live-sub-arrow">
                  ▲
                </span>{' '}
                {s.playerIn}
              </span>
              {s.playerOut !== null ? (
                <span className="truncate text-xs text-fg-muted" data-live-sub-out="">
                  <span aria-hidden="true" className="vm-live-sub-arrow-out">
                    ▼
                  </span>{' '}
                  {s.playerOut}
                </span>
              ) : null}
            </MirroredEventRow>
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
