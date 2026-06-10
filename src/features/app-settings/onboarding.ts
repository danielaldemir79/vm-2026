// Onboarding-touren: REN data + flagg-logik (ingen React). Stegen och regeln
// "visa bara vid första start" enhetstestas utan DOM.
//
// Touren visas EN gång (första start), sen aldrig igen efter att den setts klart
// ELLER hoppats över (en localStorage-flagga). Korta steg som introducerar de fyra
// hörnen av appen, så en vän som öppnar den delade länken förstår vad den gör.

/** Ett steg i touren: en rubrik + en kort förklaring. */
export interface OnboardingStep {
  /** Stabil nyckel (för React-key + ev. test). */
  id: string;
  /** Rubrik (kort). */
  title: string;
  /** Förklaring (en till två meningar). */
  body: string;
}

/**
 * Stegen (2-4, SPEC §12 + T13-direktivet). Ordningen följer hur man möter appen:
 * se det levande, mata in, leka, installera.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'live',
    title: 'Allt lever',
    body: 'Tabeller och slutspelsträd uppdateras direkt när resultat matas in. Följ VM:t i realtid, tillsammans.',
  },
  {
    id: 'results',
    title: 'Mata in resultat',
    body: 'Skriv in mål för spelade matcher. Grupptabellerna och trädet räknas om på en gång.',
  },
  {
    id: 'whatif',
    title: 'Lek med vad-händer-om',
    body: 'Slå på simuleringsläget och spela ut tänkta resultat utan att röra de riktiga. Se hur tabellen och trädet skulle ändras.',
  },
  {
    id: 'install',
    title: 'Installera på hemskärmen',
    body: 'Lägg till appen på hemskärmen för helskärm och snabb åtkomst. Den fungerar även utan nät.',
  },
] as const;

/** Hur många steg touren har (en sanning, härledd ur listan). */
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/**
 * Är detta det SISTA steget? Avgör om knappen säger "Klart" i stället för "Nästa".
 * Ren gränsfunktion (testas direkt på randen).
 */
export function isLastStep(stepIndex: number): boolean {
  return stepIndex >= ONBOARDING_STEP_COUNT - 1;
}

/**
 * Nästa steg-index, klampat så det aldrig går utanför listan. Det sista steget
 * stannar på sig självt (knappen blir "Klart" och stänger touren i stället).
 */
export function nextStepIndex(stepIndex: number): number {
  return Math.min(stepIndex + 1, ONBOARDING_STEP_COUNT - 1);
}
