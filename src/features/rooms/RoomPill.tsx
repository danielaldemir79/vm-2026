// PERSISTENT RUM-VÄLJARE i app-baren (T96, #193).
//
// PROBLEMET (Daniels live-feedback 2026-06-16): rum-kontexten (vilket rum man tippar
// i) styr BÅDE Tips OCH Topplista, men förr fanns ingen indikator på vilket rum man
// var i utanför Tips-fliken, och för att byta rum var man tvungen att scrolla till
// RoomSection. RoomPill löser det: en liten pill i app-baren som ALLTID visar det
// AKTIVA rummet (på alla flikar) och , när man är med i flera rum , låter en byta
// rum med ETT tap, oavsett vilken flik man står på.
//
// SCOPE (KISS): visa aktivt rum + snabbyte mellan mina rum. Skapa rum / gå med via
// kod bor kvar i RoomSection (Tips-fliken, nu överst). Pillen är en TUNN konsument av
// rums-storen (samma store som RoomSection), så "aktivt rum" är EN sanning , ett byte
// här uppdaterar exakt samma activeRoom som ett byte i RoomSection, och de rum-scopade
// vyerna (Tips + Topplista, som läser activeRoom) följer med direkt.
//
// SYNLIGHETS-GRENAR (taskens "1 rum vs N rum"-krav):
//   * Rummen inaktiva (enabled=false, fixtures-/lokalt läge) ELLER inget aktivt rum:
//     pillen renderar NULL (ingen tom platta, inget att välja , appen ser ut som förr).
//   * Exakt 1 rum: pillen visar rummets namn som en STILLA etikett (ingen växlare ,
//     "ingen onödig växlare", taskens krav). Ingen meny, inget chevron, ingen knapp att
//     trycka på som inte gör något.
//   * 2+ rum: pillen blir en KNAPP (aria-haspopup=menu) som öppnar en liten meny där
//     man byter aktivt rum med ett tap. Aktivt rum är tydligt markerat (bock + text +
//     aria-current) och annonseras (det valda alternativet bär aria-current="true").
//
// A11Y (taskens hårda krav): knappen bär aria-haspopup + aria-expanded; menyn är en
// role="menu" med role="menuitemradio"-alternativ (radio: exakt ETT aktivt rum), det
// aktiva bär aria-checked + aria-current. Tangentbord: Enter/Space/pil-ner öppnar och
// fokuserar det aktiva alternativet, pil upp/ner + Home/End flyttar fokus, Enter/Space
// väljer, Escape stänger och lämnar tillbaka fokus till knappen, klick utanför stänger.
// Fokus-ring (focus-visible) + reduced-motion (menyns in-känsla gatas i CSS) ingår.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { RoomSummary } from '../../data/rooms';
import { useRoomsStore } from './rooms-context';
import './room-pill.css';

/**
 * App-bar-pillen: aktivt rum + snabbyte. Tunn konsument av rums-storen (ett byte här
 * är samma activeRoom som RoomSection byter , en sanning). Renderar null när det inte
 * finns något rum att visa, så app-baren ser ut precis som förr i fixtures-/lokalt läge.
 */
export function RoomPill() {
  const store = useRoomsStore();

  // Inget att visa: rummen vilande (fixtures/lokalt) ELLER inget aktivt rum valt än.
  // Då bär app-baren ingen pill (ingen tom platta, ingen växlare som pekar på inget).
  if (!store.enabled || store.activeRoom === null) {
    return null;
  }

  // EXAKT 1 rum: en STILLA etikett, ingen växlare (taskens "ingen onödig växlare").
  // Man är ändå alltid i sitt enda rum; en knapp som "byter" mellan ett (1) rum vore
  // en död affordans (PRINCIPLES: inga döda gränssnitts-val).
  if (store.myRooms.length <= 1) {
    return <RoomPillLabel room={store.activeRoom} />;
  }

  // 2+ rum: den bytbara menyn.
  return (
    <RoomPillMenu
      rooms={store.myRooms}
      activeRoom={store.activeRoom}
      onSelect={(roomId) => void store.selectRoom(roomId)}
    />
  );
}

/**
 * Den STILLA etiketten (exakt 1 rum): visar bara det aktiva rummets namn med en liten
 * rum-glyf. Inget chevron (det finns inget att fälla ut), så formen ärligt signalerar
 * "det här är ditt rum", inte "tryck för att byta". data-room-pill-label = test-/styling-krok.
 */
function RoomPillLabel({ room }: { room: RoomSummary }) {
  return (
    <span
      data-room-pill-label=""
      className="vm-room-pill vm-room-pill-static"
      // En diskret men ärlig uppläsning för skärmläsare: vilket rum man är i.
      aria-label={`Aktivt rum: ${room.name}`}
    >
      <RoomGlyph />
      <span className="vm-room-pill-name">{room.name}</span>
    </span>
  );
}

/**
 * Den BYTBARA menyn (2+ rum): en knapp som öppnar en liten meny för att byta aktivt
 * rum. All a11y-mekanik (haspopup/expanded, role=menu + menuitemradio, tangentbord,
 * fokus-flytt, Escape/klick-utanför, aria-current på aktivt) bor här.
 */
function RoomPillMenu({
  rooms,
  activeRoom,
  onSelect,
}: {
  rooms: readonly RoomSummary[];
  activeRoom: RoomSummary;
  onSelect: (roomId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Refs till varje menyrad så tangentbords-navigeringen kan flytta DOM-fokus mellan
  // dem (WAI-ARIA: i en öppen meny ska piltangenter flytta fokus, inte bara markering).
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Vid öppning: flytta fokus till det AKTIVA rummets rad (så användaren landar på
  // "var jag är" och kan pila därifrån). Vid stängning hanteras fokus-retur av den
  // handling som stängde (Escape/val returnerar till knappen explicit nedan).
  useEffect(() => {
    if (open) {
      itemRefs.current.get(activeRoom.id)?.focus();
    }
  }, [open, activeRoom.id]);

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

  // Tangentbord PÅ KNAPPEN: pil-ner/upp + Enter/Space öppnar menyn (och useEffect ovan
  // flyttar fokus till det aktiva alternativet). Annars faller knappen till sitt
  // default-klick-beteende (toggle via onClick).
  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  // Tangentbord I MENYN: piltangenter (wrap-around) + Home/End flyttar fokus mellan
  // raderna; Escape stänger + returnerar fokus till knappen; Tab stänger (fokus ska
  // lämna menyn naturligt). Enter/Space på en rad hanteras av radens egen onClick.
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
    const lastIndex = rooms.length - 1;
    // Hitta den fokuserade radens index genom att jämföra activeElement mot varje
    // rad-ref (robustare än att tolka id-strängar). Faller till 0 om inget matchar
    // (oväntat: menyn är öppen men fokus ligger inte på en rad), så pilen alltid rör sig.
    const focusedIndex = rooms.findIndex(
      (r) => itemRefs.current.get(r.id) === document.activeElement
    );
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
    itemRefs.current.get(rooms[nextIndex].id)?.focus();
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
        // hör "Byt rum, aktivt: <namn>" , inte bara ett namn utan kontext.
        aria-label={`Byt rum, aktivt: ${activeRoom.name}`}
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
          aria-label="Byt aktivt rum"
          onKeyDown={onMenuKeyDown}
          className="vm-room-pill-menu"
        >
          {rooms.map((room) => {
            const isActive = room.id === activeRoom.id;
            return (
              <button
                key={room.id}
                ref={(el) => {
                  if (el) {
                    itemRefs.current.set(room.id, el);
                  } else {
                    itemRefs.current.delete(room.id);
                  }
                }}
                type="button"
                role="menuitemradio"
                // aria-checked (radio: exakt ETT aktivt rum) + aria-current="true"
                // annonserar "det här är rummet du är i nu" (taskens "aktivt val annonserat").
                aria-checked={isActive}
                aria-current={isActive ? 'true' : undefined}
                data-room-pill-item=""
                data-room-pill-active={isActive ? 'true' : undefined}
                onClick={() => handleSelect(room.id)}
                className="vm-room-pill-item"
              >
                {/* Bock-markör för det aktiva rummet (form, inte bara färg). En platshållar-
                    yta håller raderna i linje när bocken inte syns. */}
                <span aria-hidden="true" className="vm-room-pill-check" data-checked={isActive}>
                  {isActive ? '✓' : ''}
                </span>
                <span className="vm-room-pill-item-name">{room.name}</span>
              </button>
            );
          })}
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
