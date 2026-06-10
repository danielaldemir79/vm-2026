import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.tsx';
import { ThemeProvider, THEME_ATTRIBUTE } from './theme';
import { MotionProvider } from './motion';
import { SettingsProvider } from './features/app-settings';
import { ONBOARDING_DONE_KEY } from './features/app-settings';

// Nollställ delat tema-tillstånd så default-temat (mörkt) gäller oavsett
// testordning, annars kan ett tidigare tests sparade tema läcka in via localStorage.
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  // Markera onboarding-touren som redan sedd (T13): annars öppnar App:n
  // första-gångs-modalen ovanpå skalet, vilket inte är det dessa smoke-tester
  // mäter. Onboardingen testas separat i app-settings/OnboardingDialog.test.tsx.
  window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
});

// Smoke-test för app-skalet: bevisar att foundation-showcasen renderar utan att
// krascha. App konsumerar nu tema-kontexten (tema-toggle) och rörelse-primitiver,
// så testet speglar main.tsx och wrappar i samma providers. Verifierar att skalet
// lever + bär rätt landmärken/namn, inte specifik visuell layout.
function renderApp() {
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <MotionProvider>
          <App />
        </MotionProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

// App monterar nu gruppspelsvyn (T5) + resultatinmatningen (T6), som båda läser
// den delade storens async seedning. Vänta in att den SETTLAT innan testet
// avslutas, annars sker ett state-update efter testet (act-varning + risk för flaky).
//
// VARFÖR loading-TEXTEN och inte role="status" generellt: rubrikerna renderas
// redan i loading-läget, så att vänta på dem bevisar inte att storen bytt state.
// Settled = laddnings-TEXTERNA ("Laddar ...") har FÖRSVUNNIT, dvs storen har gått
// till ready eller error. Vi matchar på texten i stället för role="status"
// eftersom online/offline-indikatorn (T13) bär ett PERMANENT role="status" som
// aldrig försvinner, så en "alla statuses borta"-koll skulle aldrig settla.
async function waitForAppSettled() {
  await waitForElementToBeRemoved(() => {
    const loading = screen.queryAllByText(/Laddar/i);
    return loading.length > 0 ? loading : null;
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
