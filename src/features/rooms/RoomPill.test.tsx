import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoomPill } from './RoomPill';
import { RoomsStoreContext, type RoomsStore } from './rooms-context';

// RoomPill är en ren konsument av rums-storen. Vi ger en STUB-store via context (samma
// mönster som RoomPanel.test), så pillen kan testas isolerat utan Supabase/provider-init.
// Det håller testet på presentation + a11y + byte-/handlings-beteende (synlighets-
// grenarna, tangentbord, aktiv-markering), provider-logiken testas separat i
// RoomsProvider.test.
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

function renderWith(store: RoomsStore, onOpenRooms?: (target: 'create' | 'join') => void) {
  return render(
    <RoomsStoreContext.Provider value={store}>
      <RoomPill onOpenRooms={onOpenRooms} />
    </RoomsStoreContext.Provider>
  );
}

const ONE_ROOM = { id: 'r1', name: 'Vänner', code: 'aaa11' };
const TWO_ROOMS = [
  { id: 'r1', name: 'Vänner', code: 'aaa11' },
  { id: 'r2', name: 'Jobbet', code: 'bbb22' },
];

describe('RoomPill, synlighets-grenar', () => {
  it('renderar NULL när rummen är inaktiva (fixtures/lokalt läge)', () => {
    const { container } = renderWith(stubStore({ enabled: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renderar NULL utan aktivt rum OCH utan onOpenRooms (ingen hemvist, inget att visa)', () => {
    // enabled men activeRoom=null och ingen navigerings-callback: inget att visa eller
    // navigera till , app-baren ska se ut precis som förr (ingen tom/död platta).
    const { container } = renderWith(stubStore({ myRooms: [], activeRoom: null }));
    expect(container).toBeEmptyDOMElement();
  });

  it('utan aktivt rum men MED onOpenRooms: en "Rum"-CTA med bara skapa/gå-med', () => {
    // Ny användare som inte är med i något rum: pillen blir en CTA så man kan gå med via
    // pillen (Daniels krav), routad till rätt sektion. Ingen rum-rad (inget att byta mellan).
    renderWith(stubStore({ myRooms: [], activeRoom: null }), () => {});
    const trigger = screen.getByRole('button', { name: /Skapa eller gå med i ett rum/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByText('Rum')).toBeInTheDocument();

    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(within(menu).queryAllByRole('menuitemradio')).toHaveLength(0);
    expect(within(menu).getByRole('menuitem', { name: 'Skapa rum' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Gå med i rum' })).toBeInTheDocument();
  });

  it('CTA-menyns "Gå med i rum" anropar onOpenRooms("join")', () => {
    const onOpenRooms = vi.fn();
    renderWith(stubStore({ myRooms: [], activeRoom: null }), onOpenRooms);
    fireEvent.click(screen.getByRole('button', { name: /Skapa eller gå med/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Gå med i rum' }));

    expect(onOpenRooms).toHaveBeenCalledTimes(1);
    expect(onOpenRooms).toHaveBeenCalledWith('join');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('visar en menyknapp (haspopup) med rummets namn även vid EXAKT 1 rum', () => {
    renderWith(stubStore({ myRooms: [ONE_ROOM], activeRoom: ONE_ROOM }), () => {});
    // Rummets namn syns i pillen ...
    expect(screen.getByText('Vänner')).toBeInTheDocument();
    // ... och pillen är en menyknapp (så skapa/gå-med-valen är nåbara även med ett rum).
    const trigger = screen.getByRole('button', { name: /Rummeny, aktivt rum: Vänner/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('1-rums-menyn har INGA rum-rader att byta mellan, bara skapa/gå-med', () => {
    renderWith(stubStore({ myRooms: [ONE_ROOM], activeRoom: ONE_ROOM }), () => {});
    fireEvent.click(screen.getByRole('button', { name: /Rummeny/i }));
    const menu = screen.getByRole('menu');
    // Ingen växlare (det finns inget att byta MELLAN med ett enda rum) ...
    expect(within(menu).queryAllByRole('menuitemradio')).toHaveLength(0);
    // ... men skapa/gå-med-handlingarna finns.
    expect(within(menu).getByRole('menuitem', { name: 'Skapa rum' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Gå med i rum' })).toBeInTheDocument();
  });

  it('visar en BYTBAR knapp (haspopup) när man är med i 2+ rum, med aktivt rum i namnet', () => {
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }), () => {});
    const trigger = screen.getByRole('button', { name: /Byt rum, aktivt: Vänner/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Menyn är inte öppen från start.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('utan onOpenRooms döljs skapa/gå-med (ingen hemvist att navigera till)', () => {
    // Pillen kan renderas isolerat utan flik-routern; då ska skapa/gå-med inte visas
    // (de hade varit döda val). Vid 2+ rum är rum-bytet ändå kvar.
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }));
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(2);
    expect(within(menu).queryByRole('menuitem', { name: 'Skapa rum' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Gå med i rum' })).not.toBeInTheDocument();
  });
});

describe('RoomPill, byte mellan rum', () => {
  it('öppnar menyn och listar mina rum, det aktiva markerat (aria-checked + aria-current)', () => {
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }), () => {});
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));

    const menu = screen.getByRole('menu');
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
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM, selectRoom }), () => {});
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Jobbet/i }));

    expect(selectRoom).toHaveBeenCalledTimes(1);
    expect(selectRoom).toHaveBeenCalledWith('r2');
    // Menyn stängs efter valet.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('att välja det REDAN aktiva rummet byter inte (ingen onödig selectRoom), men stänger', () => {
    const selectRoom = vi.fn(async () => {});
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM, selectRoom }), () => {});
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Vänner/i }));

    // Inget byte (samma rum), så ingen re-fetch i storen triggas ...
    expect(selectRoom).not.toHaveBeenCalled();
    // ... men menyn stängs ändå (valet är "bekräftat", inget kvar att göra).
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('RoomPill, skapa / gå med', () => {
  it('"Skapa rum" anropar onOpenRooms("create") och stänger menyn', () => {
    const onOpenRooms = vi.fn();
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }), onOpenRooms);
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Skapa rum' }));

    expect(onOpenRooms).toHaveBeenCalledTimes(1);
    expect(onOpenRooms).toHaveBeenCalledWith('create');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('"Gå med i rum" anropar onOpenRooms("join") och stänger menyn', () => {
    const onOpenRooms = vi.fn();
    renderWith(stubStore({ myRooms: [ONE_ROOM], activeRoom: ONE_ROOM }), onOpenRooms);
    fireEvent.click(screen.getByRole('button', { name: /Rummeny/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Gå med i rum' }));

    expect(onOpenRooms).toHaveBeenCalledTimes(1);
    expect(onOpenRooms).toHaveBeenCalledWith('join');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('RoomPill, tangentbord + stängning (a11y)', () => {
  it('Escape stänger menyn och lämnar tillbaka fokus till knappen', () => {
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }), () => {});
    const trigger = screen.getByRole('button', { name: /Byt rum/i });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Fokus tillbaka på knappen (tappa aldrig tangentbordsanvändaren ut i body).
    expect(document.activeElement).toBe(trigger);
  });

  it('ett klick UTANFÖR pillen stänger menyn', () => {
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }), () => {});
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Ett pointerdown på document-body (utanför pillen) stänger menyn.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('pil-ner på knappen öppnar menyn och fokuserar det AKTIVA rummets rad', () => {
    renderWith(
      stubStore({ myRooms: TWO_ROOMS, activeRoom: { id: 'r2', name: 'Jobbet', code: 'bbb22' } }),
      () => {}
    );
    const trigger = screen.getByRole('button', { name: /Byt rum/i });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Fokus landar på "var jag är" (det aktiva rummet, Jobbet), så man kan pila därifrån.
    const active = screen.getByRole('menuitemradio', { name: /Jobbet/i });
    expect(document.activeElement).toBe(active);
  });

  it('pil-ner i menyn vandrar genom ALLA rader (rum + handlingar) med wrap-around', () => {
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }), () => {});
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    const menu = screen.getByRole('menu');

    // Öppning fokuserar Vänner (aktivt, rad 0). Sekvensen: Vänner -> Jobbet -> Skapa rum
    // -> Gå med i rum -> wrap tillbaka till Vänner.
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitemradio', { name: /Vänner/i })
    );
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitemradio', { name: /Jobbet/i })
    );
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Skapa rum' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitem', { name: 'Gå med i rum' })
    );
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitemradio', { name: /Vänner/i })
    );
  });

  it('End hoppar till sista raden, Home tillbaka till första', () => {
    renderWith(stubStore({ myRooms: TWO_ROOMS, activeRoom: ONE_ROOM }), () => {});
    fireEvent.click(screen.getByRole('button', { name: /Byt rum/i }));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitem', { name: 'Gå med i rum' })
    );
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitemradio', { name: /Vänner/i })
    );
  });
});
