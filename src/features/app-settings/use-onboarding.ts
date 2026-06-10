// Hook som äger onboarding-tourens RUNTIME-tillstånd: om den ska visas (första
// start), vilket steg, och persistensen av "sedd klart/hoppad". Stegdatan +
// gränslogiken bor i den rena onboarding.ts (DRY).

import { useCallback, useState } from 'react';
import { readStoredFlag, writeStoredFlag } from '../../lib/safe-storage';
import { ONBOARDING_DONE_KEY } from './storage-keys';
import { isLastStep, nextStepIndex } from './onboarding';

export interface OnboardingApi {
  /** true om touren ska visas (inte tidigare avklarad/hoppad). */
  open: boolean;
  /** Aktuellt steg-index (0-baserat). */
  stepIndex: number;
  /** true om aktuellt steg är det sista (knappen blir "Klart"). */
  onLastStep: boolean;
  /** Gå till nästa steg (eller stäng touren om vi är på sista). */
  next: () => void;
  /** Hoppa över / stäng touren helt (markeras som avklarad, visas inte igen). */
  finish: () => void;
}

export function useOnboarding(): OnboardingApi {
  // Lazy-init: visa touren bara om flaggan INTE är satt. En tidigare avklarad
  // tour (eller blockerad storage som ger false vid läsning) hanteras säkert: i
  // värsta fall (storage onåbar) visas touren igen, vilket är ofarligt (KISS),
  // hellre det än att tysta en första-gångs-användare.
  const [open, setOpen] = useState<boolean>(() => !readStoredFlag(ONBOARDING_DONE_KEY));
  const [stepIndex, setStepIndex] = useState(0);

  const finish = useCallback(() => {
    writeStoredFlag(ONBOARDING_DONE_KEY, true);
    setOpen(false);
  }, []);

  const next = useCallback(() => {
    setStepIndex((current) => {
      if (isLastStep(current)) {
        // Sista steget: "Klart" -> stäng + markera avklarad.
        finish();
        return current;
      }
      return nextStepIndex(current);
    });
  }, [finish]);

  return {
    open,
    stepIndex,
    onLastStep: isLastStep(stepIndex),
    next,
    finish,
  };
}
