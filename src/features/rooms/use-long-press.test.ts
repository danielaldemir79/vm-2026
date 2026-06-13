// Tester för useLongPress (T74, #157): long-press-MEKANIKEN i jsdom (inte pixel-position).
// pointerdown startar timern; pointerup FÖRE tröskeln = tap (ingen popover, ingen
// suppression); EFTER tröskeln = långtryck (active=true, onLongPress); släpp döljer +
// sväljer nästa click; pointerleave/cancel avbryter; unmount rensar timern.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLongPress, LONG_PRESS_THRESHOLD_MS } from './use-long-press';

// En minimal pointer-event-stub (hooken läser inga fält ur den, bara handlern anropas).
const evt = {} as React.PointerEvent;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLongPress , tröskeln', () => {
  it('default-tröskeln är 500 ms (standard long-press, dokumenterad i decisions.md)', () => {
    expect(LONG_PRESS_THRESHOLD_MS).toBe(500);
  });

  it('pointerdown startar en timer; active blir true FÖRST när tröskeln passeras', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress, thresholdMs: 500 }));

    act(() => result.current.handlers.onPointerDown(evt));
    expect(result.current.active).toBe(false); // inte än
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(499));
    expect(result.current.active).toBe(false); // en ms kvar

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.active).toBe(true); // tröskeln nådd
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

describe('useLongPress , tap vs långtryck', () => {
  it('pointerup FÖRE tröskeln = tap: ingen popover, ingen click-suppression', () => {
    const onLongPress = vi.fn();
    const onRelease = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress, onRelease, thresholdMs: 500 }));

    act(() => result.current.handlers.onPointerDown(evt));
    act(() => vi.advanceTimersByTime(200)); // släpp tidigt
    act(() => result.current.handlers.onPointerUp(evt));

    expect(result.current.active).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled(); // onRelease körs bara om det var ett långtryck
    expect(result.current.suppressNextClick).toBe(false); // tap -> click går igenom

    // Timern ska vara rensad: en advance efter släppet får inte trigga långtryck.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.active).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('pointerup EFTER tröskeln = långtryck: släppet döljer + sväljer nästa click', () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() => useLongPress({ onRelease, thresholdMs: 500 }));

    act(() => result.current.handlers.onPointerDown(evt));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.active).toBe(true);

    act(() => result.current.handlers.onPointerUp(evt));
    expect(result.current.active).toBe(false); // släppt -> dold
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(result.current.suppressNextClick).toBe(true); // håll-gesten ska INTE togglas

    // En NY gest nollställer suppressionen (svälj gäller bara click:et efter släppet).
    act(() => result.current.handlers.onPointerDown(evt));
    expect(result.current.suppressNextClick).toBe(false);
  });
});

describe('useLongPress , avbryt-vägar', () => {
  it('pointerleave under hållet avbryter timern (inget långtryck)', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress, thresholdMs: 500 }));

    act(() => result.current.handlers.onPointerDown(evt));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.handlers.onPointerLeave(evt));

    act(() => vi.advanceTimersByTime(1000)); // tröskeln skulle passerats
    expect(result.current.active).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('pointercancel under ett pågående långtryck döljer det (onRelease)', () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() => useLongPress({ onRelease, thresholdMs: 500 }));

    act(() => result.current.handlers.onPointerDown(evt));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.active).toBe(true);

    act(() => result.current.handlers.onPointerCancel(evt));
    expect(result.current.active).toBe(false);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('ett nytt pointerdown rensar en föregående timer (staplar inte långtryck)', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress, thresholdMs: 500 }));

    act(() => result.current.handlers.onPointerDown(evt));
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.handlers.onPointerDown(evt)); // ny gest, gamla timern ska rensas
    act(() => vi.advanceTimersByTime(400)); // 800 ms sedan FÖRSTA, men bara 400 sedan andra
    expect(onLongPress).not.toHaveBeenCalled(); // andra timern ej i mål än

    act(() => vi.advanceTimersByTime(100)); // 500 ms sedan andra
    expect(onLongPress).toHaveBeenCalledTimes(1); // exakt EN gång (gamla timern rensades)
  });
});

describe('useLongPress , städning', () => {
  it('unmount under ett pågående håll rensar timern (ingen callback efter unmount)', () => {
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress({ onLongPress, thresholdMs: 500 }));

    act(() => result.current.handlers.onPointerDown(evt));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
