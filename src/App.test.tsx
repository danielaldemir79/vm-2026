import { act, render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.tsx';
import { ThemeProvider, THEME_ATTRIBUTE } from './theme';
import { MotionProvider } from './motion';
import { SettingsProvider } from './features/app-settings';
import { ONBOARDING_DONE_KEY } from './features/app-settings';
import {
  registerInstallPromptCapture,
  resetInstallPromptCaptureForTest,
} from './features/app-settings/install-prompt-capture';

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

  it('visar upphovs-signaturen "Made by Daniel Aldemir" i footern (T38, #67)', async () => {
    const { container } = renderApp();

    // Render-test (inte bara en konstant): bevisar att signaturen faktiskt NÅR
    // DOM:en, så en framtida refaktor inte tappar raden tyst. Data-attributet är
    // krok för design-frontends finputs.
    const signature = container.querySelector('[data-app-signature]');
    expect(signature).not.toBeNull();
    expect(signature).toHaveTextContent('Made by Daniel Aldemir');
    await waitForAppSettled();
  });
});

// Install-bannern gatas bakom onboarding-touren (T39/#68, F1): touren är en z-50
// helskärms-overlay vid första besöket och ligger ÖVER bannern, så install-knappen
// ser ut att "inte göra något". Medan touren är öppen ska den fristående bannern
// alltså INTE finnas i DOM:en; när touren är klar/hoppad visas den normalt (om
// promptbar). Testerna verifierar BÅDA grenarna av gaten.
describe('App-skalet, install-banner gatad bakom onboarding (T39/#68)', () => {
  beforeEach(() => {
    resetInstallPromptCaptureForTest();
    registerInstallPromptCapture();
    // En promptbar (Chrome/Android) kontext: utan ett fångat event vore bannern
    // dold ändå, så gaten skulle inte gå att skilja från "inget att installera".
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux) Chrome/120');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetInstallPromptCaptureForTest();
  });

  /** Fyra ett fejk-beforeinstallprompt-event (Chrome/Android-vägen). */
  function fireBeforeInstallPrompt() {
    const event = new Event('beforeinstallprompt') as Event & {
      preventDefault: () => void;
      prompt: ReturnType<typeof vi.fn>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.preventDefault = vi.fn();
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => {
      window.dispatchEvent(event);
    });
  }

  it('döljer den fristående install-bannern medan onboarding-touren är ÖPPEN', async () => {
    // Touren öppen = flaggan EJ satt (renderApp:s beforeEach satte den, rensa den
    // här för att simulera en första-gångs-vän som öppnar delningslänken).
    window.localStorage.removeItem(ONBOARDING_DONE_KEY);
    renderApp();
    fireBeforeInstallPrompt();

    // Touren ligger över allt; den fristående bannern får inte finnas i DOM:en.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('[data-install-banner]')).not.toBeInTheDocument();
    await waitForAppSettled();
  });

  it('visar den fristående install-bannern när onboarding är klar (flaggan satt) + promptbar', async () => {
    // renderApp:s beforeEach sätter ONBOARDING_DONE_KEY = '1' (touren redan sedd),
    // så detta är "onboarding klar"-grenen.
    renderApp();
    fireBeforeInstallPrompt();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Vänta in att skalet SETTLAT (laddnings-texten borta) FÖRST, så bannern
    // bedöms i ett stabilt träd och inget state-update sker efter testet (act).
    await waitForAppSettled();
    expect(document.querySelector('[data-install-banner]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Installera' })).toBeInTheDocument();
  });
});
