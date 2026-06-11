import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAppSw, type AppSwCallbacks } from './register-sw';

// register-sw.ts är AVSIKTLIGT en tunn seam mot den otestbara virtuella modulen
// `virtual:pwa-register`. Det vi DÅ kan (och måste) testa är fel-vägen: en
// misslyckad import får inte krascha appen OCH får inte sväljas tyst , den ska
// loggas (PRINCIPLES §8 fail-loud). Vi injicerar därför en kastande modul-importör
// så catch-grenen körs utan att den virtuella modulen behöver lösas i Vitest.

const noopCallbacks: AppSwCallbacks = {
  onNeedRefresh: () => {},
  onOfflineReady: () => {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerAppSw, fel-vägen vid misslyckad SW-registrering', () => {
  it('loggar en [VM2026]-varning i stället för att svälja felet tyst', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const boom = new Error('virtual:pwa-register saknas');

    registerAppSw(noopCallbacks, () => Promise.reject(boom));

    // Loggningen sker i en avvisad promises catch (mikrotask), så vänta in den.
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    const [message, logged] = warn.mock.calls[0];
    expect(message).toContain('[VM2026]');
    // Det faktiska felet ska följa med, inte maskeras bort.
    expect(logged).toBe(boom);
  });

  it('kraschar inte och returnerar en anropbar no-op när importen kastar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Får inte kasta synkront vid registreringen.
    const updateSW = registerAppSw(noopCallbacks, () => Promise.reject(new Error('nej')));

    // updateSW är en stabil funktion direkt (delegerar till en no-op tills/om en
    // riktig SW registrerats). Den ska kunna anropas utan att kasta.
    expect(typeof updateSW).toBe('function');
    await expect(updateSW(true)).resolves.toBeUndefined();
  });
});
