import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT, isLastStep, nextStepIndex } from './onboarding';

describe('onboarding, steg-data + gränslogik', () => {
  it('har 2-4 steg (SPEC §12, kort tour) med unika id:n', () => {
    expect(ONBOARDING_STEP_COUNT).toBeGreaterThanOrEqual(2);
    expect(ONBOARDING_STEP_COUNT).toBeLessThanOrEqual(4);
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('varje steg har en rubrik och en förklaring (ingen tom)', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('täcker de fyra hörnen: live, resultatinmatning, what-if, installera', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toContain('live');
    expect(ids).toContain('results');
    expect(ids).toContain('whatif');
    expect(ids).toContain('install');
  });

  it('isLastStep: bara sant på sista index, även på/över randen', () => {
    const last = ONBOARDING_STEP_COUNT - 1;
    expect(isLastStep(0)).toBe(false);
    expect(isLastStep(last - 1)).toBe(false);
    expect(isLastStep(last)).toBe(true);
    // Klampning: ett (felaktigt) index över sista räknas också som sista.
    expect(isLastStep(last + 1)).toBe(true);
  });

  it('nextStepIndex: ökar med ett men klampar vid sista (går aldrig utanför)', () => {
    expect(nextStepIndex(0)).toBe(1);
    const last = ONBOARDING_STEP_COUNT - 1;
    expect(nextStepIndex(last - 1)).toBe(last);
    expect(nextStepIndex(last)).toBe(last);
  });
});
