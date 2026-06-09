// Rörelse-presets: easing och timing isolerade på EN plats.
//
// ÄGARSKAP: STRUKTUREN (vilka presets finns, hur primitiverna konsumerar dem)
// ägs av motorn (T2). Den exakta easing-/timing-PERSONLIGHETEN (hur "snärtig"
// eller "mjuk" rörelsen känns) finjusteras av design-frontend-agenten, den får
// byta värdena här utan att röra primitiv-komponenterna.
//
// SPEC §7: mjuka animationer, levande men inte stökigt.

import type { Transition } from 'motion/react';

/**
 * Standard tweens (design-personlighet, T2).
 *
 * Karaktären: självsäker och "levande" utan att kännas slö. Båda kurvorna
 * använder en expo-ut-känsla (snabb start, mjuk landning) , materialet rör sig
 * beslutsamt och bromsar elegant, vilket läser som premium snarare än trögt.
 */
export const transitions = {
  /** Mjuk standard-övergång för opacitet/position. Lite kvickare än default. */
  smooth: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
  /** Snärtig för små UI-svar (toggle, hover, knapp). */
  quick: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
} as const satisfies Record<string, Transition>;

/**
 * Spring-presets (design-personlighet, T2).
 *
 * "gentle" är vardags-fjädern: levande men kontrollerad, inget skräp-studs.
 * Lite lägre damping och högre stiffness än default ger en aning mer "snärt"
 * på fram-poppande element (matchkort, badges) , det trendiga, taktila intrycket
 * SPEC §1 efterfrågar, utan att bli stökigt.
 */
export const springs = {
  /** Levande men kontrollerad, för fram-poppande element. */
  gentle: { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 },
} as const satisfies Record<string, Transition>;

/**
 * Standard-förskjutning (px) för Slide innan den glider in. Isolerad här så
 * design kan justera "hur långt" elementet reser. Lite längre resa = tydligare
 * riktningskänsla i inglidningen.
 */
export const SLIDE_OFFSET_PX = 20;
