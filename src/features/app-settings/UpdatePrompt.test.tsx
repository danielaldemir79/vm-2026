import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdatePrompt } from './UpdatePrompt';
import type { AppUpdateApi } from './use-app-update';
import * as registerSwModule from './register-sw';

// Vi injicerar ett pinnat AppUpdateApi via `api`-proppen, så ingen riktig SW
// registreras och varje renderings-läge kan testas deterministiskt. (Hooken
// useAppUpdate testas separat med en fake-register.)
function stubApi(overrides: Partial<AppUpdateApi> = {}): AppUpdateApi {
  return {
    needRefresh: false,
    offlineReady: false,
    updateApp: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  };
}

describe('UpdatePrompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderar inget när det varken finns ny version eller offline-redo (dold)', () => {
    const { container } = render(<UpdatePrompt api={stubApi()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('visar "ny version finns" + en Ladda om-knapp när needRefresh är satt', () => {
    render(<UpdatePrompt api={stubApi({ needRefresh: true })} />);
    expect(screen.getByText('Ny version finns')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ladda om' })).toBeInTheDocument();
  });

  it('Ladda om-knappen anropar updateApp (ett klick uppdaterar)', () => {
    const api = stubApi({ needRefresh: true });
    render(<UpdatePrompt api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ladda om' }));
    expect(api.updateApp).toHaveBeenCalledTimes(1);
  });

  it('Stäng-knappen anropar dismiss utan att uppdatera', () => {
    const api = stubApi({ needRefresh: true });
    render(<UpdatePrompt api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /Stäng/ }));
    expect(api.dismiss).toHaveBeenCalledTimes(1);
    expect(api.updateApp).not.toHaveBeenCalled();
  });

  it('exponerar data-update-prompt="refresh" som stabil krok i ny-version-läget', () => {
    const { container } = render(<UpdatePrompt api={stubApi({ needRefresh: true })} />);
    expect(container.querySelector('[data-update-prompt="refresh"]')).not.toBeNull();
  });

  it('visar offline-redo-beskedet (utan Ladda om-knapp) när bara offlineReady är satt', () => {
    const { container } = render(<UpdatePrompt api={stubApi({ offlineReady: true })} />);
    expect(screen.getByText('Klar att användas offline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ladda om' })).toBeNull();
    expect(container.querySelector('[data-update-prompt="offline-ready"]')).not.toBeNull();
  });

  it('ny version har FÖRETRÄDE framför offline-redo (handlingsbart före info)', () => {
    // Båda satta samtidigt: prompten ska visa det handlingsbara (ladda om).
    render(<UpdatePrompt api={stubApi({ needRefresh: true, offlineReady: true })} />);
    expect(screen.getByText('Ny version finns')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ladda om' })).toBeInTheDocument();
  });

  it('är en aria-live status-region så skärmläsare hör den utan fokusflytt', () => {
    render(<UpdatePrompt api={stubApi({ needRefresh: true })} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  // C1+C2 (#74): prop-doc:en lovar "utan att registrera en SW". Med injicerad api
  // skickar UpdatePrompt en no-op-registrerare till useAppUpdate, så den riktiga
  // registerAppSw aldrig anropas (ingen SW-sidoeffekt i test/Storybook).
  it('registrerar INGEN riktig SW när api injiceras (prop-doc:en hålls)', () => {
    const registerSpy = vi.spyOn(registerSwModule, 'registerAppSw');
    render(<UpdatePrompt api={stubApi({ needRefresh: true })} />);
    expect(registerSpy).not.toHaveBeenCalled();
  });

  // Produktionsvägen (ingen api): useAppUpdate kör default-registreraren, dvs den
  // riktiga registerAppSw, så service-workern faktiskt registreras vid mount.
  it('registrerar SW (anropar registerAppSw) när ingen api injiceras', () => {
    // Stoppa den riktiga registreringen vid roten: spionen ersätter implementationen
    // med en no-op så inget virtual:pwa-register-import sker, men anropet räknas.
    const registerSpy = vi
      .spyOn(registerSwModule, 'registerAppSw')
      .mockImplementation(() => async () => {});
    render(<UpdatePrompt />);
    expect(registerSpy).toHaveBeenCalledTimes(1);
  });
});
