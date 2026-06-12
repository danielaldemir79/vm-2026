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

  it('visar upphovs-signaturen "Byggd av Daniel Aldemir" i footern (T38, #67; copy T44 runda 2, #75)', async () => {
    const { container } = renderApp();

    // Render-test (inte bara en konstant): bevisar att signaturen faktiskt NÅR
    // DOM:en, så en framtida refaktor inte tappar raden tyst. Data-attributet är
    // krok för design-frontends finputs. T44 runda 2 (#75, Daniels feedback "footern
    // ska lyfta upp mig"): avsändar-prefixet ändrades från "Made by" till svenska
    // "Byggd av" och namnet lyftes till en egen, framträdande rad (blickfång), så
    // testet vaktar nu den svenska eyebrow:n + namnet, inte den gamla engelska copyn.
    const signature = container.querySelector('[data-app-signature]');
    expect(signature).not.toBeNull();
    expect(signature).toHaveTextContent('Byggd av');
    expect(signature).toHaveTextContent('Daniel Aldemir');
    await waitForAppSettled();
  });

  it('signatur-namnet länkar till danielaldemir.com med tabnabbing-skydd (T39, #68)', async () => {
    const { container } = renderApp();

    // Länk-kontraktet vaktas (F2): rätt href + ny flik + rel mot tabnabbing. Utan
    // detta test kan en framtida refaktor tyst tappa target/rel (öppnar i samma
    // flik, eller exponerar window.opener) utan att något fångar det.
    const link = container.querySelector('[data-app-signature] a') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', 'https://www.danielaldemir.com');
    expect(link).toHaveAttribute('target', '_blank');
    // rel måste ha BÅDE noopener (kapar window.opener, hindrar tabnabbing) och
    // noreferrer (läcker ingen referrer). Ordnings-oberoende koll på tokens.
    const rel = (link?.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    await waitForAppSettled();
  });

  it('visar appens adress vm-2026.pages.dev synligt och klickbart i footern (T44, #75)', async () => {
    const { container } = renderApp();

    // Daniels feedback (#75): adressen ska SYNAS så folk kan skriva av den / säga den
    // högt, inte bara gömmas bakom en delningsknapp. Vi vaktar att den synliga LÄNK-
    // TEXTEN finns (inte bara href:en) och pekar på rätt URL med tabnabbing-skydd, så
    // en framtida refaktor inte tyst tappar den synliga adressen eller säkerhets-rel:en.
    const addressLink = Array.from(container.querySelectorAll('footer a')).find(
      (a) => a.textContent?.trim() === 'vm-2026.pages.dev'
    ) as HTMLAnchorElement | undefined;
    expect(addressLink).toBeDefined();
    expect(addressLink).toHaveAttribute('href', 'https://vm-2026.pages.dev');
    expect(addressLink).toHaveAttribute('target', '_blank');
    const rel = (addressLink?.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    await waitForAppSettled();
  });

  it('visar danielaldemir.com synligt bredvid namnet med tabnabbing-skydd (T44, #75)', async () => {
    const { container } = renderApp();

    // Daniels feedback (#75): adressen synlig BREDVID namnet, tydligt klickbar (förr låg
    // den bara i title/aria-label). Vi vaktar den SYNLIGA "danielaldemir.com"-länken
    // (skild från namn-länken, som har texten "Daniel Aldemir") inom signaturen, med rätt
    // mål + tabnabbing-skydd.
    const signature = container.querySelector('[data-app-signature]');
    expect(signature).not.toBeNull();
    const addressLink = Array.from(signature?.querySelectorAll('a') ?? []).find(
      (a) => a.textContent?.trim() === 'danielaldemir.com'
    ) as HTMLAnchorElement | undefined;
    expect(addressLink).toBeDefined();
    expect(addressLink).toHaveAttribute('href', 'https://www.danielaldemir.com');
    expect(addressLink).toHaveAttribute('target', '_blank');
    const rel = (addressLink?.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    await waitForAppSettled();
  });

  it('promotar Daniel som utvecklare med en titel-rad i footern (T44, #75)', async () => {
    renderApp();

    // Daniels feedback (#75): tydligare promotion av Daniel som utvecklare. Den lugna
    // titel-raden ska nå DOM:en, så promotion-elementet inte tyst försvinner i en refaktor.
    expect(screen.getByText('.NET-systemutvecklare')).toBeInTheDocument();
    await waitForAppSettled();
  });
});

// Den kompakta install-knappen (T63, #113) gatas bakom onboarding-touren (T39/#68, F1):
// touren är en z-50 helskärms-overlay vid första besöket och ligger ÖVER ytan, så knappen
// skulle se ut att "inte göra något". Medan touren är öppen ska install-knappen alltså
// INTE finnas i DOM:en; när touren är klar/hoppad visas den normalt (här i en promptbar
// Chrome/Android-kontext = native-vägen). Testerna verifierar BÅDA grenarna av gaten.
describe('App-skalet, install-knappen gatad bakom onboarding (T39/#68, T63/#113)', () => {
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

  it('döljer den kompakta install-knappen medan onboarding-touren är ÖPPEN', async () => {
    // Touren öppen = flaggan EJ satt (renderApp:s beforeEach satte den, rensa den
    // här för att simulera en första-gångs-vän som öppnar delningslänken).
    window.localStorage.removeItem(ONBOARDING_DONE_KEY);
    renderApp();
    fireBeforeInstallPrompt();

    // Touren ligger över allt; install-knappen får inte finnas i DOM:en (den syns inte
    // bakom touren och skulle se ut att inte göra något). Touren själv är dialogen.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Installera som app/i })).not.toBeInTheDocument();
    await waitForAppSettled();
  });

  it('visar den kompakta install-knappen när onboarding är klar (flaggan satt) + promptbar', async () => {
    // renderApp:s beforeEach sätter ONBOARDING_DONE_KEY = '1' (touren redan sedd),
    // så detta är "onboarding klar"-grenen. Kontexten är promptbar (event fångat) =>
    // native-vägen: knappen finns och bär native-markören.
    renderApp();
    fireBeforeInstallPrompt();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Vänta in att skalet SETTLAT (laddnings-texten borta) FÖRST, så knappen
    // bedöms i ett stabilt träd och inget state-update sker efter testet (act).
    await waitForAppSettled();
    const button = screen.getByRole('button', { name: /Installera som app/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-install-button', 'native');
  });
});
