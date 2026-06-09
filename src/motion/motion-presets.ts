// Rörelse-presets: easing och timing isolerade på EN plats.
//
// ÄGARSKAP: STRUKTUREN (vilka presets finns, hur primitiverna konsumerar dem)
// ägs av motorn (T2). Den exakta easing-/timing-PERSONLIGHETEN (hur "snärtig"
// eller "mjuk" rörelsen känns) finjusteras av design-frontend-agenten, den får
// byta värdena här utan att röra primitiv-komponenterna.
//
// SPEC §7: mjuka animationer, levande men inte stökigt.

import type { Transition } from 'motion/react';

/** Standard tweens (PLATSHÅLLARE-personlighet, design finjusterar). */
export const transitions = {
  /** Mjuk standard-övergång för opacitet/position. */
  smooth: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  /** Snabbare för små UI-svar. */
  quick: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
} as const satisfies Record<string, Transition>;

/** Spring-preset (PLATSHÅLLARE, design finjusterar stiffness/damping). */
export const springs = {
  /** Levande men kontrollerad, för fram-poppande element. */
  gentle: { type: 'spring', stiffness: 260, damping: 26 },
} as const satisfies Record<string, Transition>;

/**
 * Standard-förskjutning (px) för Slide innan den glider in. Isolerad här så
 * design kan justera "hur långt" elementet reser.
 */
export const SLIDE_OFFSET_PX = 16;
