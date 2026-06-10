// Context-objektet + konsument-hook för app-inställningarna (haptik + ljud).
// Skild fil från providern så fast-refresh inte varnar (samma mönster som
// theme-context) och så konsumenter kan importera hooken utan providern.

import { createContext, useContext } from 'react';
import type { FeedbackSettings } from './feedback';

/** Standard-feedback: helt tyst (båda AV), SPEC §12. EN sanning för defaulten. */
const SILENT_FEEDBACK: FeedbackSettings = { haptics: false, sound: false };

export interface AppSettings extends FeedbackSettings {
  /** Slå PÅ/AV haptik (persistas). */
  setHaptics: (on: boolean) => void;
  /** Slå PÅ/AV ljud (persistas). */
  setSound: (on: boolean) => void;
}

// undefined som default avslöjar en saknad provider (fail loud i useAppSettings).
export const SettingsContext = createContext<AppSettings | undefined>(undefined);

/**
 * Läs app-inställningarna OCH setter:na (för inställnings-UI:t). Kastar om den
 * används utanför SettingsProvider, så ett felaktigt komponentträd upptäcks
 * direkt i stället för en tyst undefined. Använd denna i kontroller som FAKTISKT
 * behöver kunna ÄNDRA inställningarna (SettingsControl).
 */
export function useAppSettings(): AppSettings {
  const ctx = useContext(SettingsContext);
  if (ctx === undefined) {
    throw new Error('useAppSettings måste användas inom en SettingsProvider');
  }
  return ctx;
}

/**
 * Läs BARA feedback-värdena (haptik/ljud), TOLERANT mot en saknad provider.
 *
 * VARFÖR tolerant här (till skillnad från useAppSettings): haptik/ljud är ren
 * VALBAR glädje-/bekräftelse-yta (samma klass som det valfria målfirandet via
 * renderCelebration). En konsument som ResultEntryView ska fungera fullt ut utan
 * att TVINGAS känna till settings-providern, exakt som inmatningen fungerar utan
 * firande-lagret. Saknas providern faller vi till det SÄKRA, tysta standardläget
 * (båda AV) i stället för att krascha en kärn-vy på en valfri yta. Setter:na
 * (som verkligen kräver providern) nås via useAppSettings.
 */
export function useFeedbackSettings(): FeedbackSettings {
  const ctx = useContext(SettingsContext);
  if (ctx === undefined) {
    return SILENT_FEEDBACK;
  }
  return { haptics: ctx.haptics, sound: ctx.sound };
}
