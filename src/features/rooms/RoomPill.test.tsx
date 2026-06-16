import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoomPill } from './RoomPill';
import { RoomsStoreContext, type RoomsStore } from './rooms-context';

// RoomPill är en ren konsument av rums-storen. Vi ger en STUB-store via context (samma
// mönster som RoomPanel.test), så pillen kan testas isolerat utan Supabase/provider-init.
// Det håller testet på presentation + a11y + byte-beteende (synlighets-grenarna,
// tangentbord, aktiv-markering), provider-logiken testas separat i RoomsProvider.test.
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
    copyMyTips: async () => ({
      items: [],
      total: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
      byCategory: {
        match: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
        group: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
        bracket: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
      },
    }),
    ...overrides,
  };
}

function renderWith(store: RoomsStore) {
  return render(
    <RoomsStoreContext.Provider value={store}>
      <RoomPill />
    </RoomsStoreContext.Provider>
  );
}

const TWO_ROOMS = [
  { id: 'r1', name: 'Vänner', code: 'aaa11' },
  { id: 'r2', name: 'Jobbet', code: 'bbb22' },
];

describe('RoomPill, synlighets-grenar', () => {
  it('renderar NULL när rummen är inaktiva (fixtures/lokalt läge)', () => {
    const { container } = renderWith(stubStore({ enabled: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renderar NULL när det inte finns något aktivt rum (inget valt än)', () => {
    // enabled men activeRoom=null: man har inte gått med/valt ett rum, då finns inget
    // att visa eller byta , app-baren ska se ut precis som förr (ingen tom platta).
    const { container } = renderWith(stubStore({ myRooms: [], activeRoom: null }));
    expect(container).toBeEmptyDOMElement();
  });

  it('visar en STILLA etikett (ingen växlare) när man är med i EXAKT 1 rum', () => {
    renderWith(
      stubStore({
        myRooms: [{ id: 'r1', name: 'Vänner', code: 'aaa11' }],
        activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' },
      })
    );
    // Rummets namn syns ...
    expect(screen.getByText('Vänner')).toBeInTheDocument();
    // ... men det finns INGEN växlar-KNAPP (ingen onödig växlare för ett enda rum).
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // Etiketten bär en ärlig uppläsning för skärmläsare.
    expect(screen.getByLabelText('Aktivt rum: Vänner')).toBeInTheDocument();
  });

  it('visar en BYTBAR knapp (haspopup) när man är med i 2+ rum, med aktivt rum i namnet', () => {
    renderWith(
      stubStore({ myRooms: TWO_ROOMS, activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' } })
    );
    const trigger = screen.getByRole('button', { name: /Byt rum, aktivt: Vänner/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Menyn är inte öppen från start.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('RoomPill, byte mellan rum', () => {
  it('öppnar menyn och listar mina rum, det aktiva markerat (aria-checked + aria-current)', () => {
    renderWith(
      stubStore({ myRooms: TWO_ROOMS, activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));

    const menu = screen.getByRole('menu', { name: /Byt aktivt rum/i });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items).toHaveLength(2);
    // Det AKTIVA rummet (Vänner) är markerat + annonserat; det andra inte.
    const active = within(menu).getByRole('menuitemradio', { name: /Vänner/i });
    const other = within(menu).getByRole('menuitemradio', { name: /Jobbet/i });
    expect(active).toHaveAttribute('aria-checked', 'true');
    expect(active).toHaveAttribute('aria-current', 'true');
    expect(other).toHaveAttribute('aria-checked', 'false');
    expect(other).not.toHaveAttribute('aria-current');
    // Knappens aria-expanded speglar öppet läge.
    expect(screen.getByRole('button', { name: /Byt rum/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('byter aktivt rum på ETT tap (selectRoom anropas med rätt id) och stänger menyn', () => {
    const selectRoom = vi.fn(async () => {});
    renderWith(
      stubStore({
        myRooms: TWO_ROOMS,
        activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' },
        selectRoom,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Jobbet/i }));

    expect(selectRoom).toHaveBeenCalledTimes(1);
    expect(selectRoom).toHaveBeenCalledWith('r2');
    // Menyn stängs efter valet.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('att välja det REDAN aktiva rummet byter inte (ingen onödig selectRoom), men stänger', () => {
    const selectRoom = vi.fn(async () => {});
    renderWith(
      stubStore({
        myRooms: TWO_ROOMS,
        activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' },
        selectRoom,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Vänner/i }));

    // Inget byte (samma rum), så ingen re-fetch i storen triggas ...
    expect(selectRoom).not.toHaveBeenCalled();
    // ... men menyn stängs ändå (valet är "bekräftat", inget kvar att göra).
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape stänger menyn och lämnar tillbaka fokus till knappen (a11y)', () => {
    renderWith(
      stubStore({ myRooms: TWO_ROOMS, activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' } })
    );
    const trigger = screen.getByRole('button', { name: /Byt rum/i });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Fokus tillbaka på knappen (tappa aldrig tangentbordsanvändaren ut i body).
    expect(document.activeElement).toBe(trigger);
  });

  it('ett klick UTANFÖR pillen stänger menyn', () => {
    renderWith(
      stubStore({ myRooms: TWO_ROOMS, activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Ett pointerdown på document-body (utanför pillen) stänger menyn.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('pil-ner på knappen öppnar menyn och fokuserar det AKTIVA rummets rad', () => {
    renderWith(
      stubStore({ myRooms: TWO_ROOMS, activeRoom: { id: 'r2', name: 'Jobbet', code: 'bbb22' } })
    );
    const trigger = screen.getByRole('button', { name: /Byt rum/i });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Fokus landar på "var jag är" (det aktiva rummet, Jobbet), så man kan pila därifrån.
    const active = screen.getByRole('menuitemradio', { name: /Jobbet/i });
    expect(document.activeElement).toBe(active);
  });

  it('pil-ner i menyn flyttar fokus till nästa rad (wrap-around)', () => {
    renderWith(
      stubStore({ myRooms: TWO_ROOMS, activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    const menu = screen.getByRole('menu');
    // Öppning fokuserar Vänner (aktivt, index 0). Pil-ner -> Jobbet (index 1).
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: /Vänner/i }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: /Jobbet/i }));
    // Pil-ner igen wrap:ar tillbaka till Vänner (index 0).
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: /Vänner/i }));
  });
});
