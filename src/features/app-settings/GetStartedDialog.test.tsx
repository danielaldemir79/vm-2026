import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetStartedControl } from './GetStartedControl';
import { ANDROID_PLAY_PROTECT_NOTE } from './install-prompt';
import { IOS_SAFARI_REQUIREMENT, WEB_MODE_FACTS } from './get-started-steps';

// Driv hela öppna/stäng-flödet via den publika triggern (GetStartedControl), exakt
// som ScoreGuide-testet renderar sin kontroll. Plattform + standalone mockas via
// matchMedia/userAgent (samma grepp som T39 + get-started-steps-testet).

function mockStandalone(isStandalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    return {
      matches: isStandalone && query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });
}

function mockUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

const IPHONE_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604';
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537';
const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';

/** Öppna kom-igång-dialogen via triggern och returnera dialog-noden. */
async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /Kom igång/i }));
  return screen.findByRole('dialog');
}

describe('GetStartedControl + GetStartedDialog, a11y-dialog', () => {
  beforeEach(() => {
    // Standardläge: en vanlig (icke-standalone) desktop-webbläsare.
    mockStandalone(false);
    mockUserAgent(DESKTOP_CHROME_UA);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('visar en knapp med aria-haspopup, dialogen är stängd som default', () => {
    render(<GetStartedControl />);
    const trigger = screen.getByRole('button', { name: /Kom igång/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('öppnar en korrekt modal-dialog (role=dialog + aria-modal + märkt av rubriken)', async () => {
    render(<GetStartedControl />);
    const dialog = await openDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Använd appen direkt/i);
  });

  it('Escape stänger dialogen (a11y)', async () => {
    render(<GetStartedControl />);
    await openDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stäng-knappen stänger dialogen', async () => {
    render(<GetStartedControl />);
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stäng kom igång' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('klick på bakgrunden stänger, klick i panelen gör det inte', async () => {
    render(<GetStartedControl />);
    const dialog = await openDialog();

    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).toBeInTheDocument();

    const overlay = document.querySelector('[data-get-started-overlay]');
    fireEvent.click(overlay as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // Samma portal-invariant som SettingsControl/ScoreGuide (T32/T34): overlayn är ett
  // direkt barn av <body>, inte instängd i triggerns träd (lyfter den till topplagret).
  it('portalerar overlayn till document.body (topplager)', async () => {
    const { container } = render(<GetStartedControl />);
    await openDialog();
    const overlay = document.querySelector('[data-get-started-overlay]');
    expect(overlay).not.toBeNull();
    expect(container.contains(overlay)).toBe(false);
    expect(overlay?.parentElement).toBe(document.body);
  });
});

describe('GetStartedDialog, innehåll, båda vägarna + ärlig webb-info', () => {
  beforeEach(() => {
    mockStandalone(false);
    mockUserAgent(DESKTOP_CHROME_UA);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nämner BÅDA vägarna (använd direkt i webbläsaren OCH lägg på hemskärmen)', async () => {
    render(<GetStartedControl />);
    const dialog = await openDialog();
    expect(within(dialog).getByText(WEB_MODE_FACTS.heading)).toBeInTheDocument();
    // App-vägens rubrik (entydig: "hemskärmen som en app"; ordet "hemskärmen" ensamt
    // förekommer även i webb-rekommendationen, så vi matchar hela rubriken).
    expect(
      within(dialog).getByRole('heading', { name: /lägg den på hemskärmen som en app/i })
    ).toBeInTheDocument();
  });

  it('visar den ärliga webb-läges-infon (intro + varningar + rekommendation)', async () => {
    render(<GetStartedControl />);
    const dialog = await openDialog();
    expect(within(dialog).getByText(WEB_MODE_FACTS.intro)).toBeInTheDocument();
    for (const caution of WEB_MODE_FACTS.cautions) {
      expect(within(dialog).getByText(caution)).toBeInTheDocument();
    }
    expect(within(dialog).getByText(WEB_MODE_FACTS.recommendation)).toBeInTheDocument();
  });

  it('har en tablist med en flik per enhet (a11y: role=tab + aria-selected)', async () => {
    render(<GetStartedControl />);
    const dialog = await openDialog();
    const tabs = within(dialog).getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    // Exakt en flik aktiv (aria-selected=true).
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });
});

// WAI-ARIA Tabs-tangentbordsmönstret (copilot R3, F1): roving tabindex + piltangenter
// + Home/End med wrap, och selection-follows-focus (att flytta fokus byter vald flik
// + panel). https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
describe('GetStartedDialog, tablist-tangentbord (roving tabindex + piltangenter)', () => {
  beforeEach(() => {
    // Desktop-förvalet => desktop är initialt aktiv flik (index 2 i ['ios','android',
    // 'desktop']-ordningen). Förutsägbart utgångsläge för pil-stegen.
    mockStandalone(false);
    mockUserAgent(DESKTOP_CHROME_UA);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Flikarna i renderad ordning + hjälpare för att läsa aktiv/tabindex. */
  async function openTabs() {
    render(<GetStartedControl />);
    const dialog = await openDialog();
    const tabs = within(dialog).getAllByRole('tab');
    return { dialog, tabs };
  }

  const selectedOf = (tabs: HTMLElement[]) =>
    tabs.find((t) => t.getAttribute('aria-selected') === 'true');

  it('roving tabindex: bara aktiva fliken har tabIndex=0, övriga -1 (Tab landar bara på en)', async () => {
    const { tabs } = await openTabs();
    const active = selectedOf(tabs);
    expect(active).toBeDefined();
    // Exakt en flik i Tab-ordningen (tabIndex=0), och det är den aktiva.
    const inTabOrder = tabs.filter((t) => t.tabIndex === 0);
    expect(inTabOrder).toEqual([active]);
    for (const tab of tabs) {
      expect(tab.tabIndex).toBe(tab === active ? 0 : -1);
    }
  });

  it('Höger-pil flyttar fokus + val (och panel) till nästa flik', async () => {
    const { dialog, tabs } = await openTabs();
    // Desktop aktiv ('På datorn'). Höger-pil ska wrappa till första fliken ('På iPhone').
    const desktopTab = within(dialog).getByRole('tab', { name: 'På datorn' });
    desktopTab.focus();
    fireEvent.keyDown(desktopTab, { key: 'ArrowRight' });

    const iosTab = within(dialog).getByRole('tab', { name: 'På iPhone' });
    expect(iosTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(iosTab);
    // Panelen följer med (selection follows focus): iOS-stegen renderas.
    expect(document.querySelector('[data-get-started-steps="ios"]')).not.toBeNull();
    // Roving tabindex flyttades: nya aktiva fliken är nu i Tab-ordningen.
    expect(iosTab.tabIndex).toBe(0);
    expect(desktopTab.tabIndex).toBe(-1);
    void tabs;
  });

  it('Vänster-pil flyttar fokus + val till föregående flik', async () => {
    const { dialog } = await openTabs();
    // Desktop aktiv. Vänster-pil ska gå till föregående ('På Android').
    const desktopTab = within(dialog).getByRole('tab', { name: 'På datorn' });
    desktopTab.focus();
    fireEvent.keyDown(desktopTab, { key: 'ArrowLeft' });

    const androidTab = within(dialog).getByRole('tab', { name: 'På Android' });
    expect(androidTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(androidTab);
    expect(document.querySelector('[data-get-started-steps="android"]')).not.toBeNull();
  });

  it('Höger-pil WRAPpar från sista fliken till första', async () => {
    const { dialog } = await openTabs();
    // Sista fliken ('På datorn', index 2) är aktiv. Höger -> wrap till index 0 ('På iPhone').
    const desktopTab = within(dialog).getByRole('tab', { name: 'På datorn' });
    desktopTab.focus();
    fireEvent.keyDown(desktopTab, { key: 'ArrowRight' });
    expect(within(dialog).getByRole('tab', { name: 'På iPhone' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('Vänster-pil WRAPpar från första fliken till sista', async () => {
    const { dialog } = await openTabs();
    // Gå först till första fliken ('På iPhone'), tryck sedan Vänster -> wrap till sista.
    const iosTab = within(dialog).getByRole('tab', { name: 'På iPhone' });
    fireEvent.click(iosTab);
    iosTab.focus();
    fireEvent.keyDown(iosTab, { key: 'ArrowLeft' });
    expect(within(dialog).getByRole('tab', { name: 'På datorn' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(document.activeElement).toBe(within(dialog).getByRole('tab', { name: 'På datorn' }));
  });

  it('Home går till första fliken, End till sista', async () => {
    const { dialog } = await openTabs();
    const desktopTab = within(dialog).getByRole('tab', { name: 'På datorn' });
    desktopTab.focus();

    // Home -> första ('På iPhone').
    fireEvent.keyDown(desktopTab, { key: 'Home' });
    const iosTab = within(dialog).getByRole('tab', { name: 'På iPhone' });
    expect(iosTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(iosTab);

    // End -> sista ('På datorn'), från den nu fokuserade iOS-fliken.
    fireEvent.keyDown(iosTab, { key: 'End' });
    expect(within(dialog).getByRole('tab', { name: 'På datorn' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(document.activeElement).toBe(within(dialog).getByRole('tab', { name: 'På datorn' }));
  });

  it('orörda tangenter (t.ex. Down) ändrar inte vald flik', async () => {
    const { dialog } = await openTabs();
    const desktopTab = within(dialog).getByRole('tab', { name: 'På datorn' });
    desktopTab.focus();
    fireEvent.keyDown(desktopTab, { key: 'ArrowDown' });
    // Down ingår inte i en horisontell tablist => ingen ändring.
    expect(desktopTab).toHaveAttribute('aria-selected', 'true');
  });
});

describe('GetStartedDialog, rätt instruktion för rätt enhet (plattformsgrenar)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('iPhone: iOS-fliken är förvald och Safari-kravet visas', async () => {
    mockStandalone(false);
    mockUserAgent(IPHONE_SAFARI_UA);
    render(<GetStartedControl />);
    const dialog = await openDialog();

    const iosTab = within(dialog).getByRole('tab', { name: 'På iPhone' });
    expect(iosTab).toHaveAttribute('aria-selected', 'true');
    // Safari-rekommendationen (review-F1: inget hårt krav) ska synas på iOS-vägen.
    expect(within(dialog).getByText(IOS_SAFARI_REQUIREMENT)).toBeInTheDocument();
  });

  it('Android: Android-fliken är förvald och Play Skydd-noten visas', async () => {
    mockStandalone(false);
    mockUserAgent(ANDROID_CHROME_UA);
    render(<GetStartedControl />);
    const dialog = await openDialog();

    const androidTab = within(dialog).getByRole('tab', { name: 'På Android' });
    expect(androidTab).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByText(ANDROID_PLAY_PROTECT_NOTE)).toBeInTheDocument();
  });

  it('desktop: desktop-fliken är förvald (adressfälts-vägen)', async () => {
    mockStandalone(false);
    mockUserAgent(DESKTOP_CHROME_UA);
    render(<GetStartedControl />);
    const dialog = await openDialog();
    expect(within(dialog).getByRole('tab', { name: 'På datorn' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('går att BYTA väg: klick på en annan flik visar dess steg + not', async () => {
    // Starta som desktop, byt manuellt till iPhone-vägen.
    mockStandalone(false);
    mockUserAgent(DESKTOP_CHROME_UA);
    render(<GetStartedControl />);
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('tab', { name: 'På iPhone' }));
    expect(within(dialog).getByRole('tab', { name: 'På iPhone' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // iOS-stegen + Safari-rekommendationen syns nu. getAllByText eftersom
    // "Dela-knappen" förekommer både i steg-texten och i F1-rättade noten.
    expect(within(dialog).getAllByText(/Dela-knappen/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(IOS_SAFARI_REQUIREMENT)).toBeInTheDocument();
  });

  it('rendrar numrerade steg som en ordnad lista (numreringen bärs av <ol>)', async () => {
    mockStandalone(false);
    mockUserAgent(IPHONE_SAFARI_UA);
    render(<GetStartedControl />);
    await openDialog();
    const stepsPanel = document.querySelector('[data-get-started-steps="ios"]');
    expect(stepsPanel?.querySelector('ol')).not.toBeNull();
    expect(stepsPanel?.querySelectorAll('li').length).toBeGreaterThan(0);
  });
});

describe('GetStartedDialog, standalone-läge (redan installerad)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('visar "du kör appen, allt klart" i stället för installations-steg', async () => {
    mockStandalone(true);
    mockUserAgent(ANDROID_CHROME_UA);
    render(<GetStartedControl />);
    const dialog = await openDialog();

    // "Allt klart"-kortet syns...
    expect(document.querySelector('[data-get-started-installed]')).not.toBeNull();
    expect(within(dialog).getByText(/allt är klart/i)).toBeInTheDocument();
    // ...och INGA plattforms-flikar/steg visas (inget att installera).
    expect(within(dialog).queryAllByRole('tab')).toHaveLength(0);
    expect(document.querySelector('[data-get-started-steps]')).toBeNull();
  });
});
