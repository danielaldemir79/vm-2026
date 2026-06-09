// Central a11y-grind för all rörelse.
//
// MotionConfig med reducedMotion="user" gör att ALLA motion-komponenter under
// trädet automatiskt respekterar OS-inställningen "minska rörelse": transform-
// och layout-animationer stängs av, medan ofarliga opacitets-/färg-övergångar
// får vara kvar. Det är den breda, deklarativa a11y-grinden (WCAG 2.3.3). De
// enskilda primitiverna (Slide m.fl.) gör dessutom egna byten via
// useReducedMotion för att helt undvika rörelse där det behövs, dubbelt skydd.

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

interface MotionProviderProps {
  children: ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
