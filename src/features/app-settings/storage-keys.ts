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
