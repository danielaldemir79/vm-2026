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
    tipsRefreshNonce: 0,
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

function providerTree(store: RoomsStore) {
  return (
    <RoomsStoreContext.Provider value={store}>
      <CopyTipsControl />
    </RoomsStoreContext.Provider>
  );
}

function renderWith(store: RoomsStore) {
  return render(providerTree(store));
}

/**
 * En manuellt löst promise, så ett test kan hålla en kopiering "i luften" (busy) medan
 * det byter aktivt rum, och SEDAN lösa den, för att bevisa race-skyddet (F2-F4): ett
 * resultat som hör till det FÖRRA mål-rummet får inte dyka upp efter bytet.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ROOM_A = { id: 'rA', name: 'Familjen', code: 'aaa11' };
const ROOM_B = { id: 'rB', name: 'Jobbet', code: 'bbb22' };
const ROOM_C = { id: 'rC', name: 'Grannarna', code: 'ccc33' };

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

    // F5: ett fel-utfall annonseras som role="alert" (assertive), i linje med RoomPanel.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Hämta mina tips misslyckades: nät/);
    expect(alert).toHaveAttribute('data-result-status', 'error');
    // En kastad läsmiss går via catch-grenen och får danger-tonen direkt.
    expect(alert).toHaveAttribute('data-result-tone', 'negative');
    // ...och är INTE en artig role="status" (det vore att begrava felet).
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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
  // F5: ett fel-utfall (tone 'negative') hamnar i en role="alert"-region, övriga i
  // role="status". Helpern hämtar beskedet via RÄTT roll så ton- OCH a11y-kontraktet
  // bevisas i samma test (rollen följer tonen, de glider aldrig isär).
  async function clickAndGetResult(report: CopyReport, role: 'alert' | 'status') {
    const copyMyTips = vi.fn(async () => report);
    renderWith(stubStore({ myRooms: [ROOM_A, ROOM_B], activeRoom: ROOM_B, copyMyTips }));
    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));
    return screen.findByRole(role);
  }

  it('copied:0, failed>0 (svalt skrivfel, kastar ej) -> tone "negative" + role "alert", inte neutral/status', async () => {
    // Det failande fallet som engine:n producerar UTAN att kasta: inget kopierades men
    // skrivningar gick fel. Tonen MÅSTE vara danger, inte den lugna info-tonen, OCH det
    // ska annonseras assertivt (alert), inte begravas i en polite status-region.
    const alert = await clickAndGetResult(reportWith({ copied: 0, failed: 2 }), 'alert');
    expect(alert).toHaveAttribute('data-result-tone', 'negative');
    expect(alert).toHaveAttribute('data-result-status', 'done');
    expect(alert).toHaveTextContent('2 kunde inte kopieras');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('copied>0 OCH failed>0 (delframgång) -> tone "negative" + role "alert" (fel maskeras aldrig av delframgång)', async () => {
    const alert = await clickAndGetResult(reportWith({ copied: 3, failed: 1 }), 'alert');
    expect(alert).toHaveAttribute('data-result-tone', 'negative');
    expect(alert).toHaveTextContent('3 tips kopierade från Familjen.');
    expect(alert).toHaveTextContent('1 kunde inte kopieras');
  });

  it('copied>0, failed:0 -> tone "positive" + role "status" (lugn, polite bekräftelse)', async () => {
    const status = await clickAndGetResult(reportWith({ copied: 2, skippedLocked: 1 }), 'status');
    expect(status).toHaveAttribute('data-result-tone', 'positive');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('copied:0, failed:0 (allt låst/redan tippat) -> tone "neutral" + role "status" (inget fel)', async () => {
    const status = await clickAndGetResult(reportWith({ copied: 0, skippedExisting: 4 }), 'status');
    expect(status).toHaveAttribute('data-result-tone', 'neutral');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// RoomPanel REMOUNTAR inte CopyTipsControl när det aktiva (mål-)rummet byts, så det
// per-rad-tillstånd som beskriver en kopiering IN i det FÖRRA rummet kan annars hänga
// kvar och misstolkas som ett resultat in i det NYA rummet (F2-F4). Dessa tester binder
// fast helheten: state nollställs vid rumsbyte, OCH en asynkron kopiering som löser sig
// EFTER bytet får inte återinföra ett resultat i fel rum (race-skydd i båda grenarna).
describe('CopyTipsControl, stale state vid rumsbyte (F2-F4)', () => {
  it('ett FÄRDIGT resultat i förra mål-rummet (B) försvinner efter byte till C', async () => {
    // Aktivt = B, källrad = A (Familjen). Kopiera klart -> ett "done"-besked syns.
    const copyMyTips = vi.fn(async () => reportWith({ copied: 2 }));
    const { rerender } = renderWith(
      stubStore({ myRooms: [ROOM_A, ROOM_B, ROOM_C], activeRoom: ROOM_B, copyMyTips })
    );
    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('2 tips kopierade från Familjen.');

    // Byt aktivt rum B -> C. Beskedet gällde en kopiering IN i B och får inte hänga kvar.
    rerender(
      providerTree(stubStore({ myRooms: [ROOM_A, ROOM_B, ROOM_C], activeRoom: ROOM_C, copyMyTips }))
    );
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByText(/tips kopierade/i)).not.toBeInTheDocument();
    // Källraden för A finns kvar (A är fortfarande ett annat rum), men UTAN gammalt besked.
    expect(
      screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i })
    ).toBeInTheDocument();
  });

  it('en PÅGÅENDE kopiering (start i B) som löser EFTER byte till C visar inget i C', async () => {
    // Håll kopieringen i luften: vi löser den först EFTER rumsbytet, för att bevisa att
    // race-guarden släpper ett resultat som hör till det förra mål-rummet.
    const gate = deferred<CopyReport>();
    const copyMyTips = vi.fn(() => gate.promise);
    const { rerender } = renderWith(
      stubStore({ myRooms: [ROOM_A, ROOM_B, ROOM_C], activeRoom: ROOM_B, copyMyTips })
    );

    // Starta kopieringen medan B är aktivt: raden går till "Kopierar ..."-läge (busy).
    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));
    expect(await screen.findByText(/Kopierar från Familjen/i)).toBeInTheDocument();

    // Byt mål-rum B -> C MEDAN kopieringen fortfarande är i luften.
    rerender(
      providerTree(stubStore({ myRooms: [ROOM_A, ROOM_B, ROOM_C], activeRoom: ROOM_C, copyMyTips }))
    );

    // Lös nu den gamla kopieringen (den gällde B). Resultatet får INTE dyka upp i C.
    gate.resolve(reportWith({ copied: 5 }));
    await waitFor(() => expect(copyMyTips).toHaveBeenCalledTimes(1));

    // Inget besked alls i det nya rummet: varken ett färdigt "done"-resultat eller en
    // kvarhängande busy-text. Race-guarden i success-grenen släppte det tyst.
    await waitFor(() => expect(screen.queryByText(/5 tips kopierade/i)).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('en PÅGÅENDE kopiering som FELAR efter byte till C visar inget fel i C (catch-grenens guard)', async () => {
    // Samma race, men kopieringen FELAR (LÄSmiss) efter bytet. Catch-grenens guard ska
    // också släppa det, annars läcker ett gammalt fel-besked in i det nya rummet.
    const gate = deferred<CopyReport>();
    const copyMyTips = vi.fn(() => gate.promise);
    const { rerender } = renderWith(
      stubStore({ myRooms: [ROOM_A, ROOM_B, ROOM_C], activeRoom: ROOM_B, copyMyTips })
    );

    fireEvent.click(screen.getByRole('button', { name: /Kopiera mina tips från Familjen/i }));
    expect(await screen.findByText(/Kopierar från Familjen/i)).toBeInTheDocument();

    rerender(
      providerTree(stubStore({ myRooms: [ROOM_A, ROOM_B, ROOM_C], activeRoom: ROOM_C, copyMyTips }))
    );

    gate.reject(new Error('[VM2026] Hämta mina tips misslyckades: nät'));
    await waitFor(() => expect(copyMyTips).toHaveBeenCalledTimes(1));

    // Felet gällde B; det får inte annonseras i C (varken alert eller status).
    await waitFor(() => expect(screen.queryByText(/misslyckades/i)).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
