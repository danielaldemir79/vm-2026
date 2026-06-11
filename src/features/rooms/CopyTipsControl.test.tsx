import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyTipsControl } from './CopyTipsControl';
import { RoomsStoreContext, type RoomsStore } from './rooms-context';
import type { CopyReport, CopyCategorySummary } from '../../data/predictions';

// CopyTipsControl är en ren konsument av rums-storen. Vi ger en STUB-store via context
// så kontrollen testas isolerat (utan Supabase / provider). Fokus: VISNINGS-villkoren
// (visas bara när det finns ett annat rum att kopiera FRÅN), att klicket kopierar IN
// till det AKTIVA rummet via rätt käll-id, och att utfallet rapporteras ärligt.

const sum = (over: Partial<CopyCategorySummary> = {}): CopyCategorySummary => ({
  copied: 0,
  skippedLocked: 0,
  skippedExisting: 0,
  failed: 0,
  ...over,
});

function reportWith(total: Partial<CopyCategorySummary>): CopyReport {
  return {
    items: [],
    total: sum(total),
    byCategory: { match: sum(), group: sum(), bracket: sum() },
  };
}

function stubStore(overrides: Partial<RoomsStore> = {}): RoomsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    userId: 'me',
    myRooms: [],
    activeRoom: null,
    members: [],
    results: [],
    createRoom: async () => {},
    joinRoom: async () => true,
    selectRoom: async () => {},
    leaveRoom: async () => {},
    refresh: async () => {},
    saveResult: async () => {},
    copyMyTips: vi.fn(async () => reportWith({ copied: 0 })),
    ...overrides,
  };
}

function renderWith(store: RoomsStore) {
  return render(
    <RoomsStoreContext.Provider value={store}>
      <CopyTipsControl />
    </RoomsStoreContext.Provider>
  );
}

const ROOM_A = { id: 'rA', name: 'Familjen', code: 'aaa11' };
const ROOM_B = { id: 'rB', name: 'Jobbet', code: 'bbb22' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CopyTipsControl, visnings-villkor', () => {
  it('renderar inget utan aktivt rum (inget mål att kopiera till)', () => {
    const { container } = renderWith(stubStore({ myRooms: [ROOM_A], activeRoom: null }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renderar inget när man bara är med i ETT rum (inget annat att kopiera från)', () => {
    const { container } = renderWith(stubStore({ myRooms: [ROOM_A], activeRoom: ROOM_A }));
    expect(container).toBeEmptyDOMElement();
  });

  it('visar en kopiera-knapp per ANNAT rum när man är med i flera', () => {
    renderWith(stubStore({ myRooms: [ROOM_A, ROOM_B], activeRoom: ROOM_B }));
    // Aktivt = Jobbet (B); käll-knapp ska finnas för Familjen (A), inte för Jobbet självt.
    expect(
      screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Kopiera mina tips från Jobbet/i })
    ).not.toBeInTheDocument();
  });
});

describe('CopyTipsControl, kopierar IN till det aktiva rummet', () => {
  it('klick anropar copyMyTips med KÄLLrummets id (målet = aktivt, implicit)', async () => {
    const copyMyTips = vi.fn(async () => reportWith({ copied: 2 }));
    renderWith(stubStore({ myRooms: [ROOM_A, ROOM_B], activeRoom: ROOM_B, copyMyTips }));

    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));

    await waitFor(() => expect(copyMyTips).toHaveBeenCalledWith('rA'));
    // copyMyTips tar BARA källrummets id; målet är det aktiva rummet (ingen risk att
    // skriva i fel rum från UI:t).
    expect(copyMyTips).toHaveBeenCalledTimes(1);
  });

  it('rapporterar ärligt: "2 tips kopierade ..." efter ett lyckat kopp', async () => {
    const copyMyTips = vi.fn(async () => reportWith({ copied: 2, skippedLocked: 1 }));
    renderWith(stubStore({ myRooms: [ROOM_A, ROOM_B], activeRoom: ROOM_B, copyMyTips }));

    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('2 tips kopierade från Familjen.');
    expect(status).toHaveTextContent('1 hoppades över (låsta)');
  });
});

describe('CopyTipsControl, fel-väg (LÄSmiss fail-loud:ar)', () => {
  it('visar felets text när copyMyTips kastar (ingen tyst "det gick bra")', async () => {
    const copyMyTips = vi.fn(async () => {
      throw new Error('[VM2026] Hämta mina tips misslyckades: nät');
    });
    renderWith(stubStore({ myRooms: [ROOM_A, ROOM_B], activeRoom: ROOM_B, copyMyTips }));

    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Hämta mina tips misslyckades: nät/);
    expect(status).toHaveAttribute('data-result-status', 'error');
    // En kastad läsmiss går via catch-grenen och får danger-tonen direkt.
    expect(status).toHaveAttribute('data-result-tone', 'negative');
  });
});

// data-result-tone styr den VISUELLA signalen (danger/success/neutral-tint + glyf-färg).
// Den måste vara SANN mot HELA utfallet, inte bara mot "kopierades något". Engine:n
// (copyMyPredictions) sväljer per-item-SKRIVfel medvetet och kastar INTE, så ett
// failat utfall (copied:0, failed>0) når success-grenen i handleCopy, inte catch, och
// fick tidigare den lugna neutral-tonen trots ett äkta fel. Dessa tester binder fast
// att fel ALLTID ger danger, även vid delframgång, och att de lugna tonerna bara når
// fel-fria utfall.
describe('CopyTipsControl, resultat-TON speglar HELA utfallet (failed vinner)', () => {
  async function clickAndGetStatus(report: CopyReport) {
    const copyMyTips = vi.fn(async () => report);
    renderWith(stubStore({ myRooms: [ROOM_A, ROOM_B], activeRoom: ROOM_B, copyMyTips }));
    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));
    return screen.findByRole('status');
  }

  it('copied:0, failed>0 (svalt skrivfel, kastar ej) -> tone "negative", inte neutral', async () => {
    // Det failande fallet som engine:n producerar UTAN att kasta: inget kopierades men
    // skrivningar gick fel. Tonen MÅSTE vara danger, inte den lugna info-tonen.
    const status = await clickAndGetStatus(reportWith({ copied: 0, failed: 2 }));
    expect(status).toHaveAttribute('data-result-tone', 'negative');
    expect(status).toHaveAttribute('data-result-status', 'done');
    expect(status).toHaveTextContent('2 kunde inte kopieras');
  });

  it('copied>0 OCH failed>0 (delframgång) -> tone "negative" (fel maskeras aldrig av delframgång)', async () => {
    const status = await clickAndGetStatus(reportWith({ copied: 3, failed: 1 }));
    expect(status).toHaveAttribute('data-result-tone', 'negative');
    expect(status).toHaveTextContent('3 tips kopierade från Familjen.');
    expect(status).toHaveTextContent('1 kunde inte kopieras');
  });

  it('copied>0, failed:0 -> tone "positive" (lugn bekräftelse)', async () => {
    const status = await clickAndGetStatus(reportWith({ copied: 2, skippedLocked: 1 }));
    expect(status).toHaveAttribute('data-result-tone', 'positive');
  });

  it('copied:0, failed:0 (allt låst/redan tippat) -> tone "neutral" (inget fel)', async () => {
    const status = await clickAndGetStatus(reportWith({ copied: 0, skippedExisting: 4 }));
    expect(status).toHaveAttribute('data-result-tone', 'neutral');
  });
});
