// EN sanning för app-settings-modulens localStorage-nycklar.
//
// Varför samlade: onboarding-flaggan och haptik/ljud-inställningarna persistas alla i
// localStorage. Att hålla nycklarna på ETT ställe (med samma `vm2026-`-prefix som
// THEME_STORAGE_KEY) hindrar att en nyckel stavas olika på läs- och skriv-sidan (en
// klass av tysta buggar).

/** Användaren har sett klart (eller hoppat över) onboarding-touren. */
export const ONBOARDING_DONE_KEY = 'vm2026-onboarding-done';

/** Haptik (vibration) påslagen. AV som standard (frånvaro = av). */
export const HAPTICS_KEY = 'vm2026-haptics';

/** Ljud-effekter påslagna. AV som standard (frånvaro = av). */
export const SOUND_KEY = 'vm2026-sound';

/**
 * Användaren har öppnat en "Se höjdpunkter"-länk minst en gång (per enhet). Driver
 * att NYTT-badgen på höjdpunkts-pillen FÖRSVINNER efter första klicket: NYTT visas
 * bara så länge funktionen är ny (tidsfönstret) OCH användaren ännu inte klickat.
 * Frånvaro = inte klickat = badgen får visas (inom fönstret). 14-dagars-auto-bort
 * (isHighlightsFeatureNew) är kvar som backup för den som aldrig klickar.
 */
export const HIGHLIGHTS_SEEN_KEY = 'vm2026-highlights-seen';
