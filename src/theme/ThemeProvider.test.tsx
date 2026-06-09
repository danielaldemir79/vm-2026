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

  it('setTheme sätter ett specifikt tema OCH speglar till <html> + localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setTheme('light'));

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('persistar INTE vid mount utan interaktion (appen följer systemet, sparar inget)', () => {
    // Inline-scriptet har satt 'light' (system-resolverat), men användaren har
    // inte valt något. Mount/sync får då INTE skriva till localStorage, annars
    // tar inline-scriptet alltid sparat-grenen och OS-temat slutar gälla live.
    applyThemeToDocument(document, 'light');
    renderHook(() => useTheme(), { wrapper });

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('speglar aktivt tema till <html> vid mount utan att persistera (DOM-spegling intakt)', () => {
    // DOM-spegling (applyThemeToDocument) ska fortsätta vid varje ändring,
    // inklusive den initiala synken, det är BARA persistensen som flyttats ut.
    applyThemeToDocument(document, 'light');
    renderHook(() => useTheme(), { wrapper });

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
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
