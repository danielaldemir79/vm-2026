// Enhetstester för useTabRouting (T83, #175): URL <-> aktiv flik i BÅDA riktningar.
//
// Täcker de tre acceptanskriterierna direkt:
//   - DJUPLÄNK VID KALL-LADDNING: en hash satt INNAN hooken monteras ger rätt initial flik.
//   - DELBAR LÄNK / state -> URL: selectTab skriver den kanoniska hashen (#/slug).
//   - BAKÅT-KNAPP: en popstate (webbläsarens back) återställer aktiv flik ur den nya hashen.
//
// jsdom har window.history + location.hash + popstate/hashchange, så hela mekaniken kör
// utan browser. Vi nollställer hashen + history mellan testerna så de inte läcker tillstånd.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTabRouting } from './use-tab-routing';

beforeEach(() => {
  // Rensa hashen till "tom" (kall-laddning på roten) före varje test.
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useTabRouting, URL <-> aktiv flik', () => {
  it('DJUPLÄNK: en hash satt FÖRE montering ger rätt initial flik (kall-laddning)', () => {
    window.history.replaceState(null, '', '#/turnering');
    const { result } = renderHook(() => useTabRouting());
    expect(result.current.activeTab).toBe('turnering');
  });

  it('utan hash faller initial flik till default (Idag) och normaliserar adressfältet', () => {
    const { result } = renderHook(() => useTabRouting());
    expect(result.current.activeTab).toBe('idag');
    // Normaliserad till den kanoniska formen (utan en extra history-post).
    expect(window.location.hash).toBe('#/idag');
  });

  it('DELBAR LÄNK: selectTab uppdaterar state OCH skriver den kanoniska hashen', () => {
    const { result } = renderHook(() => useTabRouting());
    act(() => result.current.selectTab('tips'));
    expect(result.current.activeTab).toBe('tips');
    expect(window.location.hash).toBe('#/tips');
  });

  it('BAKÅT-KNAPP: selectTab skjuter history-poster, popstate återställer föregående flik', () => {
    const { result } = renderHook(() => useTabRouting());
    // Navigera Idag -> Tips -> Topplista (två nya history-poster).
    act(() => result.current.selectTab('tips'));
    act(() => result.current.selectTab('topplista'));
    expect(result.current.activeTab).toBe('topplista');

    // Simulera webbläsarens bakåt-knapp: hashen flyttas tillbaka + popstate fyras.
    // (jsdom kör inte history.back() -> popstate automatiskt, så vi efterliknar det
    // webbläsaren gör: återställ hashen till föregående post och fyra popstate.)
    act(() => {
      window.history.replaceState(null, '', '#/tips');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.activeTab).toBe('tips');
  });

  it('reagerar på en manuell hashändring (hashchange), t.ex. en länk-klick i appen', () => {
    const { result } = renderHook(() => useTabRouting());
    act(() => {
      window.location.hash = '#/mer';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.activeTab).toBe('mer');
  });

  it('selectTab till SAMMA flik skriver ingen ny history-post (idempotent)', () => {
    window.history.replaceState(null, '', '#/idag');
    const { result } = renderHook(() => useTabRouting());
    const before = window.history.length;
    act(() => result.current.selectTab('idag'));
    expect(window.history.length).toBe(before);
    expect(result.current.activeTab).toBe('idag');
  });
});
