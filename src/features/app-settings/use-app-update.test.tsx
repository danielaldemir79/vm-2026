import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAppUpdate } from './use-app-update';
import type { AppSwCallbacks, RegisterAppSw } from './register-sw';

// FAKE register: kapslar exakt det otestbara seam:et (virtual:pwa-register). Den
// fångar callbacks så testet kan FYRA onNeedRefresh/onOfflineReady som om en ny SW
// dykt upp, och spionerar på updateSW(reloadPage) som prompten anropar. Så hela
// hookens logik körs utan att den virtuella modulen någonsin importeras.
function makeFakeRegister() {
  let captured: AppSwCallbacks | null = null;
  const updateSW = vi.fn(async (): Promise<void> => {});
  const register: RegisterAppSw = (callbacks) => {
    captured = callbacks;
    return updateSW;
  };
  return {
    register,
    updateSW,
    fireNeedRefresh: () => captured?.onNeedRefresh(),
    fireOfflineReady: () => captured?.onOfflineReady(),
  };
}

describe('useAppUpdate, prompt-tillstånd via injicerad SW-registrerare', () => {
  it('startar utan prompt (varken ny version eller offline-redo)', () => {
    const fake = makeFakeRegister();
    const { result } = renderHook(() => useAppUpdate(fake.register));
    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);
  });

  it('sätter needRefresh när onNeedRefresh fyrar (en ny version väntar)', () => {
    const fake = makeFakeRegister();
    const { result } = renderHook(() => useAppUpdate(fake.register));
    act(() => fake.fireNeedRefresh());
    expect(result.current.needRefresh).toBe(true);
  });

  it('sätter offlineReady när onOfflineReady fyrar (engångs-info)', () => {
    const fake = makeFakeRegister();
    const { result } = renderHook(() => useAppUpdate(fake.register));
    act(() => fake.fireOfflineReady());
    expect(result.current.offlineReady).toBe(true);
  });

  it('updateApp() anropar updateSW(true) (aktivera väntande SW + ladda om) och döljer prompten', () => {
    const fake = makeFakeRegister();
    const { result } = renderHook(() => useAppUpdate(fake.register));
    act(() => fake.fireNeedRefresh());
    expect(result.current.needRefresh).toBe(true);

    act(() => result.current.updateApp());
    expect(fake.updateSW).toHaveBeenCalledWith(true);
    // Prompten döljs direkt (responsiv knapp), reload sköts av updateSW.
    expect(result.current.needRefresh).toBe(false);
  });

  // Copilot R5: kan BÅDA flaggorna vara satta i samma sid-laddning (förstagångs-
  // install som står öppen tills en ny version dyker upp) ska updateApp() nolla
  // bägge, annars växlar prompten över till offline-redo-beskedet i stället för
  // att försvinna när användaren just bett om att uppdatera.
  it('updateApp() nollar BÅDE needRefresh OCH offlineReady (ingen kvarliggande fel-signal)', () => {
    const fake = makeFakeRegister();
    const { result } = renderHook(() => useAppUpdate(fake.register));
    act(() => {
      fake.fireOfflineReady();
      fake.fireNeedRefresh();
    });
    expect(result.current.offlineReady).toBe(true);
    expect(result.current.needRefresh).toBe(true);

    act(() => result.current.updateApp());
    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);
  });

  it('dismiss() stänger prompten utan att uppdatera (updateSW orörd)', () => {
    const fake = makeFakeRegister();
    const { result } = renderHook(() => useAppUpdate(fake.register));
    act(() => fake.fireNeedRefresh());

    act(() => result.current.dismiss());
    expect(result.current.needRefresh).toBe(false);
    expect(fake.updateSW).not.toHaveBeenCalled();
  });

  it('dismiss() stänger även offline-redo-beskedet', () => {
    const fake = makeFakeRegister();
    const { result } = renderHook(() => useAppUpdate(fake.register));
    act(() => fake.fireOfflineReady());

    act(() => result.current.dismiss());
    expect(result.current.offlineReady).toBe(false);
  });

  it('registrerar SW:n exakt EN gång (mount), inte per omrendering', () => {
    const register = vi.fn<RegisterAppSw>(() => vi.fn(async () => {}));
    const { rerender } = renderHook(() => useAppUpdate(register));
    rerender();
    rerender();
    expect(register).toHaveBeenCalledTimes(1);
  });
});
