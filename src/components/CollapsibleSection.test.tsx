import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CollapsibleBody, CollapsibleSection } from './CollapsibleSection';

/**
 * jsdom kör inga CSS-transitioner och saknar TransitionEvent-konstruktorn, och
 * fireEvent.transitionEnd:s `propertyName`-init når inte fram till Reacts syntetiska
 * event. CollapsibleBody gatar sin "släpp höjd-taket"-logik på `propertyName ===
 * 'max-height'` (transitionend bubblar från inre element), så vi måste sätta
 * propertyName explicit på det skapade eventet för att testa den gaten ärligt.
 */
function fireTransitionEnd(node: Element, propertyName: string) {
  const event = createEvent.transitionEnd(node);
  Object.defineProperty(event, 'propertyName', { value: propertyName, configurable: true });
  fireEvent(node, event);
}

/**
 * jsdom ger 0 för clientHeight/scrollHeight (ingen layout), så CollapsibleBody:s
 * measure() rör aldrig isClipped (stannar på default true). För att testa
 * isClipped-GATINGEN ärligt (T68-F1) stubbar vi mätningen: vi definierar
 * clientHeight/scrollHeight på prototypen så measure() kör med riktiga tal och kan
 * sätta isClipped till false (allt ryms) eller bekräfta true (klipps). Återställs
 * efteråt så övriga tester behåller jsdom-kontraktet (clientHeight=0).
 */
function stubBodyMeasurement(clientHeight: number, scrollHeight: number) {
  const clientSpy = vi
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockReturnValue(clientHeight);
  const scrollSpy = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockReturnValue(scrollHeight);
  return () => {
    clientSpy.mockRestore();
    scrollSpy.mockRestore();
  };
}

// Den DELADE komprimerings-primitiven (T68, #129). EN komponent som ger hela sidan
// ETT överblickbart komprimerings-mönster: rubrik + beskrivning ALLTID synliga,
// "toppen" av innehållet synlig komprimerat (höjd-klipp + gradient-fade), och en
// tydlig expandera/komprimera-kontroll (delad ExpandToggle-semantik). Kontraktet
// testas EN gång här, i stället för indirekt via varje konsument-sektion.
describe('CollapsibleSection', () => {
  function renderSection(props?: Partial<Parameters<typeof CollapsibleSection>[0]>) {
    return render(
      <CollapsibleSection
        name="groups"
        heading={<h2 id="h">Gruppspelet</h2>}
        labelledBy="h"
        description={<p>Beskrivning av sektionen.</p>}
        toggleLabels={{
          expand: 'Visa alla grupper',
          collapse: 'Visa färre',
        }}
        {...props}
      >
        <div data-testid="content">Innehåll som ska kunna komprimeras.</div>
      </CollapsibleSection>
    );
  }

  it('rubrik + beskrivning + innehåll renderas, komprimerat som default', () => {
    renderSection();
    // Rubriken bär sektionens tillgängliga namn (aria-labelledby).
    const section = screen.getByRole('region', { name: 'Gruppspelet' });
    expect(within(section).getByText('Beskrivning av sektionen.')).toBeInTheDocument();
    expect(within(section).getByTestId('content')).toBeInTheDocument();
    // Default = komprimerat: data-haken speglar läget för design-frontend + tester.
    expect(section.querySelector('[data-collapsible-body]')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
  });

  it('komprimerat: en expandera-kontroll med aria-expanded=false som styr kroppen', () => {
    renderSection();
    const btn = screen.getByRole('button', { name: /Visa alla grupper/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    // Knappen pekar (aria-controls) på samma element som bär data-collapsible-body.
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(btn).toHaveAttribute('aria-controls', body.id);
  });

  it('expandera -> innehållet fälls ut (data-collapsed=false, aria-expanded=true)', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'false');
    // Nu finns BÅDE en övre OCH en nedre toggle (lång sektion, alltid nåbar utan skroll).
    const toggles = screen.getAllByRole('button', { name: /Visa färre/i });
    expect(toggles.length).toBe(2);
    toggles.forEach((t) => expect(t).toHaveAttribute('aria-expanded', 'true'));
  });

  it('komprimera tillbaka -> tillbaka till komprimerat (toppen synlig igen)', () => {
    renderSection();
    const expandBtn = screen.getByRole('button', { name: /Visa alla grupper/i });
    fireEvent.click(expandBtn);
    // Komprimera via den ÖVRE toggeln.
    const [topCollapse] = screen.getAllByRole('button', { name: /Visa färre/i });
    fireEvent.click(topCollapse);
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'true');
    // Bara den övre toggeln kvar i komprimerat läge.
    expect(screen.getAllByRole('button', { name: /Visa alla grupper/i })).toHaveLength(1);
  });

  it('vid IHOPFÄLLNING flyttas fokus till den ÖVRE kontrollen (listans topp, a11y)', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
    const toggles = screen.getAllByRole('button', { name: /Visa färre/i });
    const bottom = toggles[1];
    bottom.focus();
    fireEvent.click(bottom);
    // Efter ihopfällning ligger fokus på den (nu enda) övre expandera-kontrollen.
    // requestAnimationFrame-callbacken körs av jsdom; vänta in att fokus landat.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Visa alla grupper/i })).toHaveFocus();
    });
  });

  it('namnrymd: data-attributen är per-sektion (stabila, egna krokar)', () => {
    renderSection({ name: 'admin' });
    const btn = screen.getByRole('button', { name: /Visa alla grupper/i });
    expect(btn).toHaveAttribute('data-admin-toggle', 'expand');
    expect(btn).toHaveAttribute('data-admin-toggle-position', 'top');
  });

  it('forwardar section-ref (för fokus/scroll efter komprimering från en annan sektion)', () => {
    const ref = createRef<HTMLElement>();
    renderSection({ sectionRef: ref });
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.getAttribute('data-collapsible-section')).toBe('groups');
  });

  it('startExpanded styr default-läget (avslöjandet expanderat direkt, #129 punkt 11)', () => {
    renderSection({ startExpanded: true });
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getAllByRole('button', { name: /Visa färre/i }).length).toBe(2);
  });
});

// CollapsibleBody är den variant sektionerna i appen använder (de äger redan sin egen
// <section>/header, och lägger bara en CollapsibleBody runt sitt INNEHÅLL). Här testas
// att den komprimerar utan att kräva en egen rubrik-struktur.
describe('CollapsibleBody (innehålls-kompressorn sektionerna använder)', () => {
  it('komprimerar innehållet som default, men innehållet är kvar i DOM (a11y)', () => {
    render(
      <CollapsibleBody name="admin" toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}>
        <p data-testid="inner">Admin-innehåll.</p>
      </CollapsibleBody>
    );
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'true');
    // KOMPRIMERAT betyder klippt, INTE borttaget: innehållet ska fortfarande finnas
    // (det syns visuellt + nås av skärmläsare; bara höjden klipps).
    expect(screen.getByTestId('inner')).toBeInTheDocument();
    // En gradient-fade signalerar "det finns mer" i komprimerat läge.
    expect(body.querySelector('[data-collapsible-fade]')).toBeInTheDocument();
  });

  it('utfälld -> faden försvinner (hela innehållet syns)', () => {
    render(
      <CollapsibleBody name="admin" toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}>
        <p>Admin-innehåll.</p>
      </CollapsibleBody>
    );
    fireEvent.click(screen.getByRole('button', { name: /Visa admin/i }));
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'false');
    expect(body.querySelector('[data-collapsible-fade]')).toBeNull();
  });

  // T68b (#136): chevron-cue:n vid klipp-kanten är nu klickbar och fäller ut
  // (Daniels feedback: "man vill klicka på pilen men inget händer"). Den är ett
  // icke-fokuserbart aria-hidden div, en ren mus/touch-affordans som SPEGLAR den
  // övre ExpandToggle, INTE en andra skärmläsar-/tangentbords-kontroll.
  describe('klickbar chevron-cue (T68b)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('klick på cue-knappen fäller UT sektionen (samma toggle som övre kontrollen)', () => {
      render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
        >
          <p>Admin-innehåll.</p>
        </CollapsibleBody>
      );
      const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
      // Default komprimerat: cue:n finns vid klipp-kanten.
      const cue = body.querySelector('[data-collapsible-cue]');
      expect(cue).not.toBeNull();
      fireEvent.click(cue as Element);
      // Efter klick: utfälld, precis som om man klickat den övre expandera-knappen.
      expect(body).toHaveAttribute('data-collapsed', 'false');
      // Och cue:n är borta (inget mer att "fälla ut" till i utfällt läge).
      expect(body.querySelector('[data-collapsible-cue]')).toBeNull();
    });

    it('cue:n är ett icke-fokuserbart aria-hidden div (inte en andra SR-/tab-kontroll)', () => {
      render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
        >
          <p>Admin-innehåll.</p>
        </CollapsibleBody>
      );
      const cue = document.querySelector('[data-collapsible-cue]');
      expect(cue).not.toBeNull();
      // Ett DIV, inte en button: aria-hidden på ett fokuserbart element (en button kan
      // ta fokus vid klick även med tabIndex=-1) är ogiltig ARIA och trippar axe-regeln
      // aria-hidden-focus (Copilot, PR #143). Ett div är inte fokuserbart, så aria-hidden
      // är giltigt och cue:n hålls helt ur a11y-trädet utan att bli en andra kontroll.
      expect(cue?.tagName).toBe('DIV');
      expect(cue).toHaveAttribute('aria-hidden', 'true');
      // Den tillgängliga kontrollen i komprimerat läge är PRECIS EN knapp (den övre
      // ExpandToggle): cue:n får inte dyka upp som en andra knapp i a11y-trädet.
      // getAllByRole('button') ser bara element i a11y-trädet -> aria-hidden räknas bort.
      expect(screen.getAllByRole('button', { name: /Visa admin/i })).toHaveLength(1);
    });

    it('cue-knappen visas BARA i komprimerat + klippt läge', () => {
      // Klipps inget (allt ryms): ingen cue (skulle vara ett falskt "mer nedanför").
      let restore = stubBodyMeasurement(200, 100);
      const { unmount } = render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
        >
          <p>Kort innehåll som ryms.</p>
        </CollapsibleBody>
      );
      expect(document.querySelector('[data-collapsible-cue]')).toBeNull();
      restore();
      unmount();

      // Komprimerat OCH klippt: cue:n visas (positiv kontroll).
      restore = stubBodyMeasurement(100, 300);
      render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
        >
          <p>Långt innehåll som klipps.</p>
        </CollapsibleBody>
      );
      expect(document.querySelector('[data-collapsible-cue]')).toBeInTheDocument();
      restore();
    });

    it('utfälld (klippt eller ej): ingen cue (inget att fälla ut till)', () => {
      // Klippt men startar utfälld -> cue:n ska inte finnas (vi är redan utfällda).
      const restore = stubBodyMeasurement(100, 300);
      render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
          startExpanded
        >
          <p>Långt innehåll, men startar utfälld.</p>
        </CollapsibleBody>
      );
      const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
      expect(body).toHaveAttribute('data-collapsed', 'false');
      expect(body.querySelector('[data-collapsible-cue]')).toBeNull();
      restore();
    });
  });

  // T68-F1 (#136): den ÖVRE ExpandToggle gatas på SAMMA isClipped-mätning som faden.
  // Klipps inget (kort innehåll, t.ex. tomt/laddnings-/utan-rum-tillstånd som ryms inom
  // collapsedMaxHeight) ska VARKEN fade NI övre "Visa alla"-knapp visas, båda vore ett
  // falskt "mer nedanför"-löfte.
  describe('isClipped gatar BÅDE fade och övre toggle (T68-F1)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('ICKE-klippt innehåll (allt ryms): ingen övre toggle OCH ingen fade', () => {
      // scrollHeight (100) <= clientHeight (200) -> measure() sätter isClipped=false.
      const restore = stubBodyMeasurement(200, 100);
      render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
        >
          <p>Kort innehåll som ryms helt.</p>
        </CollapsibleBody>
      );
      const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
      // Komprimerat (default) men inget klipps: ingen expandera-knapp, ingen fade.
      expect(body).toHaveAttribute('data-collapsed', 'true');
      expect(screen.queryByRole('button', { name: /Visa admin/i })).toBeNull();
      expect(body.querySelector('[data-collapsible-fade]')).toBeNull();
      restore();
    });

    it('KLIPPT innehåll (svämmar över): övre toggle OCH fade visas (positiv kontroll)', () => {
      // scrollHeight (300) > clientHeight (100) -> measure() sätter isClipped=true.
      const restore = stubBodyMeasurement(100, 300);
      render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
        >
          <p>Långt innehåll som klipps.</p>
        </CollapsibleBody>
      );
      const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
      expect(body).toHaveAttribute('data-collapsed', 'true');
      // Klipps -> det FINNS mer att visa -> både knapp och fade.
      expect(screen.getByRole('button', { name: /Visa admin/i })).toBeInTheDocument();
      expect(body.querySelector('[data-collapsible-fade]')).toBeInTheDocument();
      restore();
    });

    it('ICKE-klippt men UTFÄLLD: den övre toggeln finns ändå (man måste kunna fälla ihop)', () => {
      // Även om inget klipps måste utfällt läge ha en kontroll för att komprimera igen.
      const restore = stubBodyMeasurement(200, 100);
      render(
        <CollapsibleBody
          name="admin"
          toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}
          startExpanded
        >
          <p>Kort innehåll, men startar utfälld.</p>
        </CollapsibleBody>
      );
      const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
      expect(body).toHaveAttribute('data-collapsed', 'false');
      // Utfälld: komprimera-kontrollen måste finnas (annars går läget inte att stänga).
      expect(screen.getAllByRole('button', { name: /Visa färre/i }).length).toBeGreaterThanOrEqual(
        1
      );
      restore();
    });
  });

  // T75 (#155): UTFÄLLT FÅR ALDRIG ha ett höjd-tak som klipper/överlappar innehållet.
  // Produktionsbugg på iPhone: utfällt cap:ades till 200rem under det FELAKTIGA antagandet
  // "200rem överstiger alltid innehållet". På en lång sektion (12 grupp-kuponger i 1 kolumn
  // + slutspelsträd > 3200px) spillde innehållet förbi taket och nästa flex-syskon (nedre
  // "Visa färre") lade sig vid 200rem-gränsen och överlappade sista gruppens grupptvåa-
  // väljare. Fix: utfällt slutar på maxHeight:'none'. jsdom har ingen layout (höjder = 0),
  // så vi testar MEKANIKEN (state -> stil), inte pixelhöjd. En regression som återinför ett
  // permanent 200rem-tak i utfällt läge ska göra dessa tester RÖDA.
  describe('utfällt höjd-tak släpps till none (T75, #155)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function renderBody(extraProps?: Partial<Parameters<typeof CollapsibleBody>[0]>) {
      render(
        <CollapsibleBody
          name="group-predictions"
          toggleLabels={{ expand: 'Visa alla grupper', collapse: 'Visa färre' }}
          {...extraProps}
        >
          <p>Lång sektion som inte ryms inom 200rem.</p>
        </CollapsibleBody>
      );
      return document.querySelector('[data-collapsible-body]') as HTMLElement;
    }

    it('utfällning: animerbart tak (200rem) först, sedan none när öppnings-transitionen är klar', () => {
      const body = renderBody();
      fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
      // Under den mjuka öppningen står ett ANIMERBART tak (200rem) så CSS kan animera
      // max-height; `none` kan inte animeras.
      expect(body).toHaveAttribute('data-collapsed', 'false');
      expect(body.style.maxHeight).toBe('200rem');
      // Öppnings-transitionen klar (max-height) -> taket släpps HELT (obegränsat), så inget
      // efterföljande syskon kan överlappa innehållet. DETTA är regressions-pinnen: ett
      // permanent 200rem-tak (gamla buggen) skulle lämna kvar '200rem' här och faila.
      fireTransitionEnd(body, 'max-height');
      expect(body.style.maxHeight).toBe('none');
    });

    it('reduced-motion: taket släpps DIREKT till none (ingen körbar transition)', () => {
      // Reduced-motion nollar transition-duration (index.css), så onTransitionEnd kan
      // utebli; då måste taket släppas direkt i stället för att fastna på 200rem.
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      const body = renderBody();
      fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
      expect(body).toHaveAttribute('data-collapsed', 'false');
      expect(body.style.maxHeight).toBe('none');
    });

    it('startExpanded: utfälld från start har inget tak (none), inget att animera fram', () => {
      const body = renderBody({ startExpanded: true });
      expect(body).toHaveAttribute('data-collapsed', 'false');
      expect(body.style.maxHeight).toBe('none');
    });

    it('komprimerat behåller höjd-klippet + overflow-hidden (oförändrat)', () => {
      const body = renderBody({ collapsedMaxHeight: '9rem' });
      // Default komprimerat: klippt till toppen + overflow-hidden (gradient-fadens grund).
      expect(body).toHaveAttribute('data-collapsed', 'true');
      expect(body.style.maxHeight).toBe('9rem');
      expect(body.className).toContain('overflow-hidden');
    });

    it('utfällt har ALDRIG overflow-hidden (inre sidled-scroll, t.ex. slutspelsträdet, klipps ej)', () => {
      // Slutspelsträdet har en egen overflow-x-auto INUTI kroppen. Utfällt får därför inte
      // sätta overflow-hidden på kroppen (skulle klippa sidled-scrollen). Gäller både före
      // och efter att höjd-taket släppts till none.
      const body = renderBody();
      fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
      expect(body.className).not.toContain('overflow-hidden');
      fireTransitionEnd(body, 'max-height');
      expect(body.className).not.toContain('overflow-hidden');
    });

    it('ihopfällning ÅTERARMAR taket: nästa utfällning animerar från 200rem igen, inte none', () => {
      const body = renderBody();
      // Fäll ut + släpp taket till none.
      fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
      fireTransitionEnd(body, 'max-height');
      expect(body.style.maxHeight).toBe('none');
      // Fäll ihop via den övre toggeln.
      const [topCollapse] = screen.getAllByRole('button', { name: /Visa färre/i });
      fireEvent.click(topCollapse);
      expect(body).toHaveAttribute('data-collapsed', 'true');
      // Fäll ut IGEN: taket ska vara åter-armat (200rem), inte kvar på none, så öppningen
      // kan animera på nytt.
      fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
      expect(body.style.maxHeight).toBe('200rem');
    });

    it('bubblande transitionend från inre element släpper INTE taket (gatat på max-height)', () => {
      const body = renderBody();
      fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
      expect(body.style.maxHeight).toBe('200rem');
      // En annan property (t.ex. cue-pillrets transform/box-shadow) som bubblar upp får
      // inte råka släppa höjd-taket i förtid.
      fireTransitionEnd(body, 'transform');
      expect(body.style.maxHeight).toBe('200rem');
    });
  });
});
