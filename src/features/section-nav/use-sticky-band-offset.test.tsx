import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNav } from './SectionNav';
import { SectionNavMobile } from './SectionNavMobile';
import { useRegisterSection } from './use-register-section';
import { SECTIONS } from './section-labels';

// useStickyBandOffset är DELAD (T79) mellan chip-raden (SectionNav) och mobil-menyn
// (SectionNavMobile). Här bevisas att den, när BÅDA banden är monterade (precis som i appen),
// skriver SAMMA offset-kontrakt = header + det SYNLIGA bandets höjd. De två responsiva banden
// växlas med CSS (display:none på det dolda), så det dolda bandet rapporterar höjd 0; hooken
// tar MAX över alla [data-section-nav], alltså det synliga bandets höjd, oavsett vilket bands
// effekt som råkar köra sist (idempotent, ingen kamp om CSS-variabeln).
//
// jsdom har ingen layout: vi mockar getBoundingClientRect per element-roll så app-headern,
// det synliga bandet och det dolda bandet rapporterar distinkta höjder.

function FakeSection() {
  useRegisterSection(SECTIONS.daily);
  return (
    <section aria-labelledby={SECTIONS.daily.id}>
      <h2 id={SECTIONS.daily.id}>{SECTIONS.daily.label}</h2>
    </section>
  );
}

const APP_HEADER_HEIGHT = 64;
const VISIBLE_BAND_HEIGHT = 48; // det band som "syns" (rapporterar höjd)
const HIDDEN_BAND_HEIGHT = 0; // det dolda bandet (display:none -> height 0)

const proto = HTMLElement.prototype as unknown as {
  getBoundingClientRect?: () => { height: number };
};
let originalRect: typeof proto.getBoundingClientRect;

/**
 * Mocka getBoundingClientRect så app-headern ger sin höjd, det band som bär
 * data-section-nav-mobile räknas som DOLT (0, simulerar display:none < sm är osynligt... men
 * vi väljer i stället att låta CHIP-bandet vara det dolda och MOBIL-bandet det synliga, så
 * testet bevisar att MAX plockar det synliga bandet även om det inte är det första i DOM).
 */
function mockRects(opts: { visibleSelector: 'chip' | 'mobile' }): void {
  proto.getBoundingClientRect = function (this: HTMLElement) {
    let height = 0;
    if (this.tagName === 'HEADER') {
      height = this.hasAttribute('data-app-header') ? APP_HEADER_HEIGHT : 0;
    } else if (this.hasAttribute('data-section-nav')) {
      const isMobile = this.hasAttribute('data-section-nav-mobile');
      const isVisible =
        (opts.visibleSelector === 'mobile' && isMobile) ||
        (opts.visibleSelector === 'chip' && !isMobile);
      height = isVisible ? VISIBLE_BAND_HEIGHT : HIDDEN_BAND_HEIGHT;
    }
    return { height } as DOMRect;
  } as typeof proto.getBoundingClientRect;
}

describe('useStickyBandOffset, delad mellan chip-raden och mobil-menyn', () => {
  beforeEach(() => {
    originalRect = proto.getBoundingClientRect;
  });
  afterEach(() => {
    proto.getBoundingClientRect = originalRect;
    document.documentElement.style.removeProperty('--vm-section-nav-header-top');
    document.documentElement.style.removeProperty('--vm-section-nav-offset');
  });

  function readOffset(): string {
    return document.documentElement.style.getPropertyValue('--vm-section-nav-offset');
  }
  function readHeaderTop(): string {
    return document.documentElement.style.getPropertyValue('--vm-section-nav-header-top');
  }

  it('offset = header + MOBIL-bandets höjd när mobil-bandet är det synliga', () => {
    mockRects({ visibleSelector: 'mobile' });
    render(
      <>
        <header data-app-header="">App-header</header>
        <SectionNavProvider>
          <SectionNav />
          <SectionNavMobile />
          <FakeSection />
        </SectionNavProvider>
      </>
    );
    // header-top = app-headerns höjd; offset = header + synligt (mobil) band, INTE summan av
    // båda banden (det dolda chip-bandet bidrar 0).
    expect(readHeaderTop()).toBe(`${APP_HEADER_HEIGHT}px`);
    expect(readOffset()).toBe(`${APP_HEADER_HEIGHT + VISIBLE_BAND_HEIGHT}px`);
  });

  it('offset = header + CHIP-bandets höjd när chip-bandet är det synliga', () => {
    mockRects({ visibleSelector: 'chip' });
    render(
      <>
        <header data-app-header="">App-header</header>
        <SectionNavProvider>
          <SectionNav />
          <SectionNavMobile />
          <FakeSection />
        </SectionNavProvider>
      </>
    );
    expect(readHeaderTop()).toBe(`${APP_HEADER_HEIGHT}px`);
    expect(readOffset()).toBe(`${APP_HEADER_HEIGHT + VISIBLE_BAND_HEIGHT}px`);
  });

  it('rensar CSS-variablerna när BÅDA banden går till 0 sektioner (return null)', () => {
    mockRects({ visibleSelector: 'mobile' });
    function Harness({ show }: { show: boolean }) {
      return (
        <>
          <header data-app-header="">App-header</header>
          <SectionNavProvider>
            <SectionNav />
            <SectionNavMobile />
            {show ? <FakeSection /> : null}
          </SectionNavProvider>
        </>
      );
    }
    const { rerender } = render(<Harness show />);
    expect(readOffset()).toBe(`${APP_HEADER_HEIGHT + VISIBLE_BAND_HEIGHT}px`);

    // Ta bort sektionen -> båda banden returnerar null -> variablerna rensas.
    act(() => rerender(<Harness show={false} />));
    expect(readHeaderTop()).toBe('');
    expect(readOffset()).toBe('');
  });
});
