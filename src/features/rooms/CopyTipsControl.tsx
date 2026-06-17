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
// PREMIUM-FINISH (designen, T52): kontrollen är en EGEN underzon i biljett-
// kroppen ("Kopiera dina tips hit"), avgränsad med en hårfin guld-list i samma
// kvällsljus-familj som resten av rummet. Varje käll-rum är en rad med ett kopiera-
// affordans (en ⧉-glyf, samma som CopyButton) och ett pågår-läge med en lugn spinner.
// Utfallet får en TON ur rapportens FAKTISKA siffror (inte ur strängen), så de tre
// utfallen syns direkt utan att skrika. Fel vinner först: failade skrivningar = danger
// (utan alarmism), även när engine:n sväljer dem per item och inget kastar, och även
// vid delframgång; annars kopierade = positivt (grön bock); annars inget kopierat =
// neutralt-informativt (dämpad ton). All färg är BACKUP, glyfen + texten bär
// betydelsen (färg-oberoende a11y). Tonerna är AA-mätta mot tokens per tema
// (rooms.css §7, decisions.md T52).

import { useEffect, useRef, useState } from 'react';
import { useRoomsStore } from './rooms-context';
import type { CopyReport } from '../../data/predictions';
import { summarizeCopyReport } from './copy-report-summary';

/**
 * Resultatets TON, härledd ur rapportens FAKTISKA totaler (inte ur den ärliga
 * texten, som ägs av copy-report-summary). Tonen styr bara den VISUELLA signalen
 * (glyf + färg); själva beskedet är oförändrat. Tre lägen så de tre utfallen går att
 * skilja på direkt utan alarmism. Ordningen är AVSIKTLIG , fel vinner alltid:
 *  - 'negative'  , något FAILADE (report.total.failed > 0): danger-ton. Engine:n
 *                  (copyMyPredictions) sväljer per-item-SKRIVfel medvetet (delfel-
 *                  robusthet) och KASTAR inte, så ett äkta fel-utfall (en eller flera
 *                  failade skrivningar) når success-grenen i handleCopy, inte catch.
 *                  Därför härleds danger ur `failed`, inte bara ur en kastad läsmiss.
 *                  Detta gäller ÄVEN vid delframgång (copied > 0 OCH failed > 0): ett
 *                  äkta fel ska aldrig maskeras av att något annat lyckades.
 *  - 'positive'  , inget failade OCH något kopierades (copied > 0): en lugn grön bock.
 *  - 'neutral'   , inget failade OCH inget kopierades (allt var låst/redan tippat,
 *                  eller källan var tom): en dämpad info-ton, INTE ett fel.
 *
 * En kastad LÄSmiss (listMy* failar) ger 'negative' direkt via handleCopy:s catch,
 * utan att gå via denna funktion.
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

/**
 * Härled resultat-tonen ur rapportens totaler (ren funktion av siffrorna). Fel vinner
 * först: `failed > 0` ger alltid 'negative' (även vid delframgång och även om inget
 * kastade, eftersom engine:n sväljer per-item-skrivfel), därefter `copied > 0`
 * 'positive', annars 'neutral'. Se ResultTone-docstringen för hela tillstånds-tabellen.
 */
function toneFromReport(report: CopyReport): ResultTone {
  if (report.total.failed > 0) return 'negative';
  if (report.total.copied > 0) return 'positive';
  return 'neutral';
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
 * Live-region-roll för besked-rutan, VILLKORLIG per utfall (T52 Copilot-runda-1, F5),
 * i linje med resten av RoomPanel (hårt fel = role="alert"/assertive, status/notiser =
 * role="status"/polite). Ett FEL-utfall (tone 'negative') ska annonseras assertivt: det
 * gäller både en kastad LÄSmiss (status 'error') OCH ett svalt SKRIVfel som engine:n
 * inte kastar för (status 'done', failed > 0) , just den fel-klass T52:s ton-logik
 * lyfte fram. Lyckat/neutralt/pågående annonseras artigt (polite), så de inte avbryter
 * skärmläsaren i onödan. Returnerar role + matchande aria-live så de aldrig glider isär.
 */
function liveRegion(tone: ResultTone): {
  role: 'alert' | 'status';
  ariaLive: 'assertive' | 'polite';
} {
  return tone === 'negative'
    ? { role: 'alert', ariaLive: 'assertive' }
    : { role: 'status', ariaLive: 'polite' };
}

/**
 * Kontrollen som låter användaren kopiera sina tips från ett annat rum in i det aktiva.
 * Returnerar null (inget UI) när det inte finns något att kopiera, så panelen inte
 * visar en tom ruta (samma princip som RoomSection i fixtures-läge).
 */
export function CopyTipsControl() {
  const store = useRoomsStore();
  // Spårar utfallet PER käll-rum (roomId -> CopyState), så varje rad har sitt eget
  // besked och sin egen "kopierar ..."-spinner utan att störa de andra. Nyckeln är
  // KÄLL-rummets id; tillståndet beskriver en kopiering IN i det AKTIVA (mål-)rummet.
  const [stateByRoom, setStateByRoom] = useState<Record<string, CopyState>>({});

  const active = store.activeRoom;
  const activeId = active?.id ?? null;

  // VARFÖR denna ref + effekt (T52 Copilot-runda-1, F2-F4): RoomPanel REMOUNTAR inte
  // CopyTipsControl när det aktiva rummet byts, så `stateByRoom` (knutet till det FÖRRA
  // mål-rummet) lever kvar. Utan städning kan ett klart/pågående kopierings-resultat
  // som gällde mål-rum B visas kvar och MISSTOLKAS som ett resultat in i nya mål-rummet
  // C. `activeRoomRef` håller alltid det rum som är aktivt NU, så en asynkron kopiering
  // som startades mot ett rum kan jämföra före varje setState och vägra skriva tillbaka
  // status i FEL mål-rum (race-skydd, fix (b)+(c)).
  const activeRoomRef = useRef<string | null>(activeId);
  useEffect(() => {
    activeRoomRef.current = activeId;
    // Fix (a): nollställ besked-tillståndet när MÅL-rummet byts. Allt i stateByRoom
    // beskrev en kopiering in i det förra rummet och får inte hänga med till det nya.
    // (Körs även vid första mount: stateByRoom är då redan tomt, så det är en no-op.)
    setStateByRoom({});
  }, [activeId]);

  if (!active) {
    return null; // inget aktivt mål-rum -> inget att kopiera till
  }
  // Andra rum jag är med i (källor): alla mina rum utom det aktiva.
  const otherRooms = store.myRooms.filter((r) => r.id !== active.id);
  if (otherRooms.length === 0) {
    return null; // bara ETT rum -> inget annat att kopiera från
  }

  const handleCopy = async (sourceRoomId: string, sourceName: string) => {
    // Lås fast vilket MÅL-rum denna kopiering gäller. Servern skriver alltid in i det
    // rum som var aktivt NÄR vi startade (store.copyMyTips läser store.activeRoom i
    // samma ögonblick); byter användaren rum medan anropet är i luften får utfallet
    // INTE skrivas in i det nya rummets vy. Vi jämför mot activeRoomRef före varje set.
    const targetWhenStarted = activeId;
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
      // Race-guard (fix (b)/(c)): har mål-rummet bytts under tiden, släpp resultatet
      // tyst. Det gällde det FÖRRA rummet, och effekten ovan har redan tömt vyn för
      // det nya. Att skriva här skulle återinföra ett gammalt resultat i fel rum.
      if (activeRoomRef.current !== targetWhenStarted) {
        return;
      }
      setStateByRoom((prev) => ({
        ...prev,
        [sourceRoomId]: {
          status: 'done',
          message: summarizeCopyReport(report, sourceName),
          tone: toneFromReport(report),
        },
      }));
    } catch (err) {
      // Samma race-guard i fel-grenen: ett fel som gällde det förra mål-rummet får inte
      // heller dyka upp i det nya (annars läcker en gammal kopierings-status över).
      if (activeRoomRef.current !== targetWhenStarted) {
        return;
      }
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
          // Villkorlig live-region per utfall (F5): fel = alert/assertive, annars status/polite.
          const live = liveRegion(cs.tone);
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
                  role={live.role}
                  aria-live={live.ariaLive}
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
