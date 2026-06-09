import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.tsx';
import { ThemeProvider, THEME_ATTRIBUTE } from './theme';
import { MotionProvider } from './motion';

// Nollställ delat tema-tillstånd så default-temat (mörkt) gäller oavsett
// testordning, annars kan ett tidigare tests sparade tema läcka in via localStorage.
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
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

// App monterar nu gruppspelsvyn (T5), som gör en async datahämtning. Vänta in
// att den settlat innan testet avslutas, annars sker ett state-update efter
// testet (act-varning + risk för flaky). Gruppspels-rubriken signalerar att
// vyn renderat klart.
async function waitForAppSettled() {
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 2, name: /Gruppspelet/i })).toBeInTheDocument();
  });
}

describe('App-skalet', () => {
  it('renderar utan att krascha och visar appens namn som h1', async () => {
    renderApp();

    // Wordmark som h1 bär appens tillgängliga namn och bekräftar att trädet monterades.
    expect(screen.getByRole('heading', { level: 1, name: 'VM 2026' })).toBeInTheDocument();
    await waitForAppSettled();
  });

  it('renderar i ett main-landmark för tillgänglighet', async () => {
    renderApp();

    // Ett main-landmark gör appen navigerbar för skärmläsare från start.
    expect(screen.getByRole('main')).toBeInTheDocument();
    await waitForAppSettled();
  });

  it('exponerar tema-toggle:n så temat kan växlas', async () => {
    renderApp();

    // Toggle:n ska finnas och vara en riktig knapp (a11y).
    expect(screen.getByRole('button', { name: 'Byt till ljust läge' })).toBeInTheDocument();
    await waitForAppSettled();
  });

  it('renderar gruppspelsvyn (T5) med de 12 grupptabellerna', async () => {
    renderApp();

    // Vyn kopplas in i app-skalet och visar gruppspelet, T5:s leverans live.
    await waitForAppSettled();
    await waitFor(() => {
      expect(screen.getAllByRole('table')).toHaveLength(12);
    });
  });
});
