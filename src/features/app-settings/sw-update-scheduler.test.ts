import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SW_UPDATE_INTERVAL_MS,
  scheduleSwUpdateChecks,
  type UpdatableRegistration,
} from './sw-update-scheduler';

// scheduleSwUpdateChecks startar AKTIVA uppdaterings-kollar (T102): direkt + på intervall +
// vid synlighet/fokus. Testas med fake-timers + en fake-registrering + fake doc/win som
// fångar lyssnare, så hela schemaläggningen körs deterministiskt utan en riktig SW/DOM.

/** En fake doc/win som lagrar event-lyssnare så testet kan fyra dem manuellt. */
function fakeEventTarget(initialVisibility: DocumentVisibilityState = 'visible') {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    visibilityState: initialVisibility,
    addEventListener: vi.fn((type: string, cb: EventListener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(cb);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, cb: EventListener) => {
      listeners.get(type)?.delete(cb);
    }),
    /** Fyra alla lyssnare för en event-typ (testhjälp). */
    fire(type: string) {
      for (const cb of listeners.get(type) ?? []) {
        cb(new Event(type));
      }
    },
    /** Antal kvarvarande lyssnare för en typ (för cleanup-assertion). */
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function fakeRegistration(): UpdatableRegistration & { update: ReturnType<typeof vi.fn> } {
  return { update: vi.fn(async () => undefined) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('scheduleSwUpdateChecks', () => {
  it('kollar EN gång direkt (väntar inte ett helt intervall)', () => {
    const reg = fakeRegistration();
    scheduleSwUpdateChecks(reg, { doc: fakeEventTarget(), win: fakeEventTarget() });
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it('pollar på intervallet medan appen är öppen', () => {
    const reg = fakeRegistration();
    scheduleSwUpdateChecks(reg, {
      intervalMs: 1000,
      doc: fakeEventTarget(),
      win: fakeEventTarget(),
    });
    expect(reg.update).toHaveBeenCalledTimes(1); // direkt-kollen
    vi.advanceTimersByTime(3000);
    expect(reg.update).toHaveBeenCalledTimes(4); // + 3 intervall-tick
  });

  it('kollar när appen blir SYNLIG igen (visibilitychange, visible)', () => {
    const reg = fakeRegistration();
    const doc = fakeEventTarget('visible');
    scheduleSwUpdateChecks(reg, { doc, win: fakeEventTarget() });
    reg.update.mockClear();
    doc.fire('visibilitychange');
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it('kollar INTE när appen blir dold (visibilitychange, hidden)', () => {
    const reg = fakeRegistration();
    const doc = fakeEventTarget('hidden');
    scheduleSwUpdateChecks(reg, { doc, win: fakeEventTarget() });
    reg.update.mockClear();
    doc.fire('visibilitychange');
    expect(reg.update).not.toHaveBeenCalled();
  });

  it('kollar vid fönster-fokus (PWA-återöppning)', () => {
    const reg = fakeRegistration();
    const win = fakeEventTarget();
    scheduleSwUpdateChecks(reg, { doc: fakeEventTarget(), win });
    reg.update.mockClear();
    win.fire('focus');
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it('stoppar (rensar interval + lyssnare) efter cleanup', () => {
    const reg = fakeRegistration();
    const doc = fakeEventTarget();
    const win = fakeEventTarget();
    const stop = scheduleSwUpdateChecks(reg, { intervalMs: 1000, doc, win });
    reg.update.mockClear();
    stop();
    // Inga kvarvarande lyssnare ...
    expect(doc.count('visibilitychange')).toBe(0);
    expect(win.count('focus')).toBe(0);
    // ... och intervallet tickar inte vidare + fyrade events gör inget.
    vi.advanceTimersByTime(5000);
    doc.fire('visibilitychange');
    win.fire('focus');
    expect(reg.update).not.toHaveBeenCalled();
  });

  it('sväljer ett update()-fel (offline/nätglapp ska aldrig kasta)', () => {
    const reg: UpdatableRegistration = {
      update: vi.fn(async () => Promise.reject(new Error('offline'))),
    };
    expect(() =>
      scheduleSwUpdateChecks(reg, { doc: fakeEventTarget(), win: fakeEventTarget() })
    ).not.toThrow();
  });

  it('default-intervallet är en minut (rimlig poll-takt)', () => {
    expect(SW_UPDATE_INTERVAL_MS).toBe(60_000);
  });
});
