import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.tsx';
import { ThemeProvider } from './theme';
import { MotionProvider } from './motion';

// Nollställ delat tema-tillstånd så default-temat (mörkt) gäller oavsett
// testordning, annars kan ett tidigare tests sparade tema läcka in via localStorage.
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

// Smoke-test för app-skalet: bevisar att foundation-showcasen renderar utan att
// krascha. App konsumerar nu tema-kontexten (tema-toggle) och rörelse-primitiver,
// så testet speglar main.tsx och wrappar i samma providers. Verifierar att skalet
// lever + bär rätt landmärken/namn, inte specifik visuell layout.
function renderApp() {
  return render(
    <ThemeProvider>
      <MotionProvider>
        <App />
      </MotionProvider>
    </ThemeProvider>
  );
}

describe('App-skalet', () => {
  it('renderar utan att krascha och visar appens namn som h1', () => {
    renderApp();

    // Wordmark som h1 bär appens tillgängliga namn och bekräftar att trädet monterades.
    expect(screen.getByRole('heading', { level: 1, name: 'VM 2026' })).toBeInTheDocument();
  });

  it('renderar i ett main-landmark för tillgänglighet', () => {
    renderApp();

    // Ett main-landmark gör appen navigerbar för skärmläsare från start.
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('exponerar tema-toggle:n så temat kan växlas', () => {
    renderApp();

    // Toggle:n ska finnas och vara en riktig knapp (a11y).
    expect(screen.getByRole('button', { name: 'Byt till ljust läge' })).toBeInTheDocument();
  });
});
