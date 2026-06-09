import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
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

// App monterar nu gruppspelsvyn (T5) + resultatinmatningen (T6), som båda läser
// den delade storens async seedning. Vänta in att den SETTLAT innan testet
// avslutas, annars sker ett state-update efter testet (act-varning + risk för flaky).
//
// VARFÖR loading-indikatorerna och inte rubriken: rubrikerna renderas redan i
// loading-läget, så att vänta på dem bevisar inte att storen hunnit byta state.
// Settled = laddnings-indikatorerna (role="status") har FÖRSVUNNIT, dvs storen
// har gått till ready eller error. Det finns NU två status-element i loading
// (gruppspel + resultatinmatning), så vi väntar tills BÅDA är borta via
// queryAllByRole (queryByRole skulle kasta på flera träffar).
async function waitForAppSettled() {
  await waitForElementToBeRemoved(() => {
    const statuses = screen.queryAllByRole('status');
    return statuses.length > 0 ? statuses : null;
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
