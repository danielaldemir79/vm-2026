import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusRoomForm } from './focus-room-form';

// focusRoomForm är den rena DOM-delen av rum-pillens skapa/gå-med-genväg (T96, #193):
// hitta rätt RoomSection-formulär, scrolla in det, fokusera dess första fält. Testas
// isolerat mot en jsdom-DOM som speglar RoomPanels stabila krokar
// (data-rooms-create-form / data-rooms-join-form, vart med ett första <input>).
//
// jsdom saknar scrollIntoView, så vi stoppar in en mock på prototypen (och städar bort
// den efteråt). matchMedia är redan stubbad i den globala test-setupen (matches:false =
// rörelse ok); vi överskuggar den bara i reduced-motion-fallet.

// Bygg en miniatyr-DOM med BÅDA formulären, var och ett med ett markerat första fält.
function mountForms(): { createInput: HTMLInputElement; joinInput: HTMLInputElement } {
  document.body.innerHTML = `
    <form data-rooms-create-form>
      <input data-create-input />
      <input data-create-second />
    </form>
    <form data-rooms-join-form>
      <input data-join-input />
    </form>
  `;
  return {
    createInput: document.querySelector('[data-create-input]')!,
    joinInput: document.querySelector('[data-join-input]')!,
  };
}

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalMatchMedia = window.matchMedia;
let scrollMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollMock = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollMock;
});

afterEach(() => {
  document.body.innerHTML = '';
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  window.matchMedia = originalMatchMedia;
});

describe('focusRoomForm', () => {
  it('scrollar in OCH fokuserar skapa-formulärets första fält vid target=create', () => {
    const { createInput } = mountForms();

    focusRoomForm('create');

    expect(document.activeElement).toBe(createInput);
    expect(scrollMock).toHaveBeenCalledTimes(1);
  });

  it('scrollar in OCH fokuserar gå-med-formulärets första fält vid target=join', () => {
    const { joinInput } = mountForms();

    focusRoomForm('join');

    expect(document.activeElement).toBe(joinInput);
    expect(scrollMock).toHaveBeenCalledTimes(1);
  });

  it('är en no-op (kastar inte, fokuserar inget) om formuläret saknas', () => {
    document.body.innerHTML = '<div>inga rum-formulär här</div>';

    expect(() => focusRoomForm('create')).not.toThrow();
    expect(scrollMock).not.toHaveBeenCalled();
    // Fokus ligger kvar på body (inget fält fanns att fokusera).
    expect(document.activeElement).toBe(document.body);
  });

  it('scrollar mjukt när rörelse är ok, men direkt (auto) vid prefers-reduced-motion', () => {
    mountForms();

    // Rörelse ok (den globala stubben matchar inte reduce) -> smooth.
    focusRoomForm('create');
    expect(scrollMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: 'smooth', block: 'center' })
    );

    // Minskad rörelse efterfrågad -> auto (ingen animerad scroll).
    window.matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
    focusRoomForm('join');
    expect(scrollMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: 'auto', block: 'center' })
    );
  });
});
