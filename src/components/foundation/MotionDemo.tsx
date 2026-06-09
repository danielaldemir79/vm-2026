// Rörelse-demo för foundation-showcasen (T2).
// En liten "spela upp"-yta så Daniel KÄNNER rörelse-personligheten live: ett
// kort poppar in med Spring + Slide via ett re-mount-trick (key byts). Detta
// demonstrerar bara känslan, det är INTE en riktig matchvy (de byggs i T7+).

import { useState } from 'react';
import { Slide, Spring } from '../../motion';

export function MotionDemo() {
  // Att byta key tvingar fram en ny mount, så in-animationen spelas om vid klick.
  const [run, setRun] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <Spring key={run}>
        {/* Smakprov av ett matchkort, bara för att visa form + rörelse. */}
        <div className="rounded-card border border-border bg-surface-raised p-5 shadow-[var(--vm-shadow-card)]">
          <div className="flex items-center justify-between text-sm text-fg-muted">
            <span>Grupp A</span>
            <span>21:00 · SVT1</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="font-display text-lg font-semibold">Lag A</span>
            <span className="rounded-md bg-bg px-3 py-1 font-display text-xl font-bold tabular-nums">
              2 - 1
            </span>
            <span className="font-display text-lg font-semibold">Lag B</span>
          </div>
          <Slide direction="up" className="mt-3 text-sm text-accent">
            Vidare till slutspel
          </Slide>
        </div>
      </Spring>

      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        className="self-start rounded-pill bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-fg shadow-md transition-transform duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0"
      >
        Spela upp rörelsen igen
      </button>
    </div>
  );
}
