import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RESULT_VIBRATION_MS,
  canPlaySound,
  canVibrate,
  playResultSound,
  triggerResultFeedback,
  vibrateResult,
} from './feedback';

/** Bygg en fejk-navigator med (eller utan) en vibrate-funktion. */
function navWith(vibrate?: (pattern: number | number[]) => boolean): Navigator {
  return { vibrate } as unknown as Navigator;
}

/**
 * Bygg ett fejk-window vars AudioContext-konstruktor returnerar en spårbar graf.
 * En `null`-Ctor simulerar en webbläsare utan Web Audio.
 */
function winWithAudio(supported: boolean): {
  win: Window;
  oscStart: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const oscStart = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  const gainNode = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => ({ connect: vi.fn() })),
  };
  const oscNode = {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(() => gainNode),
    start: oscStart,
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  class FakeAudioContext {
    currentTime = 0;
    createOscillator() {
      return oscNode;
    }
    createGain() {
      return gainNode;
    }
    close = close;
    get destination() {
      return {};
    }
  }
  const win = {
    AudioContext: supported ? FakeAudioContext : undefined,
  } as unknown as Window;
  return { win, oscStart, close };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canVibrate / canPlaySound, capability-gating', () => {
  it('canVibrate är true bara när navigator.vibrate finns', () => {
    expect(canVibrate(navWith(vi.fn()))).toBe(true);
    expect(canVibrate(navWith(undefined))).toBe(false);
  });

  it('canPlaySound är true bara när en AudioContext-konstruktor finns', () => {
    expect(canPlaySound(winWithAudio(true).win)).toBe(true);
    expect(canPlaySound(winWithAudio(false).win)).toBe(false);
  });
});

describe('vibrateResult, AV som standard + capability-gating', () => {
  it('vibrerar INTE när haptik är AV (även om API:t finns)', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    expect(vibrateResult({ haptics: false, sound: false }, navWith(vibrate))).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrerar med rätt mönster när haptik är PÅ och API:t finns', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    expect(vibrateResult({ haptics: true, sound: false }, navWith(vibrate))).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(RESULT_VIBRATION_MS);
  });

  it('vibrerar INTE (no-op) när API:t saknas, även om inställningen är PÅ', () => {
    expect(vibrateResult({ haptics: true, sound: false }, navWith(undefined))).toBe(false);
  });

  it('sväljer ett kast från vibrate (fail loud men inte fatalt)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vibrate = vi.fn(() => {
      throw new Error('vibrate-fel');
    });
    expect(vibrateResult({ haptics: true, sound: false }, navWith(vibrate))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('playResultSound, AV som standard + capability-gating', () => {
  it('spelar INTE när ljud är AV (skapar ingen AudioContext)', () => {
    const { win, oscStart } = winWithAudio(true);
    expect(playResultSound({ haptics: false, sound: false }, win)).toBe(false);
    expect(oscStart).not.toHaveBeenCalled();
  });

  it('spelar en ton när ljud är PÅ och Web Audio finns', () => {
    const { win, oscStart } = winWithAudio(true);
    expect(playResultSound({ haptics: false, sound: true }, win)).toBe(true);
    expect(oscStart).toHaveBeenCalled();
  });

  it('spelar INTE (no-op) när Web Audio saknas, även om inställningen är PÅ', () => {
    const { win } = winWithAudio(false);
    expect(playResultSound({ haptics: false, sound: true }, win)).toBe(false);
  });
});

describe('triggerResultFeedback, den seam vyn anropar', () => {
  it('är helt tyst i standardläget (båda AV), oavsett capabilities', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    const { win, oscStart } = winWithAudio(true);
    const result = triggerResultFeedback(
      { haptics: false, sound: false },
      { nav: navWith(vibrate), win }
    );
    expect(result).toEqual({ vibrated: false, played: false });
    expect(vibrate).not.toHaveBeenCalled();
    expect(oscStart).not.toHaveBeenCalled();
  });

  it('spelar bara de PÅslagna kanalerna oberoende av varandra', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    const { win } = winWithAudio(true);
    // Bara haptik på:
    expect(
      triggerResultFeedback({ haptics: true, sound: false }, { nav: navWith(vibrate), win })
    ).toEqual({ vibrated: true, played: false });
    // Bara ljud på:
    expect(
      triggerResultFeedback({ haptics: false, sound: true }, { nav: navWith(vibrate), win })
    ).toEqual({ vibrated: false, played: true });
    // Båda på:
    expect(
      triggerResultFeedback({ haptics: true, sound: true }, { nav: navWith(vibrate), win })
    ).toEqual({ vibrated: true, played: true });
  });
});
