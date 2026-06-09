// Fade-primitiv: tonar in/ut innehåll via opacitet.
//
// Opacitet är säkert även vid reducerad rörelse (det är inte "rörelse" i den
// vestibulära mening prefers-reduced-motion skyddar mot), så Fade behåller sin
// effekt i båda lägena, det är medvetet och WCAG-förenligt.

import { motion, type HTMLMotionProps } from 'motion/react';
import { transitions } from './motion-presets';

type FadeProps = HTMLMotionProps<'div'>;

/**
 * Tonar in barnen vid mount. Alla motion-props kan överskridas av anroparen
 * (design), så detta är en rimlig standard, inte ett tvång.
 */
export function Fade({ children, initial, animate, exit, transition, ...rest }: FadeProps) {
  return (
    <motion.div
      initial={initial ?? { opacity: 0 }}
      animate={animate ?? { opacity: 1 }}
      exit={exit ?? { opacity: 0 }}
      transition={transition ?? transitions.smooth}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
