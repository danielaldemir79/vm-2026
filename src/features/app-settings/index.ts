// Publik yta för app-settings-modulen (T13, issue #13): installation, onboarding,
// offline-indikator och haptik/ljud-inställningar. App importerar härifrån så
// intern struktur kan ändras utan att bryta call-sites.

// Inställnings-provider + konsument-hook (haptik + ljud, AV som standard).
export { SettingsProvider } from './SettingsProvider';
export { useAppSettings, useFeedbackSettings } from './settings-context';
export type { AppSettings } from './settings-context';

// Feedback-seam (ren, capability-gatad): kopplas på den befintliga spar-seamen.
export {
  triggerResultFeedback,
  vibrateResult,
  playResultSound,
  canVibrate,
  canPlaySound,
  RESULT_VIBRATION_MS,
} from './feedback';
export type { FeedbackSettings } from './feedback';

// Inställnings-kontroll (kugghjul + dialog).
export { SettingsControl } from './SettingsControl';

// Installations-prompt (ren logik + hook + banner).
export { resolveInstallMode, detectStandalone, detectIos } from './install-prompt';
export type { InstallUiMode, InstallContext } from './install-prompt';
export { useInstallPrompt } from './use-install-prompt';
export type { InstallPromptApi } from './use-install-prompt';
export { InstallBanner } from './InstallBanner';
// Tidig beforeinstallprompt-fångst, registreras från main.tsx FÖRE React-mount
// (T39/#68: annars tappas ett tidigt event och install-knappen gör inget).
export { registerInstallPromptCapture } from './install-prompt-capture';

// Onboarding-tour (ren steg-data + hook + dialog).
export { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT, isLastStep, nextStepIndex } from './onboarding';
export type { OnboardingStep } from './onboarding';
export { useOnboarding } from './use-onboarding';
export type { OnboardingApi } from './use-onboarding';
export { OnboardingDialog } from './OnboardingDialog';

// Online/offline-status (hook + indikator).
export { useOnlineStatus } from './use-online-status';
export { OnlineStatusIndicator } from './OnlineStatusIndicator';

// PWA-uppdatering (T43/#74): "ny version finns"-prompt. Logiken (use-app-update)
// tar en injicerbar SW-registrerare så den är testbar utan virtual:pwa-register.
export { useAppUpdate } from './use-app-update';
export type { AppUpdateApi } from './use-app-update';
export { UpdatePrompt } from './UpdatePrompt';
export { registerAppSw } from './register-sw';
export type { RegisterAppSw, AppSwCallbacks } from './register-sw';

// Persistens-nycklar (exporteras så App-/integrationstester kan sätta dem för
// att försätta appen i ett känt läge, t.ex. onboarding redan sedd).
export { INSTALL_DISMISSED_KEY, ONBOARDING_DONE_KEY, HAPTICS_KEY, SOUND_KEY } from './storage-keys';
