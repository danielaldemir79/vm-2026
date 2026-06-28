// Rums-UI (T14, #14): PREMIUM-finishen på det sociala lagret för tipsligan.
//
// SCOPE (KISS): skapa rum, gå med via kod, se mina rum, byt aktivt rum, se
// medlemmar, dela koden, lämna. Senior-dev äger SEMANTIKEN + data-attributen
// (rubriker, fält-etiketter, role/aria, data-rooms-*); det HÄR lagret lägger
// premium-finishen ovanpå UTAN att röra logiken (samma seam-princip som
// GroupTable/BracketView). Stilen bor i `rooms.css`.
//
// DELNINGS-ÖGONBLICKET (taskens kärna): "skapa ett rum, skicka koden till
// kompisarna" ska kännas inbjudande och självklart. Därför är rumskoden en stor,
// kopierbar "biljett" (kopiera-knapp med feedback + dela-knapp), medlemmarna är
// monogram-avatarer med stabil färg, och formulären bär samma premium-formspråk
// som resultatinmatningen (#39): stark fokus-ring, varma kvällsljus-ytor, vänliga
// fel-tillstånd.
//
// Visar inget när rummen är inaktiva (enabled=false, fixtures-läge): det sociala
// lagret är vilande då, appen fungerar lokalt precis som idag. Fel FAIL-LOUD:ar
// (role="alert"), inte en tyst tom panel (PRINCIPLES §8).
//
// KONTRAST: text-färg-besluten bor i rooms.css (glow-alfor satta så hero-texten
// håller AA även i full glow-stack; avatar-ink klampad per hue så den håller AA
// över ALLA 360 hue:er, värsta fallet gult). Uppmätta AA-värden, svept över hela
// hue-spannet + bekräftade på renderade pixlar (båda teman): docs/decisions.md.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRoomsStore } from './rooms-context';
import { buildInviteText, copyText, shareInvite } from './share-room';
import { CopyTipsControl } from './CopyTipsControl';
import { CommentsProvider } from './CommentsProvider';
import { RoomComments } from './RoomComments';
import { MemberGrid } from './MemberGrid';
import './rooms.css';

// Delade fält-klasser, SAMMA premium-formspråk som resultatinmatningen (#39,
// ResultEntryForm FIELD_BASE): en stark, tema-trogen fokus-ring (WCAG 2.4.7) +
// en mjuk hover/focus-lyft. Färgen på ringen är accent (interaktions-affordans,
// inte status), så T7-pinnen (accent === success i ljust tema) hålls ren. En
// sanning så skapa- och gå-med-fälten ser ut som EN familj med inmatningen.
const FIELD_BASE =
  'mt-1 w-full rounded-md border border-border bg-bg px-3 py-2.5 text-fg ' +
  'transition-colors duration-150 outline-none placeholder:text-fg-muted/70 ' +
  'focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))]';

// Primärknapp (Skapa rum): fylld accent, samma lyft-recept som Spara i #39.
const BTN_PRIMARY =
  'mt-1 inline-flex h-11 items-center justify-center rounded-pill bg-accent px-6 ' +
  'font-display text-sm font-semibold text-accent-fg shadow-sm ' +
  'transition-[transform,box-shadow,filter] duration-150 outline-none ' +
  'hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ' +
  'active:translate-y-px active:brightness-95 disabled:opacity-60 disabled:hover:brightness-100';

// Sekundärknapp (Gå med): kant-knapp, samma höjd/form men dämpad ton.
const BTN_SECONDARY =
  'mt-1 inline-flex h-11 items-center justify-center rounded-pill border border-border ' +
  'bg-surface px-6 font-display text-sm font-semibold text-fg shadow-sm ' +
  'transition-[transform,box-shadow,border-color] duration-150 outline-none ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-border))] ' +
  'hover:shadow-[var(--vm-shadow-raised)] ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ' +
  'active:translate-y-px disabled:opacity-60';

/**
 * Sektions-wrapper som renderar HELA rums-kortet (inkl. ytan) bara när rummen är
 * aktiva (Supabase konfigurerat). I lokalt läge returnerar den null, så ingen tom
 * platta visas. App:en använder denna i stället för att wrappa RoomPanel i en egen
 * Panel (då hade en tom yta synts i fixtures-läge). `surface` är kort-stilen App
 * ger (för att inte duplicera dess Panel-stil här).
 */
export function RoomSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const store = useRoomsStore();
  if (!store.enabled) {
    return null;
  }
  return surface(<RoomPanel />);
}

// Rensar en pågående återställnings-timeout och nollar reffen. Delas av CopyButton
// och ShareButton (C12/C13), så cleanup-logiken är EN sanning på båda knapparna.
type ResetTimerRef = { current: ReturnType<typeof window.setTimeout> | null };
function clearResetTimer(ref: ResetTimerRef): void {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

/**
 * Kopiera-rumskoden-knappen med tydlig FEEDBACK: efter ett lyckat kopp byter den
 * till en bock + "Kopierad!" en kort stund (aria-live meddelar det åt skärm-
 * läsaren). Faller koppen (inget Clipboard-API) visas en mjuk "Markera koden
 * själv"-hint i stället för att låtsas. Knappen kopierar BARA koden (det man matar
 * in i "Gå med via kod"); dela-knappen bredvid delar hela inbjudnings-texten.
 */
function CopyButton({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // Timeout-id i en ref så vi kan rensa en pågående återställning (C12): annars
  // tickar setState efter unmount (React-varning + flaky test) eller en ny kopp
  // staplar en andra timeout ovanpå den första.
  const resetTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  useEffect(() => () => clearResetTimer(resetTimer), []);

  const handleCopy = async () => {
    const ok = await copyText(code);
    setState(ok ? 'copied' : 'failed');
    // Återställ etiketten efter en stund, så knappen är redo att kopieras igen.
    // Rensa en ev. tidigare timeout först, så snabba kopp inte staplar dem.
    clearResetTimer(resetTimer);
    resetTimer.current = window.setTimeout(() => setState('idle'), 2200);
  };

  const label =
    state === 'copied' ? 'Kopierad!' : state === 'failed' ? 'Markera koden själv' : 'Kopiera kod';

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      data-rooms-copy
      data-state={state}
      aria-label={state === 'copied' ? `Rumskoden ${code} kopierad` : `Kopiera rumskoden ${code}`}
      className="vm-rooms-action inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 font-display text-xs font-semibold transition-[background-color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {state === 'copied' ? '✓' : '⧉'}
      </span>
      {label}
      {/* Diskret uppläsning av kopierings-utfallet för skärmläsare. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Rumskoden kopierad till urklipp.' : ''}
      </span>
    </button>
  );
}

/**
 * Dela-länken-knappen: använder mobilens systemdelnings-ark (Web Share API) när
 * det finns och faller annars tillbaka på att kopiera hela inbjudnings-texten
 * (namn + kod + länk). Så "skicka koden till en vän" är ETT klick på mobilen och
 * en vänlig fallback på desktop. Rör ingen datalogik (share-room.ts är ren text).
 */
function ShareButton({ roomName, code }: { roomName: string; code: string }) {
  const [hint, setHint] = useState<string | null>(null);
  // Samma timeout-ref-städning som CopyButton (C13): hinten ska inte setState:a
  // efter unmount, och en ny delning ska inte stapla en andra timeout.
  const hintTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  useEffect(() => () => clearResetTimer(hintTimer), []);

  const handleShare = async () => {
    const text = buildInviteText(roomName, code);
    const result = await shareInvite(roomName, text);
    if (result === 'shared') {
      return;
    }
    // Inget delnings-ark (desktop) eller avbrutet: kopiera inbjudan i stället.
    const copied = await copyText(text);
    setHint(copied ? 'Inbjudan kopierad, klistra in och skicka.' : 'Kopiera koden och skicka den.');
    clearResetTimer(hintTimer);
    hintTimer.current = window.setTimeout(() => setHint(null), 2600);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleShare()}
        data-rooms-share
        aria-label={`Dela rummet ${roomName} och koden ${code}`}
        className="vm-rooms-action inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 font-display text-xs font-semibold transition-[background-color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
      >
        <span aria-hidden="true" className="text-sm leading-none">
          ↗
        </span>
        Dela länken
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {hint ?? ''}
      </span>
    </>
  );
}

export function RoomPanel() {
  const store = useRoomsStore();
  const createNameId = useId();
  const createDisplayId = useId();
  const joinCodeId = useId();
  const joinDisplayId = useId();

  const [createName, setCreateName] = useState('');
  const [createDisplay, setCreateDisplay] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinDisplay, setJoinDisplay] = useState('');
  // Lokalt UI-fel/-meddelande (skilt från storens initierings-fel), t.ex. "rummet
  // finns inte" vid join med okänd kod. role="status" så det läses upp. `tone`
  // skiljer ett VÄNLIGT besked (skapad/gick med) från ett FEL (okänd kod) visuellt.
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  // Inaktivt (fixtures-läge): visa inget rums-UI alls. Appen fungerar lokalt.
  if (!store.enabled) {
    return null;
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      await store.createRoom(createName.trim(), createDisplay.trim());
      setCreateName('');
      setCreateDisplay('');
      setNotice({ text: 'Rummet skapades. Dela koden med kompisarna.', tone: 'info' });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Kunde inte skapa rummet.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const ok = await store.joinRoom(joinCode.trim(), joinDisplay.trim());
      if (ok) {
        setJoinCode('');
        setJoinDisplay('');
        setNotice({ text: 'Du gick med i rummet.', tone: 'info' });
      } else {
        setNotice({
          text: 'Hittade inget rum med den koden. Dubbelkolla och försök igen.',
          tone: 'error',
        });
      }
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Kunde inte gå med i rummet.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  // Byt aktivt rum. Fångar fel (nät/RLS) och visar dem (C3): annars blev det en
  // unhandled rejection + tyst miss (klicket "tog inte"). Samma fel-mönster som
  // handleCreate/handleJoin, så panelen fail-loud:ar konsekvent (PRINCIPLES §8).
  const handleSelect = async (roomId: string) => {
    setNotice(null);
    try {
      await store.selectRoom(roomId);
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Kunde inte byta rum.',
        tone: 'error',
      });
    }
  };

  // Lämna det aktiva rummet. Fångar fel (nät/RLS) och visar dem (C4): annars blev
  // det en unhandled rejection + ingen återkoppling när lämnandet misslyckas.
  const handleLeave = async (roomId: string) => {
    setNotice(null);
    try {
      await store.leaveRoom(roomId);
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Kunde inte lämna rummet.',
        tone: 'error',
      });
    }
  };

  return (
    <section
      aria-labelledby="rooms-heading"
      data-rooms-panel
      data-rooms-status={store.status}
      className="vm-rooms"
    >
      {/* Hero-header: "arena i kvällsljus" (SPEC §7), samma språk som dagliga
          hero:n. Dekor (glow + sheen) bor i en aria-hidden pseudo-yta; ALL text
          står på den opaka ytan under, aldrig på glow:en (kontrast-vakt). */}
      <header className="vm-rooms-hero relative mb-6 overflow-hidden rounded-card p-5 sm:p-6">
        <div className="relative">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Tips-ligan
          </p>
          <h2 id="rooms-heading" className="mt-1 font-display text-xl font-bold sm:text-2xl">
            Rum med kompisarna
          </h2>
          <p className="mt-2 max-w-prose text-sm text-fg-muted">
            Skapa ett rum och dela koden, eller gå med i ett befintligt. I ett rum fyller ni i
            matchresultaten tillsammans.
          </p>
        </div>
      </header>

      {store.status === 'error' && store.error && (
        <p
          role="alert"
          data-rooms-error
          className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          <span aria-hidden="true" className="font-bold leading-snug">
            !
          </span>
          <span className="leading-snug">{store.error}</span>
        </p>
      )}

      {/* Mina rum (klickbara, byt aktivt). */}
      {store.myRooms.length > 0 && (
        <div className="mb-6" data-rooms-list>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted">
            Mina rum
          </h3>
          <ul className="flex flex-col gap-2">
            {store.myRooms.map((room) => {
              const isActive = store.activeRoom?.id === room.id;
              return (
                <li key={room.id} data-rooms-list-item data-rooms-active={isActive}>
                  <button
                    type="button"
                    onClick={() => void handleSelect(room.id)}
                    aria-pressed={isActive}
                    aria-label={`Välj rummet ${room.name} (kod ${room.code})`}
                    className="vm-rooms-pick flex w-full items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5 text-left transition-[border-color,box-shadow,background-color] duration-150 outline-none hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] hover:shadow-[var(--vm-shadow-card)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
                  >
                    {/* Aktiv-markör: en liten prick som tänds för det valda rummet
                        (form-/färg-oberoende stöds av aria-pressed + texten). */}
                    <span
                      aria-hidden="true"
                      className="vm-rooms-pick-dot h-2 w-2 shrink-0 rounded-pill"
                      data-active={isActive}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{room.name}</span>{' '}
                      <span className="text-fg-muted">, kod {room.code}</span>
                    </span>
                    {isActive && (
                      <span className="shrink-0 rounded-pill bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] px-2 py-0.5 font-display text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-fg">
                        Aktivt
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Aktivt rum: BILJETTEN (delbar kod) + medlemmar + delade resultat + lämna. */}
      {store.activeRoom && (
        <div
          className="vm-rooms-ticket mb-6 overflow-hidden rounded-card border border-border"
          data-rooms-active-room
          aria-live="polite"
        >
          {/* Biljett-huvudet: den STORA, kopierbara koden. "Arena i kvällsljus"-
              ytan ger delnings-ögonblicket tyngd. */}
          <div className="vm-rooms-ticket-head relative overflow-hidden p-5 sm:p-6">
            <div className="relative flex flex-col gap-4">
              <div>
                <h3 className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                  <span className="text-fg-muted">Aktivt rum:</span>{' '}
                  <span className="text-fg">{store.activeRoom.name}</span>
                </h3>
                <p className="text-xs text-fg-muted">
                  Dela koden, så går kompisarna med och fyller i resultaten med dig.
                </p>
              </div>

              {/* Den kopierbara koden, stor och tydlig. role="group" + aria-label
                  ger sammanhanget; aria-live="off" på koden själv (statisk). */}
              <div
                className="vm-rooms-code flex flex-wrap items-center gap-x-3 gap-y-2"
                role="group"
                aria-label={`Rumskod ${store.activeRoom.code}, dela koden`}
              >
                <span
                  data-rooms-code
                  className="font-display text-[2rem] font-bold leading-none tracking-[0.14em] tabular-nums text-fg sm:text-[2.5rem]"
                >
                  {store.activeRoom.code}
                </span>
                <div className="flex items-center gap-2">
                  <CopyButton code={store.activeRoom.code} />
                  <ShareButton roomName={store.activeRoom.name} code={store.activeRoom.code} />
                </div>
              </div>
              {/* En SR-vänlig + synlig hint som kopplar koden till handlingen.
                  Behåller test-låst nyckeltext: "dela koden {code}". */}
              <p className="sr-only">dela koden {store.activeRoom.code}</p>
            </div>
          </div>

          {/* Biljett-kroppen: medlemmar, delade resultat, lämna. */}
          <div className="border-t border-border bg-surface p-5 sm:p-6">
            {/* Medlemslistan (T94, #187): komprimerad default + linjerat rutnät, egen
                rad pinnad överst. Presentationen bor i MemberGrid (ren komponent), så
                panelen bara matar in medlemmarna + den egna user-id:n. */}
            <div className="mb-4">
              <MemberGrid members={store.members} selfUserId={store.userId} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                className="inline-flex items-center gap-2 text-sm text-fg-muted"
                data-rooms-results-count
              >
                {/* En liten boll-glyf (dekor) + den test-låsta räkne-texten. Texten
                    bär själv siffran, så ingen separat siffer-bricka (den hade läst
                    som "11 ..." bredvid textens egna "1 ..."). */}
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-pill"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-accent) 70%, transparent)',
                  }}
                />
                <span className="tabular-nums">
                  {store.results.length === 1
                    ? '1 delade resultat'
                    : `${store.results.length} delade resultat`}
                </span>
              </p>
              <button
                type="button"
                onClick={() => void handleLeave(store.activeRoom!.id)}
                className="inline-flex h-9 items-center rounded-pill border border-border px-4 text-sm font-medium text-fg-muted transition-colors duration-150 outline-none hover:border-[color-mix(in_srgb,var(--color-danger)_45%,var(--color-border))] hover:text-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
                data-rooms-leave
              >
                Lämna rummet
              </button>
            </div>

            {/* T52 (#91): kopiera mina tips hit från ett annat rum jag är med i.
                Renderar sig själv bara när det finns ett annat rum att kopiera från
                (annars null), så ingen tom ruta visas i ett ensamt rum. */}
            <CopyTipsControl />

            {/* T66 (#121): kommentarer i rummet. Egen CommentsProvider scopad till det
                aktiva rummet (läser activeRoomId + userId via rooms-synk-seamen), så
                snacket runt matcherna lever live utan reload (Realtime, signal -> tyst
                refetch). RoomComments renderar inget om lagret är inaktivt. */}
            <CommentsProvider>
              <RoomComments />
            </CommentsProvider>
          </div>
        </div>
      )}

      {/* Lokalt meddelande (skapad/gick med/okänd kod). Vänligt info-besked vs ett
          tydligt fel-besked, skilda visuellt men båda role="status" (uppläst). */}
      {notice && (
        <p
          role="status"
          data-rooms-notice
          data-rooms-notice-tone={notice.tone}
          className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm"
          style={
            notice.tone === 'error'
              ? {
                  borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
                  color: 'var(--color-danger)',
                }
              : {
                  borderColor: 'color-mix(in srgb, var(--color-accent) 35%, var(--color-border))',
                  backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                  color: 'var(--color-fg)',
                }
          }
        >
          <span aria-hidden="true" className="font-bold leading-snug">
            {notice.tone === 'error' ? '!' : '✓'}
          </span>
          <span className="leading-snug">{notice.text}</span>
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Skapa rum. */}
        <form
          onSubmit={handleCreate}
          data-rooms-create-form
          className="vm-rooms-form flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:p-5"
        >
          <h3 className="font-display text-sm font-semibold">Skapa ett rum</h3>
          <label htmlFor={createNameId} className="text-sm font-medium text-fg-muted">
            Rummets namn
            <input
              id={createNameId}
              type="text"
              required
              maxLength={60}
              placeholder="t.ex. Kompisgänget"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className={FIELD_BASE}
            />
          </label>
          <label htmlFor={createDisplayId} className="text-sm font-medium text-fg-muted">
            Ditt visningsnamn
            <input
              id={createDisplayId}
              type="text"
              required
              maxLength={40}
              placeholder="Vad ska kompisarna se?"
              value={createDisplay}
              onChange={(e) => setCreateDisplay(e.target.value)}
              className={FIELD_BASE}
            />
          </label>
          <button type="submit" disabled={busy} className={BTN_PRIMARY}>
            Skapa rum
          </button>
        </form>

        {/* Gå med via kod. */}
        <form
          onSubmit={handleJoin}
          data-rooms-join-form
          className="vm-rooms-form flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:p-5"
        >
          <h3 className="font-display text-sm font-semibold">Gå med via kod</h3>
          <label htmlFor={joinCodeId} className="text-sm font-medium text-fg-muted">
            Rumskod
            <input
              id={joinCodeId}
              type="text"
              required
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              placeholder="Klistra in koden"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className={`${FIELD_BASE} font-display tracking-[0.1em]`}
            />
          </label>
          <label htmlFor={joinDisplayId} className="text-sm font-medium text-fg-muted">
            Ditt visningsnamn
            <input
              id={joinDisplayId}
              type="text"
              required
              maxLength={40}
              placeholder="Vad ska kompisarna se?"
              value={joinDisplay}
              onChange={(e) => setJoinDisplay(e.target.value)}
              className={FIELD_BASE}
            />
          </label>
          <button type="submit" disabled={busy} className={BTN_SECONDARY}>
            Gå med
          </button>
        </form>
      </div>
    </section>
  );
}
