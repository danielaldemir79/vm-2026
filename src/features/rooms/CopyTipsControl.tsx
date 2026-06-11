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
//
// PREMIUM-FINISH (design-frontend, T52): kontrollen är en EGEN underzon i biljett-
// kroppen ("Kopiera dina tips hit"), avgränsad med en hårfin guld-list i samma
// kvällsljus-familj som resten av rummet. Varje käll-rum är en rad med ett kopiera-
// affordans (en ⧉-glyf, samma som CopyButton) och ett pågår-läge med en lugn spinner.
// Utfallet får en TON ur rapportens FAKTISKA siffror (inte ur strängen), så de tre
// utfallen syns direkt utan att skrika: kopierade = positivt (grön bock), inget
// kopierat = neutralt-informativt (dämpad ton), fel = danger (utan alarmism). All
// färg är BACKUP, glyfen + texten bär betydelsen (färg-oberoende a11y). Tonerna är
// AA-mätta mot tokens per tema (rooms.css §7, decisions.md T52).

import { useState } from 'react';
import { useRoomsStore } from './rooms-context';
import type { CopyReport } from '../../data/predictions';
import { summarizeCopyReport } from './copy-report-summary';

/**
 * Resultatets TON, härledd ur rapportens FAKTISKA totaler (inte ur den ärliga
 * texten, som ägs av copy-report-summary). Tonen styr bara den VISUELLA signalen
 * (glyf + färg); själva beskedet är oförändrat. Tre lägen så de tre utfallen går att
 * skilja på direkt utan alarmism:
 *  - 'positive'  , något kopierades (copied > 0): en lugn grön bock.
 *  - 'neutral'   , inget kopierades men inget gick fel (allt var låst/redan tippat,
 *                  eller källan var tom): en dämpad info-ton, INTE ett fel.
 *  - 'negative'  , en LÄSmiss kastade (fail-loud): danger-ton.
 */
type ResultTone = 'positive' | 'neutral' | 'negative';

/** Visnings-tillstånd per käll-rum: pågår / klar (med besked + ton) / fel. */
interface CopyState {
  status: 'idle' | 'busy' | 'done' | 'error';
  message: string;
  tone: ResultTone;
}

const IDLE: CopyState = { status: 'idle', message: '', tone: 'neutral' };

// Källrums-knappen: samma accent-tonade "action"-pille som RoomPanel:s kopiera/dela-
// knappar (.vm-rooms-action), så kontrollen känns som EN familj med biljetten. Texten
// är fg (full kontrast), accent-tonen lever bara i yta + kant. Disabled-läget under
// kopieringen dämpas, så ett pågående kopp inte ser klickbart ut.
const BTN_COPY =
  'vm-rooms-action vm-rooms-copy-btn inline-flex h-10 w-full items-center gap-2 ' +
  'rounded-pill px-4 font-display text-xs font-semibold ' +
  'transition-[background-color,border-color,box-shadow,transform] duration-150 outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ' +
  'active:translate-y-px disabled:cursor-progress disabled:opacity-70';

/** Härled resultat-tonen ur rapportens totaler (ren funktion av siffrorna). */
function toneFromReport(report: CopyReport): ResultTone {
  return report.total.copied > 0 ? 'positive' : 'neutral';
}

/** Liten besked-glyf (dekor, aria-hidden , texten bär betydelsen). Medan det PÅGÅR
 * visas ingen utfalls-glyf (spinnern på knappen bär pågår-signalen); annars en glyf
 * per ton: bock (positivt), info (neutralt) eller utrops (fel). */
function resultGlyph(status: CopyState['status'], tone: ResultTone): string {
  if (status === 'busy') return '';
  if (tone === 'positive') return '✓';
  if (tone === 'negative') return '!';
  return 'i'; // neutralt-informativt, inte ett fel
}

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
      [sourceRoomId]: {
        status: 'busy',
        message: `Kopierar dina tips från ${sourceName} ...`,
        tone: 'neutral',
      },
    }));
    try {
      const report: CopyReport = await store.copyMyTips(sourceRoomId);
      setStateByRoom((prev) => ({
        ...prev,
        [sourceRoomId]: {
          status: 'done',
          message: summarizeCopyReport(report, sourceName),
          tone: toneFromReport(report),
        },
      }));
    } catch (err) {
      // En LÄSmiss (kan inte kopiera blint) fail-loud:ar hit. Vi visar felets text,
      // ingen tyst "det gick bra"-lögn (PRINCIPLES §8).
      setStateByRoom((prev) => ({
        ...prev,
        [sourceRoomId]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Kunde inte kopiera tipsen.',
          tone: 'negative',
        },
      }));
    }
  };

  return (
    <section
      data-rooms-copy-tips
      aria-labelledby="copy-tips-heading"
      className="vm-rooms-copy-tips mt-5 border-t border-border pt-5"
    >
      <h4
        id="copy-tips-heading"
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted"
      >
        {/* Kopiera-IN-glyf (dekor): två staplade ark som pekar inåt, ekar CopyButton:s ⧉. */}
        <span
          aria-hidden="true"
          className="vm-rooms-copy-mark inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-sm leading-none"
        >
          ⧉
        </span>
        Kopiera dina tips hit
      </h4>
      <p className="mb-3 mt-2 max-w-prose text-sm text-fg-muted">
        Har du redan tippat i ett annat rum? Hämta in dina tips hit i stället för att fylla i allt
        igen. Befintliga tips i det här rummet rörs inte, och matcher som redan låsts hoppas över.
      </p>
      <ul className="flex flex-col gap-3" data-rooms-copy-sources>
        {otherRooms.map((room) => {
          const cs = stateByRoom[room.id] ?? IDLE;
          const isBusy = cs.status === 'busy';
          return (
            <li key={room.id} data-rooms-copy-source data-source-id={room.id}>
              <button
                type="button"
                onClick={() => void handleCopy(room.id, room.name)}
                disabled={isBusy}
                aria-busy={isBusy}
                data-rooms-copy-button
                className={BTN_COPY}
              >
                {/* Leading-glyf: en lugn spinner medan det pågår, annars kopiera-ikonen.
                    aria-hidden , knappens text bär handlingen åt skärmläsaren. */}
                <span
                  aria-hidden="true"
                  className={
                    isBusy
                      ? 'vm-rooms-copy-spinner inline-block h-3.5 w-3.5 shrink-0 rounded-pill'
                      : 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-sm leading-none'
                  }
                >
                  {isBusy ? '' : '⧉'}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">
                  {isBusy
                    ? `Kopierar från ${room.name} ...`
                    : `Kopiera mina tips från ${room.name}`}
                </span>
              </button>
              {cs.message && (
                <p
                  role="status"
                  aria-live="polite"
                  data-rooms-copy-result
                  data-result-status={cs.status}
                  data-result-tone={cs.tone}
                  className="vm-rooms-copy-result mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
                >
                  {resultGlyph(cs.status, cs.tone) && (
                    <span
                      aria-hidden="true"
                      className="vm-rooms-copy-result-glyph mt-px font-bold leading-snug"
                    >
                      {resultGlyph(cs.status, cs.tone)}
                    </span>
                  )}
                  <span className="leading-snug">{cs.message}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
