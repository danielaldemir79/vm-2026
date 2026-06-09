// Spring-primitiv: poppar in innehåll med en fjäder-känsla (skala + opacitet).
//
// A11y: skal-/transform-rörelsen nollställs vid reducerad rörelse (samma
// princip som Slide), elementet tonar då bara in utan att poppa/skala.

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { springs, transitions } from './motion-presets';

interface SpringOwnProps {
  /** Start-skala innan inpopp. Default: 0.96. */
  fromScale?: number;
}

type SpringProps = SpringOwnProps & HTMLMotionProps<'div'>;

export function Spring({
  fromScale = 0.96,
  children,
  initial,
  animate,
  exit,
  transition,
  ...rest
}: SpringProps) {
  const shouldReduceMotion = useReducedMotion();

  // Vid reducerad rörelse: ingen skal-pop, bara opacitet, och en mjuk tween
  // i stället för spring (en spring på enbart opacitet är onödig).
  const fromScaleProp = shouldReduceMotion ? {} : { scale: fromScale };
  const toScaleProp = shouldReduceMotion ? {} : { scale: 1 };

  return (
    <motion.div
      initial={initial ?? { opacity: 0, ...fromScaleProp }}
      animate={animate ?? { opacity: 1, ...toScaleProp }}
      exit={exit ?? { opacity: 0, ...fromScaleProp }}
      transition={transition ?? (shouldReduceMotion ? transitions.smooth : springs.gentle)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
