// Haptik + ljud-FEEDBACK: korta, diskreta signaler vid målfirande/resultat-spar.
//
// ARBETSDELNING (samma seam-princip som målfirande-kroken): denna fil bär den
// CAPABILITY-GATADE, sido-effekt-isolerade logiken. Den avgör OM en signal får
// spelas (inställning PÅ + API:t finns) och GÖR den (navigator.vibrate / en kort
// Web Audio-ton). Inställningarna (AV som standard) bor i SettingsProvider; vyn
// kopplar `triggerResultFeedback` på den BEFINTLIGA spar-seamen (handleSaved i
// ResultEntryView), invasivt minimum.
//
// VARFÖR AV SOM STANDARD (SPEC §12 + decisions.md): oombedd vibration/ljud är
// påträngande. Användaren slår PÅ det aktivt i inställningarna. Vi gissar aldrig
// att det är önskat.
//
// VARFÖR ljud GENERERAS (ingen asset): en kort ren ton via Web Audio är några
// rader kod och slipper en binär-asset i bundlen (PRINCIPLES §11, KISS/YAGNI).

/** De två feedback-kanalerna, lästa ur inställningarna. */
export interface FeedbackSettings {
  haptics: boolean;
  sound: boolean;
}

/** Vibrations-mönster (ms) för ett sparat resultat: en kort, diskret puls. */
export const RESULT_VIBRATION_MS = 18;

/** Tonens parametrar: en kort, mjuk "plopp" (inte en skarp pip). */
const TONE_FREQUENCY_HZ = 660; // E5, en vänlig mellanton.
const TONE_DURATION_S = 0.12;
const TONE_PEAK_GAIN = 0.07; // Lågt: diskret, aldrig en chock.

/** Stödjer webbläsaren vibration? (Saknas på desktop + iOS Safari.) */
export function canVibrate(nav: Navigator = navigator): boolean {
  return typeof nav.vibrate === 'function';
}

/** Finns en Web Audio-konstruktor? (Bred support, men gata defensivt.) */
export function canPlaySound(win: Window = window): boolean {
  return typeof resolveAudioContext(win) === 'function';
}

/**
 * Hämta AudioContext-konstruktorn (med webkit-prefix-fallback) eller undefined.
 *
 * Vi vidgar Window-typen med BÅDA egenskaperna som optional: AudioContext finns
 * inte deklarerad på Window i alla DOM-lib-konfigurationer (bara som global typ),
 * och webkitAudioContext är icke-standard. Att läsa dem optional gör grinden
 * defensiv utan att lita på en specifik lib.dom-variant.
 */
function resolveAudioContext(win: Window): typeof AudioContext | undefined {
  const w = win as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * Vibrera en kort puls OM haptik är PÅ och API:t finns. No-op annars (tyst, men
 * inte maskerande: frånvaron av vibration är det förväntade när stödet saknas).
 *
 * @returns true om en vibration faktiskt utlöstes, annars false (för test).
 */
export function vibrateResult(settings: FeedbackSettings, nav: Navigator = navigator): boolean {
  if (!settings.haptics || !canVibrate(nav)) {
    return false;
  }
  try {
    return nav.vibrate(RESULT_VIBRATION_MS);
  } catch (error) {
    // Fail loud (synligt) men inte fatalt: en vibration som kastar ska aldrig
    // stoppa själva resultat-sparandet.
    console.warn('Kunde inte vibrera:', error);
    return false;
  }
}

/**
 * Spela en kort, mjuk ton OM ljud är PÅ och Web Audio finns. Tonen genereras
 * programmatiskt (oscillator + gain-envelope), ingen ljud-asset. No-op annars.
 *
 * @returns true om ett ljud faktiskt startades, annars false (för test).
 */
export function playResultSound(settings: FeedbackSettings, win: Window = window): boolean {
  if (!settings.sound) {
    return false;
  }
  const Ctor = resolveAudioContext(win);
  if (Ctor === undefined) {
    return false;
  }
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = TONE_FREQUENCY_HZ;
    // Envelope: snabb attack, mjuk avklingning (en "plopp", inte en pip-svans).
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(TONE_PEAK_GAIN, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + TONE_DURATION_S);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + TONE_DURATION_S);
    // Stäng kontexten när tonen är klar så vi inte läcker AudioContext-instanser.
    osc.onended = () => {
      void ctx.close().catch(() => {
        // Redan stängd/ej stödd: ofarligt, inget att göra.
      });
    };
    return true;
  } catch (error) {
    console.warn('Kunde inte spela ljud:', error);
    return false;
  }
}

/**
 * Den enda seam vyn anropar: spela BÅDA aktiverade kanalerna vid ett sparat
 * resultat. Var och en gatas internt, så anroparen behöver inte veta något om
 * capabilities eller inställningar.
 *
 * @returns vilka kanaler som faktiskt utlöstes (för test).
 */
export function triggerResultFeedback(
  settings: FeedbackSettings,
  deps: { nav?: Navigator; win?: Window } = {}
): { vibrated: boolean; played: boolean } {
  const vibrated = vibrateResult(settings, deps.nav);
  const played = playResultSound(settings, deps.win);
  return { vibrated, played };
}
