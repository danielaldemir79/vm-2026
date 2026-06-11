// TOPPLISTE-VYN (FUNKTIONELLT + a11y-lager, T17, #17).
//
// FOKUS (senior-devs lager): rätt rangordning, RÖRELSE-animation vid placerings-
// ändring, tillgänglig struktur, rätt lägen (utan rum / laddar / fel / tom / klar).
// Visar topplistan (vem tippar bäst) som en semantisk lista med placering, namn och
// poäng. Premium-finish (medaljer, glow, finputsad rörelse) lämnas till design-
// frontend ovanpå; här finns stabil semantik + data-attribut som seam.
//
// RÖRELSE-ANIMATION (taskens punkt 1): varje rad är en `motion.li` med `layout`, så
// när poängen ändras och ordningen kastas om GLIDER raderna till sin nya plats i
// stället för att hoppa. Reduced-motion: MotionConfig reducedMotion="user"
// (MotionProvider) stänger AUTOMATISKT av layout-/transform-animationer, och vi
// gatar dessutom `layout` explicit på useReducedMotion (dubbelt skydd, WCAG 2.3.3),
// så en användare som valt minska rörelse får en still lista.
//
// UTAN aktivt rum: "gå med i ett rum" (topplistan är per rum, samma som T15/T16).

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLeaderboardStore } from './leaderboard-context';
import type { LeaderboardEntry } from './aggregate-scores';

/** En rad i topplistan. Egen komponent så `layout`-animationen är per rad. */
function LeaderboardRow({
  entry,
  animateLayout,
}: {
  entry: LeaderboardEntry;
  animateLayout: boolean;
}) {
  return (
    <motion.li
      // layout: glid till ny plats när ordningen ändras (av/på via reduced-motion).
      layout={animateLayout ? 'position' : false}
      data-leaderboard-row=""
      data-user-id={entry.userId}
      data-rank={entry.rank}
      data-points={entry.points}
      className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
    >
      {/* Placering. th-liknande, men i en lista: aria-label gör den läsbar. */}
      <span
        data-leaderboard-rank=""
        aria-label={`Placering ${entry.rank}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-raised font-display text-sm font-semibold tabular-nums"
      >
        {entry.rank}
      </span>
      <span data-leaderboard-name="" className="min-w-0 flex-1 truncate font-medium">
        {entry.displayName}
      </span>
      <span
        data-leaderboard-points=""
        className="shrink-0 font-display text-sm font-semibold tabular-nums"
      >
        {entry.points} {entry.points === 1 ? 'poäng' : 'poäng'}
      </span>
    </motion.li>
  );
}

export function LeaderboardView() {
  const store = useLeaderboardStore();
  const reduceMotion = useReducedMotion();
  // Animera placerings-ändringar bara om användaren inte valt minska rörelse.
  const animateLayout = !reduceMotion;

  const ready = store.enabled && store.status === 'ready';

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

      {/* Topplistan: en placerings-ordnad lista som glider vid ändring. */}
      {ready && store.leaderboard.length > 0 ? (
        <ol data-leaderboard-list="" className="mt-5 flex list-none flex-col gap-2 p-0">
          <AnimatePresence initial={false}>
            {store.leaderboard.map((entry) => (
              <LeaderboardRow key={entry.userId} entry={entry} animateLayout={animateLayout} />
            ))}
          </AnimatePresence>
        </ol>
      ) : null}
    </section>
  );
}
