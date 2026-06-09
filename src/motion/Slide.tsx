// Slide-primitiv: glider in innehåll från en riktning + tonar in.
//
// A11y: transform-rörelsen (x/y) är just det prefers-reduced-motion skyddar
// mot. Vi tar INTE bara MotionConfig-grinden för givet utan nollställer
// förskjutningen explicit via useReducedMotion, så att elementet vid reducerad
// rörelse bara tonar in (opacitet) helt utan att resa, ett deterministiskt och
// testbart beteende.

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { SLIDE_OFFSET_PX, transitions } from './motion-presets';

type SlideDirection = 'up' | 'down' | 'left' | 'right';

interface SlideOwnProps {
  /** Från vilken riktning elementet glider in. Default: 'up'. */
  direction?: SlideDirection;
  /** Förskjutning i px innan inglidning. Default: SLIDE_OFFSET_PX. */
  offset?: number;
}

type SlideProps = SlideOwnProps & HTMLMotionProps<'div'>;

/** Översätt riktning + förskjutning till start-transform. */
function offsetFor(direction: SlideDirection, offset: number): { x?: number; y?: number } {
  switch (direction) {
    case 'up':
      return { y: offset };
    case 'down':
      return { y: -offset };
    case 'left':
      return { x: offset };
    case 'right':
      return { x: -offset };
  }
}

export function Slide({
  direction = 'up',
  offset = SLIDE_OFFSET_PX,
  children,
  initial,
  animate,
  exit,
  transition,
  ...rest
}: SlideProps) {
  const shouldReduceMotion = useReducedMotion();

  // Vid reducerad rörelse: ingen förskjutning, bara opacitet. Detta gäller BÅDE
  // start- och slut-målet: hade animate hårdkodat x/y=0 skulle transform-props
  // appliceras ändå och bryta a11y-kontraktet (bara tona in, aldrig resa).
  const from = shouldReduceMotion ? {} : offsetFor(direction, offset);
  const to = shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 };

  return (
    <motion.div
      initial={initial ?? { opacity: 0, ...from }}
      animate={animate ?? to}
      exit={exit ?? { opacity: 0, ...from }}
      transition={transition ?? transitions.smooth}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
