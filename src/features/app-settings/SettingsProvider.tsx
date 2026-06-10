// Provider för app-inställningarna (haptik + ljud). Persistens i localStorage via
// den delade safe-storage-hjälparen (robust mot blockerad/privat storage, T2-
// mönstret). BÅDA inställningarna är AV som standard (SPEC §12): frånvaro av
// flaggan = av, så en ny användare får aldrig oombedd vibration/ljud.
//
// Mönstret speglar ThemeProvider: lazy-init från storage, persistera vid varje
// uttryckligt val (det ENDA stället ett val skrivs).

import { useCallback, useState, type ReactNode } from 'react';
import { readStoredFlag, writeStoredFlag } from '../../lib/safe-storage';
import { SettingsContext } from './settings-context';
import { HAPTICS_KEY, SOUND_KEY } from './storage-keys';

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  // Lazy-init: läs en gång vid mount. En frånvarande flagga -> false (av), så
  // standardläget är medvetet tyst.
  const [haptics, setHapticsState] = useState<boolean>(() => readStoredFlag(HAPTICS_KEY));
  const [sound, setSoundState] = useState<boolean>(() => readStoredFlag(SOUND_KEY));

  // Persistera vid uttryckligt val (utanför setState-updatern, så StrictMode:s
  // dubbel-körning inte skriver två gånger, samma kontrakt som ThemeProvider).
  const setHaptics = useCallback((on: boolean) => {
    writeStoredFlag(HAPTICS_KEY, on);
    setHapticsState(on);
  }, []);

  const setSound = useCallback((on: boolean) => {
    writeStoredFlag(SOUND_KEY, on);
    setSoundState(on);
  }, []);

  return (
    <SettingsContext.Provider value={{ haptics, sound, setHaptics, setSound }}>
      {children}
    </SettingsContext.Provider>
  );
}
