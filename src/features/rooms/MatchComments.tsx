// Per-match kommentar-affordans + utfällbar tråd PÅ matchkortet (T77, #161).
//
// DANIELS VAL (#161): per-match kommentarer, men HOPFÄLLDA så kortet inte blir rörigt.
// Default är en liten "Kommentarer (N)"-knapp (0 = "Kommentera") i samma anda som
// reaktions-raden (T24), under kortets metadata. Tryck -> tråden fälls ut UNDER kortet
// (skriv + läs); tryck igen -> fäll ihop. Per match, per rum, realtid.
//
// SCOPE (KISS): en hopfälld knapp + (utfälld) en lista (ÄLDST överst, nyast nederst =
// chatt-konvention) + ett textfält + skicka + radera på MINA rader. Ingen trådning i
// trådning, ingen redigering (samma MVP-anda som RoomComments/T66).
//
// SEMANTIK + DATA-HAKAR äger detta lager (data-match-comments-*, role/aria, etiketter);
// design-frontend lägger premium-finishen ovanpå UTAN att röra logiken (samma seam-
// princip som MatchReactions/RoomComments). Renderar INGET om kommentar-lagret är
// inaktivt (inget aktivt rum / live ej konfigurerat), så ett matchkort i lokalt läge är
// orört, precis som reaktions-raden.
//
// A11y: hopfäll-knappen bär aria-expanded + aria-controls mot tråd-panelen (WCAG 4.1.2),
// så en skärmläsare hör om tråden är öppen/stängd och vad knappen styr. Texten ("N
// kommentarer" / "Kommentera") bär betydelsen, ikonen är dekor.
//
// SÄKER RENDERING (HARD, samma som RoomComments): kommentar-texten renderas som ren
// React-text-nod (default-escaping), ALDRIG dangerouslySetInnerHTML, så en "<script>"-
// sträng visas bokstavligt. Längden gränsas i klienten (COMMENT_MAX_LEN) OCH i DB:n.
//
// VISNINGSNAMN slås upp i medlemslistan (room_members) som storen redan bär (nameByUser,
// EN sanning). En författare som lämnat rummet faller till "Tidigare medlem" (ofarligt).

import { useId, useState, type FormEvent } from 'react';
import { COMMENT_MAX_LEN } from '../../data/rooms';
import { useMatchCommentsStore } from './match-comments-context';
import { threadForMatch } from './match-comments-aggregate';
import { avatarHueFromId, initialsFromName } from './member-avatar';

// Fält-stil i SAMMA premium-formspråk som RoomComments-fältet (.vm-comment-input,
// FIELD_BASE där). En sanning för formkänslan; design-frontend finputsar ovanpå.
const FIELD_BASE =
  'vm-comment-input mt-0 w-full rounded-card border border-border px-3.5 py-3 text-fg ' +
  'transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-fg-muted/70 ' +
  'focus-visible:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))]';

// Skicka-knappen: samma recept som RoomComments BTN_SEND. Ärlig i sitt disabled-läge.
const BTN_SEND =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-pill bg-accent px-5 ' +
  'font-display text-sm font-semibold text-accent-fg shadow-sm ' +
  'transition-[transform,box-shadow,filter] duration-150 outline-none ' +
  'hover:brightness-105 hover:shadow-[var(--vm-shadow-raised)] ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] ' +
  'active:translate-y-px active:brightness-95 disabled:opacity-60 disabled:hover:brightness-100';

// Hopfäll-knappen (affordansen): en diskret pill i reaktions-radens anda (vm-reaction-add),
// så reaktioner + kommentarer talar samma lågmälda fotrads-språk under kortet.
const BTN_TOGGLE =
  'vm-match-comments-toggle inline-flex h-7 items-center gap-1 rounded-pill border border-dashed ' +
  'border-border px-2 text-sm leading-none text-fg-muted transition-[border-color,color] duration-150 ' +
  'outline-none hover:border-accent hover:text-accent ' +
  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] ' +
  'aria-expanded:border-accent aria-expanded:text-accent';

export interface MatchCommentsProps {
  /** Matchen kommentar-tråden gäller (match-id ur planen). */
  matchId: string;
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
 * Kommentar-affordansen för EN match. Hopfälld default (bara "Kommentarer (N)"-knappen);
 * tryck fäller ut tråden UNDER kortet. Renderar inget om kommentar-lagret är inaktivt
 * (inget aktivt rum / live ej konfigurerat), så ett matchkort i lokalt läge är orört.
 */
export function MatchComments({ matchId }: MatchCommentsProps) {
  const store = useMatchCommentsStore();
  const panelId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  if (!store.enabled) {
    return null;
  }

  const thread = threadForMatch(store.byMatch, matchId);
  const trimmed = draft.trim();
  const tooLong = trimmed.length > COMMENT_MAX_LEN;
  const canSend = trimmed.length > 0 && !tooLong && !busy;

  // Knapp-texten bär betydelsen (färg-oberoende): 0 = "Kommentera", annars antalet.
  const toggleText = thread.count === 0 ? 'Kommentera' : `Kommentarer (${thread.count})`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUiError(null);
    if (!canSend) {
      return;
    }
    setBusy(true);
    try {
      await store.addComment(matchId, trimmed);
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
      await store.deleteComment(commentId);
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Kunde inte radera kommentaren.');
    }
  };

  return (
    <div
      data-match-comments=""
      data-match-comments-match={matchId}
      data-match-comments-count={thread.count}
      data-match-comments-open={open ? '' : undefined}
      className="mt-2 flex flex-col gap-2"
    >
      {/* Hopfäll-knappen (affordansen): aria-expanded/-controls knyter den till tråd-
          panelen. En diskret pratbubble-glyf + texten. Hopfälld default. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-match-comments-toggle=""
        aria-expanded={open}
        aria-controls={panelId}
        className={BTN_TOGGLE}
      >
        <span aria-hidden="true" className="text-sm leading-none">
          💬
        </span>
        <span className="text-xs font-medium">{toggleText}</span>
      </button>

      {/* Tråd-panelen: utfälld bara när open. id matchar knappens aria-controls. Renderas
          BARA när öppen (KISS, ingen alltid-monterad tråd som tar plats/minne per kort). */}
      {open && (
        <section
          id={panelId}
          data-match-comments-panel=""
          data-match-comments-status={store.status}
          aria-label={`Kommentarer för matchen (${thread.count})`}
          className="vm-match-comments-panel flex flex-col gap-3 rounded-card border border-border px-3.5 py-3"
        >
          {store.status === 'error' && store.error && (
            <p
              role="alert"
              data-match-comments-error=""
              className="rounded-md border px-3 py-2.5 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
                color: 'var(--color-danger)',
              }}
            >
              {store.error}
            </p>
          )}

          {/* Lista: ÄLDST överst, nyast nederst (chatt-konvention). aria-live="polite" så
              en ny kommentar (även en väns, via realtid) läses upp diskret. Tom-läge får
              en lugn hint i stället för en tom yta. */}
          {thread.count === 0 ? (
            <p className="text-sm text-fg-muted" data-match-comments-empty="">
              Inga kommentarer än. Var först med att snacka om den här matchen!
            </p>
          ) : (
            <ul
              className="vm-comment-list flex flex-col gap-3.5"
              data-match-comments-list=""
              aria-live="polite"
            >
              {thread.comments.map((c) => {
                const isMine = c.userId === store.userId;
                const name = store.nameByUser.get(c.userId) ?? 'Tidigare medlem';
                const hue = avatarHueFromId(c.userId);
                return (
                  <li
                    key={c.id}
                    data-match-comments-item=""
                    data-match-comments-mine={isMine}
                    className="vm-comment flex items-start gap-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="vm-rooms-avatar vm-comment-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-pill font-display text-xs font-bold leading-none"
                      style={{ '--vm-avatar-hue': hue } as React.CSSProperties}
                    >
                      {initialsFromName(name)}
                    </span>
                    <div className="vm-comment-bubble min-w-0 rounded-card border border-border px-3.5 py-2.5">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="font-semibold text-fg" data-match-comments-author="">
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
                            data-match-comments-delete=""
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
                        data-match-comments-body=""
                      >
                        {c.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Skriv-fältet. maxLength ger en hård gräns i fältet; canSend gatar tom/för
              lång + busy. */}
          <form onSubmit={handleSubmit} data-match-comments-form="" className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-sm font-medium text-fg-muted">
              Skriv en kommentar
              <textarea
                id={inputId}
                data-match-comments-input=""
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={COMMENT_MAX_LEN}
                rows={2}
                placeholder="Snacka om den här matchen..."
                className={`${FIELD_BASE} resize-y`}
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span
                data-match-comments-counter=""
                aria-live="polite"
                className="vm-comment-count text-xs font-medium tabular-nums text-fg-muted"
              >
                {trimmed.length}/{COMMENT_MAX_LEN}
              </span>
              <button
                type="submit"
                disabled={!canSend}
                className={BTN_SEND}
                data-match-comments-send=""
              >
                <span aria-hidden="true" className="text-sm leading-none">
                  ➤
                </span>
                Skicka
              </button>
            </div>
            {uiError && (
              <p
                role="status"
                data-match-comments-ui-error=""
                className="text-sm"
                style={{ color: 'var(--color-danger)' }}
              >
                {uiError}
              </p>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
