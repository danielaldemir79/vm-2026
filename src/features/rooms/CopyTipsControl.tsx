// Kopiera-mina-tips-kontrollen (T52, #91): den diskreta men hittbara UI-åtgärden för
// Daniels önskan , "man ska kunna kopiera in sina resultat från ett rum till ett annat,
// blir tjatigt att fylla om varenda match varje gång".
//
// SCOPE (KISS, senior-devs lager): semantik + flöde + ärlig rapportering. Visas BARA
// när användaren har ETT AKTIVT rum OCH minst ETT ANNAT rum att kopiera FRÅN (annars
// finns inget att göra). För varje annat rum: en knapp "Kopiera mina tips från <rum>".
// Efter klicket körs store.copyMyTips(källrum) och utfallet rapporteras ÄRLIGT (X
// kopierade, Y låsta, Z redan tippade, ev. fel) i ett role="status"-besked. Design-
// frontend lägger premium-finishen ovanpå denna stabila semantik (samma seam som
// resten av RoomPanel). Stilen ärvs ur rooms.css / RoomPanel-klasserna.
//
// MÅLET = det AKTIVA rummet (store.activeRoom). Vi kopierar alltid IN till det rum man
// står i, så riktningen är självklar: "jag är i rum B, hämta mina tips från rum A".

import { useState } from 'react';
import { useRoomsStore } from './rooms-context';
import type { CopyReport } from '../../data/predictions';
import { summarizeCopyReport } from './copy-report-summary';

/** Visnings-tillstånd per käll-rum: pågår / klar (med besked) / fel. */
interface CopyState {
  status: 'idle' | 'busy' | 'done' | 'error';
  message: string;
}

const IDLE: CopyState = { status: 'idle', message: '' };

// Sekundär-knapp i samma formspråk som RoomPanel (kant-knapp, dämpad ton). Design-
// frontend kan ersätta klasserna; semantiken (knapp + etikett + disabled) är det stabila.
const BTN_COPY =
  'inline-flex h-9 items-center justify-center rounded-pill border border-border ' +
  'bg-surface px-4 font-display text-xs font-semibold text-fg shadow-sm ' +
  'transition-[transform,box-shadow,border-color] duration-150 outline-none ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-border))] ' +
  'hover:shadow-[var(--vm-shadow-raised)] ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ' +
  'active:translate-y-px disabled:opacity-60 disabled:hover:shadow-none';

/**
 * Kontrollen som låter användaren kopiera sina tips från ett annat rum in i det aktiva.
 * Returnerar null (inget UI) när det inte finns något att kopiera, så panelen inte
 * visar en tom ruta (samma princip som RoomSection i fixtures-läge).
 */
export function CopyTipsControl() {
  const store = useRoomsStore();
  // Spårar utfallet PER käll-rum (roomId -> CopyState), så varje rad har sitt eget
  // besked och sin egen "kopierar ..."-spinner utan att störa de andra.
  const [stateByRoom, setStateByRoom] = useState<Record<string, CopyState>>({});

  const active = store.activeRoom;
  if (!active) {
    return null; // inget aktivt mål-rum -> inget att kopiera till
  }
  // Andra rum jag är med i (källor): alla mina rum utom det aktiva.
  const otherRooms = store.myRooms.filter((r) => r.id !== active.id);
  if (otherRooms.length === 0) {
    return null; // bara ETT rum -> inget annat att kopiera från
  }

  const handleCopy = async (sourceRoomId: string, sourceName: string) => {
    setStateByRoom((prev) => ({
      ...prev,
      [sourceRoomId]: { status: 'busy', message: `Kopierar dina tips från ${sourceName} ...` },
    }));
    try {
      const report: CopyReport = await store.copyMyTips(sourceRoomId);
      setStateByRoom((prev) => ({
        ...prev,
        [sourceRoomId]: { status: 'done', message: summarizeCopyReport(report, sourceName) },
      }));
    } catch (err) {
      // En LÄSmiss (kan inte kopiera blint) fail-loud:ar hit. Vi visar felets text,
      // ingen tyst "det gick bra"-lögn (PRINCIPLES §8).
      setStateByRoom((prev) => ({
        ...prev,
        [sourceRoomId]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Kunde inte kopiera tipsen.',
        },
      }));
    }
  };

  return (
    <section
      data-rooms-copy-tips
      aria-labelledby="copy-tips-heading"
      className="vm-rooms-copy-tips"
    >
      <h4
        id="copy-tips-heading"
        className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted"
      >
        Kopiera dina tips hit
      </h4>
      <p className="mb-3 max-w-prose text-sm text-fg-muted">
        Har du redan tippat i ett annat rum? Hämta in dina tips hit i stället för att fylla i allt
        igen. Befintliga tips i det här rummet rörs inte, och matcher som redan låsts hoppas över.
      </p>
      <ul className="flex flex-col gap-3" data-rooms-copy-sources>
        {otherRooms.map((room) => {
          const cs = stateByRoom[room.id] ?? IDLE;
          return (
            <li key={room.id} data-rooms-copy-source data-source-id={room.id}>
              <button
                type="button"
                onClick={() => void handleCopy(room.id, room.name)}
                disabled={cs.status === 'busy'}
                data-rooms-copy-button
                className={BTN_COPY}
              >
                {cs.status === 'busy'
                  ? `Kopierar från ${room.name} ...`
                  : `Kopiera mina tips från ${room.name}`}
              </button>
              {cs.message && (
                <p
                  role="status"
                  aria-live="polite"
                  data-rooms-copy-result
                  data-result-status={cs.status}
                  className="mt-1.5 text-sm"
                  style={{
                    color: cs.status === 'error' ? 'var(--color-danger)' : 'var(--color-fg-muted)',
                  }}
                >
                  {cs.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
