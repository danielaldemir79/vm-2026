// Kommentar-UI i rummet (T66, #121).
//
// SCOPE (KISS, MVP): en lista med kommentarer (ÄLDST överst, nyast nederst =
// chatt-konvention) + ett textfält + en skicka-knapp + en radera-knapp på MINA egna
// rader. Ingen trådning, inga reaktioner (#24 är separat), ingen auto-scroll (KISS).
//
// SEMANTIK + DATA-HAKAR äger detta lager (data-comments-*, role/aria, etiketter);
// design-frontend lägger premium-finishen ovanpå UTAN att röra logiken (samma
// seam-princip som RoomPanel). Stilen lutar sig på rooms.css + Tailwind-klasserna här.
//
// SÄKER RENDERING (HARD): kommentar-texten renderas som ren React-text-nod (default-
// escaping), ALDRIG dangerouslySetInnerHTML. En "<script>"-sträng visas alltså som
// bokstavlig text, ingen HTML/JS injiceras. Längden gränsas i klienten (COMMENT_MAX_LEN)
// OCH i DB:n (CHECK), så fältet inte är en obegränsad text-yta.
//
// VISNINGSNAMN slås upp i medlemslistan (room_members) som RoomsProvider redan har:
// kommentaren bär bara user_id (migrations-beslutet). En författare som lämnat rummet
// saknas i listan -> faller till "Tidigare medlem" (ofarligt, ingen krasch).

import { useId, useMemo, useState, type FormEvent } from 'react';
import { COMMENT_MAX_LEN } from '../../data/rooms';
import { useRoomsStore } from './rooms-context';
import { useCommentsStore } from './comments-context';
import { avatarHueFromId, initialsFromName } from './member-avatar';

// Fält-stil i SAMMA premium-formspråk som RoomPanel-fälten (FIELD_BASE där): stark,
// tema-trogen fokus-ring (WCAG 2.4.7) + mjuk hover. En sanning för formkänslan.
// Den vilar nu på den varma kvällsljus-ytan (.vm-comment-input i rooms.css) så
// skriv-raden känns som en del av snacket, inte en främmande bg-bg-platta.
const FIELD_BASE =
  'vm-comment-input mt-0 w-full rounded-card border border-border px-3.5 py-3 text-fg ' +
  'transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-fg-muted/70 ' +
  'focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))]';

// Skicka-knappen: fylld accent med en liten pappersflygplans-glyf, samma lyft-recept
// som BTN_PRIMARY i RoomPanel (#39). Inbjudande, men ärlig i sitt disabled-läge.
const BTN_SEND =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-pill bg-accent px-5 ' +
  'font-display text-sm font-semibold text-accent-fg shadow-sm ' +
  'transition-[transform,box-shadow,filter] duration-150 outline-none ' +
  'hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ' +
  'active:translate-y-px active:brightness-95 disabled:opacity-60 disabled:hover:brightness-100';

// Hur nära gränsen räknaren börjar varna (visuell förstärkning, ren design). Under
// tröskeln är den tyst dämpad; nära gränsen blir den varm (warning), över gränsen
// blir den danger. Logiken (canSend/tooLong) är oförändrad, detta styr bara tonen.
// LAT funktion, INTE modul-konstant (review-F1): en modul-nivå-läsning av den
// importerade COMMENT_MAX_LEN evalueras eagert via rooms-barreln och knäckte två
// orelaterade testfilers ofullständiga vi.mock av '../../data/rooms'.
function countWarnAt(): number {
  return Math.floor(COMMENT_MAX_LEN * 0.9);
}

/** En läsbar lokal tid ur en ISO-tidsstämpel (sv-SE, kort). Fail-safe: rå sträng vid skräp. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString('sv-SE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Kommentar-sektionen för det AKTIVA rummet. Renderar inget om kommentar-lagret är
 * inaktivt (inget aktivt rum / live ej konfigurerat), så ingen tom ruta visas.
 */
export function RoomComments() {
  const comments = useCommentsStore();
  const rooms = useRoomsStore();
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  // Visningsnamn per user_id ur medlemslistan (EN sanning, room_members). Memoiserad
  // så uppslaget inte byggs om vid varje knapptryck i fältet.
  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of rooms.members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [rooms.members]);

  if (!comments.enabled) {
    return null;
  }

  const trimmed = draft.trim();
  const tooLong = trimmed.length > COMMENT_MAX_LEN;
  const canSend = trimmed.length > 0 && !tooLong && !busy;
  // Räknarens TON (ren förstärkning): tyst tills man närmar sig gränsen, sedan varm,
  // sedan danger. Bär inte själv betydelsen (siffran gör det), så färg-oberoende.
  const countTone = tooLong ? 'over' : trimmed.length >= countWarnAt() ? 'near' : 'calm';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUiError(null);
    if (!canSend) {
      return;
    }
    setBusy(true);
    try {
      await comments.addComment(trimmed);
      setDraft(''); // töm fältet efter lyckad skickning
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Kunde inte skicka kommentaren.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setUiError(null);
    try {
      await comments.deleteComment(commentId);
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Kunde inte radera kommentaren.');
    }
  };

  return (
    <section
      aria-labelledby="room-comments-heading"
      data-comments-panel
      data-comments-status={comments.status}
      className="mt-6 border-t border-border pt-5"
    >
      <h4
        id="room-comments-heading"
        className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted"
      >
        Kommentarer ({comments.comments.length})
      </h4>

      {comments.status === 'error' && comments.error && (
        <p
          role="alert"
          data-comments-error
          className="mb-3 rounded-md border px-3 py-2.5 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {comments.error}
        </p>
      )}

      {/* Lista: ÄLDST överst, nyast nederst (chatt-konvention). aria-live="polite" så
          en ny kommentar (även en väns, via realtid) läses upp diskret. Tom-läge får
          en lugn, centrerad hint i stället för en tom yta. */}
      {comments.comments.length === 0 ? (
        <div className="vm-comment-empty mb-4 flex flex-col items-center gap-2 rounded-card border border-border px-4 py-7 text-center">
          <span
            aria-hidden="true"
            className="vm-comment-empty-glyph flex h-9 w-9 items-center justify-center rounded-pill text-base leading-none"
          >
            💬
          </span>
          <p className="text-sm text-fg-muted" data-comments-empty>
            Inga kommentarer än. Skriv det första meddelandet till gänget!
          </p>
        </div>
      ) : (
        <ul
          className="vm-comment-list mb-4 flex flex-col gap-3.5"
          data-comments-list
          aria-live="polite"
        >
          {comments.comments.map((c) => {
            const isMine = c.userId === comments.userId;
            const name = nameByUser.get(c.userId) ?? 'Tidigare medlem';
            const hue = avatarHueFromId(c.userId);
            return (
              <li
                key={c.id}
                data-comments-item
                data-comments-mine={isMine}
                className="vm-comment flex items-start gap-2.5"
              >
                <span
                  aria-hidden="true"
                  className="vm-rooms-avatar vm-comment-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-pill font-display text-xs font-bold leading-none"
                  style={{ '--vm-avatar-hue': hue } as React.CSSProperties}
                >
                  {initialsFromName(name)}
                </span>
                {/* Bubblan: egna meddelanden får en diskret accent-tonad yta (CSS via
                    data-comments-mine), andras den lugna surface-ytan. Bubblan hugger
                    innehållet upp till en max-bredd (CSS), så mina hamnar till höger och
                    andras till vänster = chatt-rytm. Färg-oberoende: "(du)" + namnet
                    bär ändå avsändaren. */}
                <div className="vm-comment-bubble min-w-0 rounded-card border border-border px-3.5 py-2.5">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold text-fg" data-comments-author>
                      {name}
                      {isMine && <span className="font-normal text-fg-muted"> (du)</span>}
                    </span>
                    <time className="text-fg-muted" dateTime={c.createdAt}>
                      {formatTime(c.createdAt)}
                    </time>
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(c.id)}
                        data-comments-delete
                        aria-label="Radera min kommentar"
                        className="vm-comment-delete ml-auto shrink-0 rounded-pill px-2 py-0.5 text-xs font-medium text-fg-muted transition-[color,background-color] duration-150 outline-none hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[color-mix(in_srgb,var(--color-danger)_72%,var(--color-fg))] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
                      >
                        Radera
                      </button>
                    )}
                  </p>
                  {/* Texten som ren React-text-nod = HTML-escapad (säker rendering). */}
                  <p
                    className="mt-1 whitespace-pre-wrap break-words text-sm text-fg"
                    data-comments-body
                  >
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Skriv-fältet. maxLength ger en hård gräns i fältet; canSend gatar tom/för lång
          + busy. role="status" på fel-raden så den läses upp. */}
      <form onSubmit={handleSubmit} data-comments-form className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-fg-muted">
          Skriv en kommentar
          <textarea
            id={inputId}
            data-comments-input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={COMMENT_MAX_LEN}
            rows={2}
            placeholder="Snacka match med gänget..."
            className={`${FIELD_BASE} resize-y`}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          {/* Teckenräknare: tyst dämpad tills man närmar sig gränsen (warm), danger
              över. data-count-tone styr bara FÄRGEN (CSS); siffran bär betydelsen
              (färg-oberoende). aria-live så SR hör den när den ändras. */}
          <span
            data-comments-count
            data-count-tone={countTone}
            aria-live="polite"
            className="vm-comment-count text-xs font-medium tabular-nums text-fg-muted"
          >
            {trimmed.length}/{COMMENT_MAX_LEN}
          </span>
          <button type="submit" disabled={!canSend} className={BTN_SEND} data-comments-send>
            <span aria-hidden="true" className="text-sm leading-none">
              ➤
            </span>
            Skicka
          </button>
        </div>
        {uiError && (
          <p
            role="status"
            data-comments-ui-error
            className="text-sm"
            style={{ color: 'var(--color-danger)' }}
          >
            {uiError}
          </p>
        )}
      </form>
    </section>
  );
}
