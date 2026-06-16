// PERSISTENT RUM-VÄLJARE i app-baren (T96, #193).
//
// PROBLEMET (Daniels live-feedback 2026-06-16): rum-kontexten (vilket rum man tippar
// i) styr BÅDE Tips OCH Topplista, men förr fanns ingen indikator på vilket rum man
// var i utanför Tips-fliken, och för att byta rum var man tvungen att scrolla till
// RoomSection. RoomPill löser det: en liten pill i app-baren som ALLTID visar det
// AKTIVA rummet (på alla flikar) och , när man är med i flera rum , låter en byta
// rum med ETT tap, oavsett vilken flik man står på.
//
// SKAPA/GÅ MED FRÅN PILLEN (Daniels tillägg 2026-06-16): menyn bär OCKSÅ "Skapa rum"
// och "Gå med i rum", så man kommer åt rum-hanteringen från VILKEN flik som helst.
// De två valen byter inte rum här , de navigerar till RoomSection (överst i Tips) och
// scrollar/fokuserar RÄTT formulär (skapa vs gå med), så man "hamnar på rätt sektion
// för det" utan att leta. Själva formulären bor kvar i RoomSection (en sanning); pillen
// är bara en genväg dit (onOpenRooms, ägd av App-skalet som äger flik-navigeringen).
//
// SYNLIGHETS-GRENAR:
//   * Rummen inaktiva (enabled=false, fixtures-/lokalt läge) ELLER inget aktivt rum:
//     pillen renderar NULL (ingen tom platta, inget att välja , appen ser ut som förr).
//   * Aktivt rum (1 eller flera): pillen är en KNAPP (aria-haspopup=menu) som öppnar en
//     liten meny. Vid 2+ rum listar menyn rummen (byt aktivt med ett tap, aktivt rum
//     markerat) FÖRE skapa/gå-med-valen; vid exakt 1 rum finns inget att byta MELLAN, så
//     menyn visar bara skapa/gå-med-valen (ingen meningslös 1-rads-växlare). Pillens
//     etikett bär alltid det aktiva rummets namn, så "var är jag" syns utan att öppna.
//
// A11Y: knappen bär aria-haspopup + aria-expanded; menyn är en role="menu". Rum-raderna
// är role="menuitemradio" (radio: exakt ETT aktivt rum), det aktiva bär aria-checked +
// aria-current. Skapa/gå-med är role="menuitem" (handlingar, inte val), avskilda med en
// role="separator" när rum-raderna finns. Tangentbord: Enter/Space/pil-ner öppnar och
// fokuserar det aktiva rummet (eller första raden om inget att byta mellan), pil upp/ner
// + Home/End flyttar fokus mellan ALLA rader (rum + handlingar, wrap-around), Escape
// stänger och lämnar tillbaka fokus till knappen, klick utanför stänger. Fokus-ring
// (focus-visible) + reduced-motion (menyns in-känsla gatas i CSS) ingår.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { RoomSummary } from '../../data/rooms';
import { useRoomsStore } from './rooms-context';
import './room-pill.css';

/** Vart "Skapa rum" / "Gå med i rum" ska landa (RoomSection-formulären i Tips). */
export type RoomFormTarget = 'create' | 'join';

/**
 * App-bar-pillen: aktivt rum + snabbyte + genväg till skapa/gå-med. Tunn konsument av
 * rums-storen (ett byte här är samma activeRoom som RoomSection byter , en sanning).
 * Renderar null när det inte finns något rum att visa, så app-baren ser ut precis som
 * förr i fixtures-/lokalt läge.
 *
 * `onOpenRooms` (ägs av App-skalet, som äger flik-navigeringen): navigerar till
 * RoomSection och fokuserar rätt formulär. Valfri , utan den faller skapa/gå-med-valen
 * tyst bort (de visas bara när det finns en hemvist att navigera till), så pillen kan
 * renderas isolerat (tester) utan att veta om flik-routern.
 */
export function RoomPill({ onOpenRooms }: { onOpenRooms?: (target: RoomFormTarget) => void }) {
  const store = useRoomsStore();

  // Inget att visa: rummen vilande (fixtures/lokalt) ELLER inget aktivt rum valt än.
  // Då bär app-baren ingen pill (ingen tom platta, ingen växlare som pekar på inget).
  if (!store.enabled || store.activeRoom === null) {
    return null;
  }

  // Aktivt rum (1 eller flera): den bytbara/handlings-bärande menyn. Vid exakt 1 rum
  // finns inget att byta MELLAN, men menyn bär ändå skapa/gå-med-valen (Daniels krav:
  // nå rum-hanteringen från pillen oavsett antal rum).
  return (
    <RoomPillMenu
      rooms={store.myRooms}
      activeRoom={store.activeRoom}
      onSelect={(roomId) => void store.selectRoom(roomId)}
      onOpenRooms={onOpenRooms}
    />
  );
}

/**
 * Menyn: en knapp som öppnar en liten meny för att byta aktivt rum (vid 2+ rum) och/
 * eller skapa/gå med i ett rum. All a11y-mekanik (haspopup/expanded, role=menu +
 * menuitemradio/menuitem, tangentbord, fokus-flytt, Escape/klick-utanför, aria-current
 * på aktivt) bor här.
 */
function RoomPillMenu({
  rooms,
  activeRoom,
  onSelect,
  onOpenRooms,
}: {
  rooms: readonly RoomSummary[];
  activeRoom: RoomSummary;
  onSelect: (roomId: string) => void;
  onOpenRooms?: (target: RoomFormTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Det finns något att BYTA MELLAN bara vid 2+ rum (vid 1 rum är man alltid i sitt enda
  // rum , en "växlare" mellan ett (1) rum vore en död affordans, PRINCIPLES). Skapa/gå-
  // med-valen visas bara när App gett oss en hemvist att navigera till (onOpenRooms).
  const canSwitch = rooms.length > 1;
  const canManage = onOpenRooms !== undefined;

  // Alla fokuserbara menyrader i DOM-ORDNING (rum-radfilerna + skapa/gå-med). Läses ur
  // den renderade menyn så tangentbords-navigeringen funkar oavsett vilka rader som
  // finns (1 rum: bara handlingar; 2+ rum: rum + handlingar) utan att spegla strukturen
  // i en parallell ref-lista (en sanning: DOM:en).
  function menuItems(): HTMLElement[] {
    const root = menuRef.current;
    if (root === null) {
      return [];
    }
    return Array.from(
      root.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')
    );
  }

  // Vid öppning: flytta fokus till det AKTIVA rummets rad om den finns (så användaren
  // landar på "var jag är" och kan pila därifrån), annars första raden (1-rums-fallet:
  // ingen rum-rad, landa på första handlingen). Stängnings-fokus hanteras av den
  // handling som stängde (Escape/val returnerar till knappen explicit nedan).
  useEffect(() => {
    if (!open) {
      return;
    }
    const items = menuItems();
    const active = items.find((el) => el.dataset.roomPillActive === 'true');
    (active ?? items[0])?.focus();
  }, [open]);

  // Klick UTANFÖR (eller fokus som lämnar) stänger menyn. Pointerdown på document i
  // capture-fasen fångar klicket innan det hinner trigga något annat, och vi stänger
  // bara om målet ligger utanför både knappen och menyn (annars är det ett internt
  // klick som menyns egna handlers äger).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        target !== null &&
        !buttonRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  // Stäng menyn och lämna tillbaka fokus till knappen (a11y: tappa aldrig
  // tangentbordsanvändaren ut i body). Delas av Escape, val, och knapp-toggling.
  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  }

  function handleSelect(roomId: string) {
    // Byt bara om det FAKTISKT är ett annat rum (ett "val" av det redan aktiva rummet
    // ska inte trigga en onödig re-fetch i storen). Stäng + returnera fokus oavsett.
    if (roomId !== activeRoom.id) {
      onSelect(roomId);
    }
    close();
  }

  function handleManage(target: RoomFormTarget) {
    // Navigera till RoomSection (skapa/gå-med). Stäng UTAN att returnera fokus till
    // knappen , App flyttar fokus till rätt formulär-fält (annars hade fokus studsat
    // till knappen först och sen till fältet, en ryckig dubbel-flytt).
    setOpen(false);
    onOpenRooms?.(target);
  }

  // Tangentbord PÅ KNAPPEN: pil-ner/upp + Enter/Space öppnar menyn (och useEffect ovan
  // flyttar fokus till rätt rad). Annars faller knappen till sitt default-klick-beteende.
  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  // Tangentbord I MENYN: piltangenter (wrap-around) + Home/End flyttar fokus mellan
  // ALLA rader (rum + handlingar); Escape stänger + returnerar fokus till knappen; Tab
  // stänger (fokus ska lämna menyn naturligt). Enter/Space på en rad hanteras av radens
  // egen onClick.
  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      // Lämna menyn: stäng men STJÄL inte fokus (låt Tab flytta vidare naturligt).
      close(false);
      return;
    }
    const navKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!navKeys.includes(e.key)) {
      return;
    }
    e.preventDefault();
    const items = menuItems();
    if (items.length === 0) {
      return;
    }
    const lastIndex = items.length - 1;
    // Hitta den fokuserade radens index via activeElement (robustare än id-tolkning).
    // Faller till 0 om inget matchar (oväntat: menyn är öppen men fokus ligger inte på
    // en rad), så pilen alltid rör sig.
    const focusedIndex = items.indexOf(document.activeElement as HTMLElement);
    const fromIndex = focusedIndex >= 0 ? focusedIndex : 0;
    let nextIndex = fromIndex;
    switch (e.key) {
      case 'ArrowDown':
        nextIndex = fromIndex === lastIndex ? 0 : fromIndex + 1;
        break;
      case 'ArrowUp':
        nextIndex = fromIndex === 0 ? lastIndex : fromIndex - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
    }
    items[nextIndex]?.focus();
  }

  return (
    <div className="vm-room-pill-wrap" data-room-pill="">
      <button
        ref={buttonRef}
        type="button"
        data-room-pill-trigger=""
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Tillgängligt namn bär BÅDE funktionen och nuvarande värde, så en skärmläsare
        // hör kontext, inte bara ett namn. Vid 2+ rum är huvud-funktionen "byt rum";
        // vid 1 rum finns inget att byta mellan, så namnet säger "rummeny".
        aria-label={
          canSwitch
            ? `Byt rum, aktivt: ${activeRoom.name}`
            : `Rummeny, aktivt rum: ${activeRoom.name}`
        }
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onButtonKeyDown}
        className="vm-room-pill vm-room-pill-trigger"
      >
        <RoomGlyph />
        <span className="vm-room-pill-name">{activeRoom.name}</span>
        {/* Chevron: en färg-OBEROENDE "går att fälla ut / nu öppen"-affordans (formen
            bär den, aria-expanded bär den för skärmläsare). Vrids när menyn är öppen. */}
        <svg
          aria-hidden="true"
          className="vm-room-pill-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          data-room-pill-menu=""
          aria-label="Rum"
          onKeyDown={onMenuKeyDown}
          className="vm-room-pill-menu"
        >
          {/* RUM-RADERNA (bara vid 2+ rum): byt aktivt rum med ett tap. */}
          {canSwitch &&
            rooms.map((room) => {
              const isActive = room.id === activeRoom.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  role="menuitemradio"
                  // aria-checked (radio: exakt ETT aktivt rum) + aria-current="true"
                  // annonserar "det här är rummet du är i nu".
                  aria-checked={isActive}
                  aria-current={isActive ? 'true' : undefined}
                  data-room-pill-item=""
                  data-room-pill-active={isActive ? 'true' : undefined}
                  onClick={() => handleSelect(room.id)}
                  className="vm-room-pill-item"
                >
                  {/* Bock-markör för det aktiva rummet (form, inte bara färg). En
                      platshållar-yta håller raderna i linje när bocken inte syns. */}
                  <span aria-hidden="true" className="vm-room-pill-check" data-checked={isActive}>
                    {isActive ? '✓' : ''}
                  </span>
                  <span className="vm-room-pill-item-name">{room.name}</span>
                </button>
              );
            })}

          {/* SKAPA / GÅ MED (bara när App gett en hemvist att navigera till): genväg till
              RoomSection-formulären. Avskilda från rum-raderna med en separator när
              rum-raderna finns (annars vore de en lös rad utan kontext). */}
          {canManage && (
            <>
              {canSwitch && (
                <div role="separator" className="vm-room-pill-sep" aria-hidden="true" />
              )}
              <button
                type="button"
                role="menuitem"
                data-room-pill-item=""
                data-room-pill-action="create"
                onClick={() => handleManage('create')}
                className="vm-room-pill-item vm-room-pill-action"
              >
                <span aria-hidden="true" className="vm-room-pill-action-glyph">
                  +
                </span>
                <span className="vm-room-pill-item-name">Skapa rum</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-room-pill-item=""
                data-room-pill-action="join"
                onClick={() => handleManage('join')}
                className="vm-room-pill-item vm-room-pill-action"
              >
                <span aria-hidden="true" className="vm-room-pill-action-glyph">
                  ↳
                </span>
                <span className="vm-room-pill-item-name">Gå med i rum</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Liten rum-/grupp-glyf (dekor, aria-hidden): ankrar pillen visuellt som "ett rum". */
function RoomGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="vm-room-pill-glyph"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Två figurer = "rum med kompisarna" (samma betydelse som RoomSection-heron). */}
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
