import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';
import { applyThemeToDocument } from './theme-core';
import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from './theme-constants';

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('ThemeProvider, övertagande av inline-scriptets tema', () => {
  it('tar över exakt det tema som redan satts på <html> (no-flash, ingen omräkning)', () => {
    // Simulera att inline-scriptet redan satt 'light' före React-mount.
    applyThemeToDocument(document, 'light');

    const { result } = renderHook(() => useTheme(), { wrapper });

    // Providern ska LÄSA 'light', inte räkna om till default, det är det som
    // hindrar en flash.
    expect(result.current.theme).toBe('light');
  });

  it('faller till DEFAULT_THEME när inget attribut finns (deterministiskt startläge)', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe(DEFAULT_THEME);
  });
});

describe('ThemeProvider, växling och persistens', () => {
  it('toggleTheme växlar tema OCH speglar till <html> + localStorage', () => {
    applyThemeToDocument(document, 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('setTheme sätter ett specifikt tema och persistar det', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setTheme('light'));

    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('persistar redan vid mount så valet överlever en omladdning', () => {
    applyThemeToDocument(document, 'light');
    renderHook(() => useTheme(), { wrapper });

    // useEffect kör efter render och skriver aktivt tema till storage.
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});

describe('useTheme, fel-väg (fail loud)', () => {
  it('kastar tydligt fel om hooken används utanför ThemeProvider', () => {
    // renderHook utan wrapper => ingen provider => ska kasta, inte tyst default.
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });
});

describe('ThemeProvider, rendering', () => {
  it('renderar sina barn', () => {
    render(
      <ThemeProvider>
        <span>tema-barn</span>
      </ThemeProvider>
    );
    expect(screen.getByText('tema-barn')).toBeInTheDocument();
  });
});
