// TOPPLISTE-VYN (T17, #17). FUNKTIONELLT + a11y-lager (senior-dev) + PREMIUM-FINISH
// (design-frontend), ett lager.
//
// IDENTITET (taskens KRÖNING): topplistan är vad kompisarna kollar VARJE dag, den ska
// kännas LEVANDE och TÄVLINGSINRIKTAD. Tre saker bär den känslan:
//   1. PODIUM: topp-3 bär riktiga pallplats-medaljer (1:a guld, 2:a silver, 3:a brons),
//      samma färg-oberoende solid-bricka-medalj som grupp-tipsets podium (T16,
//      .vm-pool-medal, DRY) + en 3:e brons-modifierare. Ledar-raden får en varm
//      guld-glow så ögat dras dit direkt.
//   2. RÖRELSE: varje rad är en `motion.li` med `layout`, så när poängen ändras och
//      ordningen kastas om GLIDER raden till sin nya plats (premium spring) i stället
//      för att hoppa. En kort highlight-puls (CSS) markerar raden som just bytt plats.
//   3. "DU" (egna raden): FÄRG-OBEROENDE framhävd , accent-ring + "DU"-bricka + svag
//      accent-tint (inte bara en färg), så den syns även för en färgblind användare
//      och i båda teman.
//
// REDUCED-MOTION (WCAG 2.3.3): MotionConfig reducedMotion="user" (MotionProvider)
// stänger av layout-/transform-animationer, OCH vi gatar `layout` + spring + puls
// explicit på useReducedMotion (dubbelt skydd). Då blir listan STILL men rank-
// ORDNINGEN behålls (raderna står i rätt placerings-ordning, bara utan glid/puls).
//
// KONTRAST: all text står på opak surface eller en LÅG-alfa tint mätt som canvas-
// komposit (scripts/contrast-t17.mjs, decisions.md T17-visuellt). Medalj-siffrorna
// är mörk ink på SOLID medalj-yta (färg-oberoende form). Guld-TEXT = --color-warning.
//
// UTAN aktivt rum: "gå med i ett rum" (topplistan är per rum, samma som T15/T16).

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLeaderboardStore } from './leaderboard-context';
import type { LeaderboardEntry } from './aggregate-scores';
import { StickyFollowToggle } from '../../components/collapsible-list';
import { ExpandToggle } from '../../components/ExpandToggle';

// Hur många rader topplistan visar i KOMPRIMERAT default-läge (toppen). En per-rums-topplista
// kan bli lång (seedade rum har upp till ~200 deltagare, bot-seed-planen), så vi börjar
// komprimerad med pallen + lite till och fäller ut resten på begäran , samma "börja
// komprimerad + sticky följ-med-kontroll"-mönster som den globala topplistan (#173 T82 del 4,
// ägarens feedback). Under tröskeln (korta vänskaps-rum) renderas hela listan som förr (inget
// att komprimera), så det vanliga lilla rummet är OFÖRÄNDRAT.
const COLLAPSED_VISIBLE = 8;

/** Spring för layout-glidet: en tävlings-tight men mjuk fjäder (premium, ingen wobble). */
const LAYOUT_SPRING = { type: 'spring', stiffness: 520, damping: 38, mass: 0.9 } as const;

// Hur länge puls-flaggan (data-rank-changed) hålls innan den nollas. MÅSTE matcha
// CSS-pulsens längd `vm-board-rank-pulse 1.1s` (tokens.css, .vm-board-row[data-rank-changed]).
// VARFÖR vi nollar: pulsen är en ENGÅNGS CSS-animation som bara (åter)startar när
// data-rank-changed togglas av->på. Om flaggan aldrig nollas står den kvar på 'true', och
// en SENARE omsortering av SAMMA rad kan inte tända pulsen igen (samma attributvärde =
// ingen omstart). Vi nollar därför efter pulsens längd, så nästa omsortering kan trigga om.
const RANK_PULSE_MS = 1100;

/** Medalj-modifierare per topp-3-placering (1=guld, 2=silver, 3=brons). DRY mot T16. */
const MEDAL_CLASS: Record<number, string> = {
  1: 'vm-pool-medal--gold',
  2: 'vm-pool-medal--silver',
  3: 'vm-pool-medal--bronze',
};

/** En rad i topplistan. Egen komponent så `layout`-animationen är per rad. */
function LeaderboardRow({
  entry,
  animateLayout,
  isSelf,
  rankChanged,
}: {
  entry: LeaderboardEntry;
  animateLayout: boolean;
  isSelf: boolean;
  rankChanged: boolean;
}) {
  const isLeader = entry.rank === 1;
  const medalClass = MEDAL_CLASS[entry.rank];

  return (
    <motion.li
      // layout: glid till ny plats när ordningen ändras (av/på via reduced-motion).
      layout={animateLayout ? 'position' : false}
      transition={animateLayout ? LAYOUT_SPRING : { duration: 0 }}
      data-leaderboard-row=""
      data-user-id={entry.userId}
      data-rank={entry.rank}
      data-points={entry.points}
      // Dekor-hakar för CSS (ledar-glow, egen-rad-ring, puls). Bär ingen semantik;
      // skärmläsar-ordningen + aria-label:n bär betydelsen.
      data-leader={isLeader ? 'true' : undefined}
      data-self={isSelf ? 'true' : undefined}
      data-rank-changed={rankChanged ? 'true' : undefined}
      className="vm-board-row flex items-center gap-3 rounded-card px-4 py-3"
    >
      {/* Placering. Topp-3 = pallplats-MEDALJ (solid bricka, mörk ink, färg-oberoende
          form). Plats 4+ = neutral rank-pill. aria-label gör placeringen läsbar i
          BÅDA fallen (medaljens siffra är dekor-tydlig men aria bär den exakta platsen). */}
      <span
        data-leaderboard-rank=""
        aria-label={`Placering ${entry.rank}`}
        className={
          medalClass
            ? `vm-pool-medal ${medalClass} inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums`
            : 'vm-board-rank inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums'
        }
      >
        {entry.rank}
      </span>

      {/* Namnet truncar (min-w-0 + flex-1), så det är det ENDA som krymper när raden
          blir trång (foldable cover 280px). Brickan + poängen är `shrink-0` SYSKON
          (inte nästlade i namn-gruppen), så flex reserverar deras plats först och de
          kan ALDRIG överlappa varandra ens när namnet truncats till 0 bredd. */}
      <span data-leaderboard-name="" className="min-w-0 flex-1 truncate font-medium">
        {entry.displayName}
      </span>

      {/* "DU"-bricka: gör egna raden läsbar som TEXT, inte bara via ring/tint
          (färg-oberoende redundans). aria-hidden , den egna raden är ändå tydlig i
          kontexten, och brickan upprepar bara namnet visuellt. */}
      {isSelf ? (
        <span
          data-leaderboard-self=""
          aria-hidden="true"
          className="vm-board-self-badge shrink-0 rounded-pill px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.12em]"
        >
          Du
        </span>
      ) : null}

      {/* Poängen: ledaren får guld-TEXT (--color-warning, AA-mätt), övriga fg. */}
      <span
        data-leaderboard-points=""
        className={`shrink-0 font-display text-sm font-semibold tabular-nums ${
          isLeader ? 'text-warning' : ''
        }`}
      >
        {entry.points} poäng
      </span>
    </motion.li>
  );
}

export function LeaderboardView() {
  const store = useLeaderboardStore();
  const reduceMotion = useReducedMotion();
  // Animera placerings-ändringar bara om användaren inte valt minska rörelse.
  const animateLayout = !reduceMotion;

  // KOMPRIMERA/UTFÄLL (#173 T82 del 4): en lång per-rums-topplista börjar komprimerad (topp-N)
  // och fälls ut på begäran, med en STICKY följ-med-komprimera-kontroll i utfällt läge. Vi
  // VIRTUALISERAR INTE här (till skillnad från den globala topplistan): rad-glidet (motion.li
  // layout) kräver mountade rader, så vi slice:ar bara den renderade mängden och låter
  // AnimatePresence sköta in/ut. Korta rum (<= tröskeln) rör vi inte (ingen toggle).
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  // Fokus-flytt vid ihopfällning (samma a11y-grepp som resultat-/tips-listan): den NEDRE
  // toggeln kan ligga långt ner i en utfälld lista. Fäller man ihop därifrån ska fokus föras
  // upp till den ÖVRE (sticky) kontrollen vid listans topp.
  const topToggleRef = useRef<HTMLButtonElement>(null);
  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      if (!next) {
        requestAnimationFrame(() => topToggleRef.current?.focus());
      }
      return next;
    });
  }

  const ready = store.enabled && store.status === 'ready';

  // PLACERINGS-PULS-spårning: jämför varje medlems rank mot förra renderingens rank,
  // markera de userId:n vars placering JUST ändrats så CSS-pulsen tänds en gång.
  // Ren VISNINGS-effekt (rörelse-glidet + ordningen bär den riktiga betydelsen);
  // nollas helt vid reducerad rörelse (vi sätter aldrig data-rank-changed då).
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ready) {
      prevRanksRef.current = new Map();
      return;
    }
    const prev = prevRanksRef.current;
    const next = new Map<string, number>();
    const moved = new Set<string>();
    for (const entry of store.leaderboard) {
      next.set(entry.userId, entry.rank);
      const before = prev.get(entry.userId);
      // Bara en ÄNDRING räknas (inte första gången raden dyker upp): annars skulle
      // hela listan pulsa vid första laddningen, vilket vore brus, inte signal.
      if (before !== undefined && before !== entry.rank) {
        moved.add(entry.userId);
      }
    }
    prevRanksRef.current = next;
    if (moved.size === 0) {
      // Inget rörde sig: nolla bara om en gammal flagga ligger kvar (annars ingen re-render).
      setChangedIds((curr) => (curr.size > 0 ? new Set() : curr));
      return;
    }
    // Något rörde sig: tänd pulsen för de raderna.
    setChangedIds(moved);
    // Nolla flaggan när pulsen spelat klart, så en SENARE omsortering av samma rad kan
    // tända CSS-pulsen igen (engångs-animationen startar bara om vid en av->på-toggling).
    // Vid reducerad rörelse sätts data-rank-changed aldrig på raden (animateLayout=false),
    // så pulsen är ändå av, men vi nollar state-flaggan likadant för att hålla den ren.
    const timer = setTimeout(() => {
      setChangedIds((curr) => (curr.size > 0 ? new Set() : curr));
    }, RANK_PULSE_MS);
    return () => clearTimeout(timer);
  }, [store.leaderboard, ready]);

  return (
    <section aria-labelledby="leaderboard-heading" data-leaderboard-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          VM-poolen
        </p>
        <h2 id="leaderboard-heading" className="font-display text-xl font-semibold sm:text-2xl">
          Topplista
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Vem tippar bäst? Poängen tickar in när matcher avgörs, från match-resultat, gruppvinnare
          och slutspel. Lika poäng delar placering.
        </p>
      </header>

      {/* UTAN aktivt rum: topplistan är per rum. */}
      {!store.enabled ? (
        <p data-leaderboard-no-room="" className="mt-4 text-sm text-fg-muted">
          Gå med i ett rum för att se topplistan, du och kompisarna tävlar om vem som tippar bäst.
        </p>
      ) : null}

      {/* Fel-väg (fail loud). */}
      {store.enabled && store.status === 'error' ? (
        <p
          role="alert"
          data-leaderboard-error=""
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {store.error ?? 'Något gick fel när topplistan skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning. */}
      {store.enabled && (store.status === 'loading' || store.status === 'idle') ? (
        <p role="status" data-leaderboard-loading="" className="mt-4 text-sm text-fg-muted">
          Laddar topplistan…
        </p>
      ) : null}

      {/* Tom (inga medlemmar, ovanligt). */}
      {ready && store.leaderboard.length === 0 ? (
        <p data-leaderboard-empty="" className="mt-4 text-sm text-fg-muted">
          Inga medlemmar att rangordna än.
        </p>
      ) : null}

      {/* Topplistan: en placerings-ordnad lista som glider vid ändring. Lång lista (seedat
          rum) börjar KOMPRIMERAD (topp-N) med en sticky följ-med-komprimera-kontroll i utfällt
          läge; korta rum visar hela listan (ingen toggle, oförändrat). */}
      {ready && store.leaderboard.length > 0
        ? (() => {
            const hasMore = store.leaderboard.length > COLLAPSED_VISIBLE;
            // Rendera bara topp-N i komprimerat läge; allt i utfällt. AnimatePresence sköter
            // in/ut, layout-glidet behålls på den renderade mängden (ingen virtualisering).
            const visible =
              hasMore && !expanded
                ? store.leaderboard.slice(0, COLLAPSED_VISIBLE)
                : store.leaderboard;
            const hiddenCount = store.leaderboard.length - COLLAPSED_VISIBLE;
            // Listan byggs EN gång (DRY) och placeras antingen inuti StickyFollowToggle
            // (lång lista => sticky följ-med-bar som följer med ner i listan, F1-fix:
            // bar + lista delar EN containing block) eller renderas naken (kort rum, ingen
            // toggle, oförändrat). Samma `<ol id={listId}>` i båda fallen.
            const list = (
              <ol
                id={listId}
                data-leaderboard-list=""
                data-expanded={hasMore ? (expanded ? 'true' : 'false') : undefined}
                className="mt-5 flex list-none flex-col gap-2 p-0"
              >
                <AnimatePresence initial={false}>
                  {visible.map((entry) => (
                    <LeaderboardRow
                      key={entry.userId}
                      entry={entry}
                      animateLayout={animateLayout}
                      isSelf={store.currentUserId !== null && entry.userId === store.currentUserId}
                      rankChanged={animateLayout && changedIds.has(entry.userId)}
                    />
                  ))}
                </AnimatePresence>
              </ol>
            );
            return (
              <>
                {/* ÖVRE kontroll: i UTFÄLLT läge en STICKY följ-med-bar (komprimera alltid ett
                  tryck bort oavsett scroll), i komprimerat en vanlig "Visa alla N"-inline-
                  kontroll. Bara när listan är längre än tröskeln. Listan ligger som `children`
                  i baren (F1-fix T83): bar + lista delar EN containing block, så den sticky
                  baren följer med ner i listan i stället för att glida ur vy. */}
                {hasMore ? (
                  <StickyFollowToggle
                    expanded={expanded}
                    labels={{
                      expand: `Visa alla ${store.leaderboard.length}`,
                      collapse: 'Komprimera',
                    }}
                    controls={listId}
                    onToggle={toggleExpanded}
                    buttonRef={topToggleRef}
                    name="leaderboard"
                  >
                    {list}
                  </StickyFollowToggle>
                ) : (
                  list
                )}

                {/* NEDRE kontroll (dubblerad, bara i UTFÄLLT läge): så man kan fälla ihop utan att
                  skrolla tillbaka upp. Identisk semantik som den övre (samma ExpandToggle), och
                  vid ihopfällning förs fokus upp till den övre (sticky) kontrollen. */}
                {hasMore && expanded ? (
                  <div className="mt-4 flex">
                    <ExpandToggle
                      expanded={expanded}
                      hiddenCount={hiddenCount}
                      labels={{
                        expand: `Visa alla ${store.leaderboard.length}`,
                        collapse: 'Komprimera',
                      }}
                      controls={listId}
                      onToggle={toggleExpanded}
                      position="bottom"
                      name="leaderboard"
                    />
                  </div>
                ) : null}
              </>
            );
          })()
        : null}
    </section>
  );
}
