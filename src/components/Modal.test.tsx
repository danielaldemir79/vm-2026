import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

// Den delade Modal-primitiven (T33) äger a11y-dialog-kontraktet EN gång. Testerna nedan
// bevisar kontraktet på primitiven själv (de fem migrerade dialogerna behåller dessutom
// sina egna tester, så ingen yt-specifik garanti tappas). Vi driver primitiven via en
// liten harness som monterar/avmonterar den vid öppna/stäng, exakt som callers gör.

// Fokus-testerna flyttar document.activeElement; nolla baslinjen mellan tester så ingen
// kvardröjande fokus läcker in i nästa test (samma grepp som TeamProfilePanel-testet).
afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur?.();
});

/**
 * Harness: en öppnar-knapp + en villkorsrenderad Modal (monteras bara när öppen, precis
 * som de riktiga callers gör). Fokus flyttas in till stäng-knappen vid öppning.
 */
function Harness({
  closeOnBackdrop,
  extraButton = false,
  children,
}: {
  closeOnBackdrop?: boolean;
  extraButton?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        öppna
      </button>
      {open ? (
        <Modal
          name="test"
          onClose={() => setOpen(false)}
          labelledById="test-rubrik"
          describedById="test-text"
          initialFocusRef={closeRef}
          closeOnBackdrop={closeOnBackdrop}
          overlayClassName="custom-overlay"
          panelClassName="custom-panel"
        >
          <h2 id="test-rubrik">Test-rubrik</h2>
          <p id="test-text">Beskrivning</p>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)}>
            Stäng
          </button>
          {extraButton ? (
            <button type="button" onClick={() => {}}>
              Extra
            </button>
          ) : null}
          {children}
        </Modal>
      ) : null}
    </>
  );
}

function open() {
  fireEvent.click(screen.getByText('öppna'));
  return screen.findByRole('dialog');
}

describe('Modal, a11y-dialog-kontrakt', () => {
  it('renderar ingen dialog när callern inte monterar den', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('är role=dialog + aria-modal och märks av rubriken (aria-labelledby) + texten (describedby)', async () => {
    render(<Harness />);
    const dialog = await open();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'test-rubrik');
    expect(dialog).toHaveAttribute('aria-describedby', 'test-text');
    expect(dialog).toHaveAccessibleName('Test-rubrik');
  });

  it('portalerar overlayn till document.body (topplager, inte instängd i triggerns träd)', async () => {
    const { container } = render(<Harness />);
    await open();
    const overlay = document.querySelector('[data-test-overlay]');
    expect(overlay).not.toBeNull();
    expect(container.contains(overlay)).toBe(false);
    expect(overlay?.parentElement).toBe(document.body);
  });

  it('sätter data-krokar med callerns namnrymd (overlay + panel)', async () => {
    render(<Harness />);
    const dialog = await open();
    expect(document.querySelector('[data-test-overlay]')).not.toBeNull();
    expect(dialog).toHaveAttribute('data-test-panel');
  });

  it('flyttar fokus till initialFocusRef vid öppning', async () => {
    render(<Harness />);
    await open();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stäng' })).toHaveFocus());
  });

  it('återför fokus till öppnaren när modalen stängs', async () => {
    render(<Harness />);
    const opener = screen.getByText('öppna');
    opener.focus();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stäng' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    void dialog;
  });

  it('Escape stänger dialogen', async () => {
    render(<Harness />);
    await open();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('klick på bakgrunden (overlay) stänger, klick i panelen gör det inte', async () => {
    render(<Harness />);
    const dialog = await open();
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const overlay = document.querySelector('[data-test-overlay]')!;
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closeOnBackdrop=false: klick på bakgrunden stänger INTE (första-gångs-tour)', async () => {
    render(<Harness closeOnBackdrop={false} />);
    await open();
    const overlay = document.querySelector('[data-test-overlay]')!;
    fireEvent.click(overlay);
    // Fortfarande öppen: en dialog som inte får avfärdas av ett oavsiktligt bakgrundsklick.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Escape stänger den dock fortfarande (a11y-utväg).
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('fokus-fälla: Tab på enda fokuserbara håller fokus trappat (preventDefault)', async () => {
    render(<Harness />);
    const dialog = await open();
    const closeBtn = screen.getByRole('button', { name: 'Stäng' });
    await waitFor(() => expect(closeBtn).toHaveFocus()); // enda fokuserbara -> first === last
    const tab = fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(tab).toBe(false); // preventDefault anropades -> fällan grep in
    expect(closeBtn).toHaveFocus();
    const shiftTab = fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(shiftTab).toBe(false);
    expect(closeBtn).toHaveFocus();
  });

  it('fokus-fälla: Tab på sista cyklar till första, Shift+Tab första->sista', async () => {
    render(<Harness extraButton />);
    const dialog = await open();
    const closeBtn = screen.getByRole('button', { name: 'Stäng' });
    const extra = screen.getByRole('button', { name: 'Extra' });
    // first = closeBtn (renderas först), last = extra.
    extra.focus();
    expect(extra).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(closeBtn).toHaveFocus(); // wrap sista -> första
    closeBtn.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(extra).toHaveFocus(); // wrap första -> sista
  });

  it('orörda tangenter i panelen lämnas i fred (fällan rör bara Tab)', async () => {
    render(<Harness />);
    const dialog = await open();
    const closeBtn = screen.getByRole('button', { name: 'Stäng' });
    await waitFor(() => expect(closeBtn).toHaveFocus());
    // Enter ska inte preventas av fokus-fällan (den rör bara Tab).
    const enter = fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(enter).toBe(true); // ingen preventDefault
  });
});

describe('Modal, staplade dialoger: capture-OVANPÅ-bubble stänger bara den översta', () => {
  // Den FAKTISKA stapel-situationen i appen (T54/#93): GetStarted-guiden (escapeCapture)
  // öppnas OVANPÅ onboardingen (default bubble-fas). Ett Escape-tryck ska bara stänga den
  // ÖVERSTA (guiden). Den översta lyssnar i CAPTURE-fasen, som kör FÖRE den understas
  // bubbel-lyssnare, och stopPropagation:ar så den understa aldrig fyrar.
  //
  // VARFÖR inte båda på capture (probe-bevisat T33): två capture-lyssnare på samma target
  // (document) fyrar i REGISTRERINGS-ordning, så den UNDERSTA (monterad först) skulle fyra
  // FÖRST och stänga sig själv. Capture-ovanpå-bubble är den semantik som faktiskt
  // isolerar översta. Det är därför default är bubble och bara den staplingsbara dialogen
  // sätter escapeCapture.
  function StackedHarness() {
    const [outerOpen, setOuterOpen] = useState(false);
    const [innerOpen, setInnerOpen] = useState(false);
    const outerClose = useRef<HTMLButtonElement>(null);
    const innerClose = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button type="button" onClick={() => setOuterOpen(true)}>
          öppna yttre
        </button>
        {outerOpen ? (
          // YTTRE (understa) = default bubble-fas, som onboardingen.
          <Modal
            name="outer"
            onClose={() => setOuterOpen(false)}
            labelledById="outer-rubrik"
            initialFocusRef={outerClose}
          >
            <h2 id="outer-rubrik">Yttre</h2>
            <button ref={outerClose} type="button" onClick={() => setInnerOpen(true)}>
              öppna inre
            </button>
            {innerOpen ? (
              // INRE (översta) = escapeCapture, som GetStarted-guiden.
              <Modal
                name="inner"
                escapeCapture
                onClose={() => setInnerOpen(false)}
                labelledById="inner-rubrik"
                initialFocusRef={innerClose}
              >
                <h2 id="inner-rubrik">Inre</h2>
                <button ref={innerClose} type="button" onClick={() => setInnerOpen(false)}>
                  stäng inre
                </button>
              </Modal>
            ) : null}
          </Modal>
        ) : null}
      </>
    );
  }

  it('Escape stänger den översta (capture) först, den understa förblir öppen tills nästa tryck', async () => {
    render(<StackedHarness />);
    fireEvent.click(screen.getByText('öppna yttre'));
    const outer = await screen.findByRole('dialog', { name: 'Yttre' });
    fireEvent.click(within(outer).getByText('öppna inre'));
    await screen.findByRole('dialog', { name: 'Inre' });

    // Första Escape: bara den översta (Inre, capture+stopPropagation) stängs.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Inre' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('dialog', { name: 'Yttre' })).toBeInTheDocument();

    // Andra Escape: nu stängs den understa (Yttre, bubble).
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Modal, Escape-lyssnaren churnar inte vid omrendering med stabil onClose (C9-klass)', () => {
  // Samma klass som TeamProfilePanels C9: med en STABIL onClose ska keydown-lyssnaren
  // läggas EXAKT en gång per öppning och INTE remove/add:as vid en omrendering (t.ex.
  // en store-/state-uppdatering medan modalen står öppen). Primitiven monteras bara när
  // öppen, så effekten löper en gång; en omrendering med samma onClose ska inte churna.
  function ReRenderHarness({ onClose }: { onClose: () => void }) {
    const [, setTick] = useState(0);
    const closeRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button type="button" onClick={() => setTick((t) => t + 1)}>
          omrendera
        </button>
        <Modal name="rr" onClose={onClose} labelledById="rr-rubrik" initialFocusRef={closeRef}>
          <h2 id="rr-rubrik">RR</h2>
          <button ref={closeRef} type="button">
            stäng
          </button>
        </Modal>
      </>
    );
  }

  it('lägger keydown EN gång och remove/add:ar den INTE vid en omrendering (stabil onClose)', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const keydownAdds = () => addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    const keydownRemoves = () => removeSpy.mock.calls.filter(([type]) => type === 'keydown').length;

    const onClose = vi.fn();
    render(<ReRenderHarness onClose={onClose} />);
    await screen.findByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: 'stäng' });
    await waitFor(() => expect(closeBtn).toHaveFocus());

    expect(keydownAdds()).toBe(1);
    expect(keydownRemoves()).toBe(0);

    // Omrendera (med samma, stabila onClose) -> ingen churn.
    fireEvent.click(screen.getByText('omrendera'));
    expect(keydownAdds()).toBe(1);
    expect(keydownRemoves()).toBe(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
