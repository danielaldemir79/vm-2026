// Det VISUELLA målfirande-LAGRET, overlay-komponenten (T6, issue #6, SPEC §12).
// Designens premium-yta ovanpå den funktionella kroken (useGoalCelebration).
//
// ARBETSDELNING: kroken (goal-celebration.ts) avgör NÄR ett firande tänds, dess
// timing/auto-avkling och reduced-motion-tystnaden (vid "minska rörelse" ger den
// alltid null, inget tänds). Denna komponent avgör HUR det ser ut: en "arena i
// kvällsljus"-explosion med en mål-pop-bricka som fjäder-poppar fram i en grön och
// guld gloria, plus konfetti som regnar i hejarklacks-tonerna. Antalet konfetti
// skalar med totalGoals (fler mål = större fest), men ett tak håller det smakfullt.
//
// A11y och prestanda: den yttre aria-hidden, pointer-events-none overlay-roten
// (position: fixed, ingen layout-shift, fångar aldrig klick) renderas ALLTID,
// men står tom i vila, det undviker mount/unmount-churn på själva overlay-noden.
// Det är INNEHÅLLET (mål-pop + konfetti) som villkorsrenderas: det monteras bara
// när ett firande är aktivt och rivs av AnimatePresence när kroken nollar
// tillståndet, så inget animeras i bakgrunden i vila. Konfettin renderas dessutom
// bara när rörelse är tillåten (en egen useReducedMotion-grind utöver krokens egen
// tystnad, dubbel säkerhet), så lagret aldrig självt inför rörelse en användare
// bett bort.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { springs } from '../../motion';
import type { GoalCelebration as GoalCelebrationState } from './goal-celebration';

/** Hur många konfetti-bitar per mål, och taket (smakfullt, inte stökigt). */
const CONFETTI_PER_GOAL = 14;
const CONFETTI_MAX = 70;

/** Hejarklacks-toner: grön accent + pokal-guld (tema-trogna via tokens). */
const CONFETTI_COLORS = [
  'var(--color-accent)',
  'var(--vm-gold)',
  'var(--color-success)',
  'var(--color-fg)',
] as const;

/** En förberäknad konfetti-bit: stabil per firande så animationen inte hoppar. */
interface ConfettiPiece {
  id: number;
  /** Horisontellt utgångsläge i procent av overlay-bredden. */
  leftPct: number;
  /** Hur långt biten faller (vh), så fältet får djup. */
  fallVh: number;
  /** Sidodrift under fallet (px), åt något håll. */
  driftPx: number;
  /** Rotation under fallet (grader). */
  spinDeg: number;
  /** Fördröjd start (s) så regnet sprids ut, inte en enda klump. */
  delay: number;
  /** Total falltid (s). */
  duration: number;
  /** Färg ur hejarklacks-paletten. */
  color: string;
  /** Liten storleksvariation (px) så fältet inte ser maskinellt ut. */
  size: number;
}

/**
 * Deterministisk pseudo-slump ur ett heltals-frö (mulberry32-varianten). Vi vill
 * INTE ha Math.random: konfettin förberäknas via useMemo per firande-key, och en
 * ren funktion gör fältet stabilt under firandets livstid (ingen omberäkning som
 * får bitar att teleportera vid en re-render mitt i animationen).
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bygg konfetti-fältet för ett firande (antal skalar med mål, fryst per key). */
function buildConfetti(totalGoals: number, seed: number): ConfettiPiece[] {
  const count = Math.min(Math.max(totalGoals, 1) * CONFETTI_PER_GOAL, CONFETTI_MAX);
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, id) => ({
    id,
    leftPct: rnd() * 100,
    fallVh: 70 + rnd() * 30,
    driftPx: (rnd() - 0.5) * 220,
    spinDeg: (rnd() - 0.5) * 720,
    delay: rnd() * 0.25,
    duration: 1.1 + rnd() * 0.9,
    color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
    size: 7 + rnd() * 7,
  }));
}

/** Stabilt heltals-frö ur firande-nyckeln (matchId#n), så fältet är deterministiskt. */
function seedFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Konfetti-regnet (renderas bara när rörelse är tillåten). */
function Confetti({ pieces }: { pieces: ConfettiPiece[] }) {
  return (
    <>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 rounded-[2px]"
          style={{
            left: `${p.leftPct}%`,
            width: p.size,
            height: p.size * 0.62,
            backgroundColor: p.color,
          }}
          initial={{ y: '-12vh', opacity: 0, rotate: 0 }}
          animate={{
            y: `${p.fallVh}vh`,
            x: p.driftPx,
            rotate: p.spinDeg,
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.2, 0.6, 0.4, 1],
            opacity: { duration: p.duration, delay: p.delay, times: [0, 0.1, 0.75, 1] },
          }}
        />
      ))}
    </>
  );
}

/** Mål-pop-brickan: fjäder-poppar fram med en gloria, mittpunkt i overlayn. */
function GoalBurst({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.15 }}
      transition={reduceMotion ? { duration: 0.2 } : springs.gentle}
    >
      {/* Strålglorian bakom brickan: en pulserande grön/guld arena-ljus-ring. */}
      {!reduceMotion ? (
        <motion.span
          className="absolute left-1/2 top-1/2 -z-10 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-pill"
          style={{
            background:
              'radial-gradient(circle, rgb(var(--vm-glow-accent) / 0.55), rgb(var(--vm-glow-accent) / 0) 70%)',
          }}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 2.1, opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ) : null}

      {/* Själva brickan: pokal-guld kant, surface-fond, kraftig display-text. */}
      <span
        className="flex items-center gap-2 rounded-pill border px-7 py-3 font-display text-3xl font-bold uppercase tracking-wide shadow-[var(--vm-shadow-raised)] sm:text-4xl"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-surface-raised) 92%, transparent)',
          borderColor: 'color-mix(in srgb, var(--vm-gold) 60%, transparent)',
          color: 'var(--color-fg)',
        }}
      >
        <span aria-hidden="true" style={{ color: 'var(--color-accent)' }}>
          {'⚽'}
        </span>
        <span>Mål!</span>
      </span>
    </motion.div>
  );
}

/**
 * Det kompletta firande-lagret. Tar krokens tillstånd (eller null) och renderar
 * en overlay-explosion när ett firande är aktivt. AnimatePresence ger en mjuk
 * ut-animation när kroken nollar tillståndet (auto-avkling), och `key` på den
 * inre noden (matchId#n) gör att SAMMA match som firas igen re-mountar och
 * spelar om i stället för att klistra.
 *
 * @param celebration Aktivt firande, eller null när inget pågår.
 */
export function GoalCelebrationOverlay({
  celebration,
}: {
  celebration: GoalCelebrationState | null;
}) {
  const reduceMotion = useReducedMotion() ?? false;

  // Förberäkna konfettin per firande-key (fryst under firandets livstid). useMemo
  // får INTE hoppas villkorligt, så vi härleder alltid (tom lista utan firande).
  const confetti = useMemo(
    () =>
      celebration && !reduceMotion
        ? buildConfetti(celebration.totalGoals, seedFromKey(celebration.key))
        : [],
    [celebration, reduceMotion]
  );

  return (
    // aria-hidden på OVERLAYNS EGEN rot (defense-in-depth): "Mål!" är ren visuell
    // fest, aldrig skärmläsar-innehåll, även om lagret någon gång renderas
    // fristående utanför en redan dold container. pointer-events-none gör att
    // den aldrig fångar klick (overlay over hela vyn).
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {celebration ? (
          <motion.div
            key={celebration.key}
            className="absolute inset-0"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {!reduceMotion ? <Confetti pieces={confetti} /> : null}
            <GoalBurst reduceMotion={reduceMotion} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
