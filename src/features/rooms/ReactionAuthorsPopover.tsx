// "Vem reagerade"-popovern (T74, #157): visar VILKA som valt en emoji + NÄR, ovanför
// reaktions-brickan, så fingret (vid långtryck) aldrig skymmer infot.
//
// SCOPE (senior-devs FUNKTIONELLA + a11y-lager): en liten popover med en lista
// (namn + tid), placerad OVANFÖR ankaret (brickan) och klampad inom viewporten (ingen
// overflow utanför skärmen). Designen lägger premium-finishen ovanpå UTAN att
// röra logik/positionering (samma seam-princip som RoomComments/MatchReactions): den
// hänger bara på data-reaction-authors-* + de rena positions-värdena.
//
// PLACERING (fingret får inte blocka): popovern ligger `position: fixed` ovanför
// ankarets ovankant (bottom-kant strax över brickan), HORISONTELLT centrerad över
// ankaret men KLAMPAD så den aldrig sticker ut vänster/höger ur viewporten (T74-kravet
// "håll den inom skärmen"). Vi mäter ankaret + popovern med getBoundingClientRect och
// klampar i en useLayoutEffect (före paint, inget hopp). I jsdom är rect:arna 0 (ingen
// layout), då faller vi till en säker default, positionerings-mekaniken testas inte på
// pixel utan på beteende (synlig/dold + a11y), per task-direktivet.
//
// A11y (icke-touch + skärmläsare): role="tooltip" + ett stabilt id som triggern pekar
// på via aria-describedby (sätts i MatchReactions). Innehållet är riktig text (namn +
// <time>), inte bara visuellt, så en skärmläsare läser upp vilka som reagerat.
//
// VISUELL FINISH (designen, T74 finputs): popovern får en liten PIL/pekare mot
// ankar-brickan (`.vm-reaction-authors-arrow`, aria-hidden dekor) så det är tydligt
// vilken reaktion listan gäller, en diskret in-känsla (`.vm-reaction-authors-in`,
// keyframes i rooms.css GATAD på prefers-reduced-motion), och en MAX-HÖJD + lugn scroll
// på själva listan när många reagerat, så popovern aldrig växer sig så hög att den
// skymmer ankar-brickan eller blir rörig. Rubriken ligger UTANFÖR scroll-ytan (alltid
// synlig), bara namn-raderna scrollar. Inget av detta rör positionerings-LOGIKEN (JS).

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { avatarHueFromId, initialsFromName } from './member-avatar';
import type { ReactionAuthorRow } from './reaction-authors';

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

/** Marginal (px) till skärmkanten när popovern klampas, så den aldrig nuddar kanten. */
const VIEWPORT_MARGIN = 8;
/** Avstånd (px) mellan popoverns underkant och ankarets ovankant (luft över brickan). */
const ANCHOR_GAP = 8;

export interface ReactionAuthorsPopoverProps {
  /** Stabilt id (triggern pekar på det via aria-describedby). */
  id: string;
  /** Emojin popovern gäller (för rubriken "Reagerade med X"). */
  emoji: string;
  /** Läsbart emoji-namn (skärmläsare), t.ex. "het match". */
  emojiLabel: string;
  /** Raderna att visa (namn + tid + min), redan härledda + sorterade. */
  authors: ReactionAuthorRow[];
  /** Ankaret popovern placeras ovanför (reaktions-brickan). */
  anchorRef: RefObject<HTMLElement | null>;
}

/**
 * Popovern som listar vilka som reagerat med en viss emoji. Positioneras ovanför
 * ankaret och klampas inom viewporten. Renderar en tom-rad-fallback om listan är tom
 * (defensivt: triggern visar bara popovern när det finns reaktioner, men en tom lista
 * ska ändå ge en begriplig text, aldrig en trasig tom ruta).
 */
export function ReactionAuthorsPopover({
  id,
  emoji,
  emojiLabel,
  authors,
  anchorRef,
}: ReactionAuthorsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Default: centrerad högt upp. Beräknas om i layout-effekten mot riktiga rect:ar.
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
  });

  // POSITIONERA (före paint): centrera horisontellt över ankaret, lägg underkanten
  // strax ovanför ankaret, och KLAMPA inom viewporten (ingen overflow). useLayoutEffect
  // så placeringen sker innan webbläsaren målar (inget synligt hopp). Mäts varje gång
  // popovern visas (mount) + om raderna ändras (höjd kan växa).
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) {
      return;
    }
    const a = anchor.getBoundingClientRect();
    const p = popover.getBoundingClientRect();
    const viewportW = window.innerWidth || 0;
    const viewportH = window.innerHeight || 0;

    // Horisontellt: centrera över ankaret, klampa [margin, viewport - bredd - margin].
    const centeredLeft = a.left + a.width / 2 - p.width / 2;
    const maxLeft = Math.max(VIEWPORT_MARGIN, viewportW - p.width - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft);

    // Vertikalt: lägg popovern OVANFÖR ankaret (underkant = ankarets ovankant - gap).
    // Klampa inom [margin, viewport - höjd - margin], SAMMA mönster som horisontellt:
    // uppåt så den aldrig hamnar ovanför skärmkanten, OCH nedåt så en hög popover (många
    // rader) aldrig spiller ut under skärmkanten. maxTop:s yttre Math.max ger margin som
    // golv om popovern är högre än hela viewporten (best-effort, klampa då till toppen).
    const maxTop = Math.max(VIEWPORT_MARGIN, viewportH - p.height - VIEWPORT_MARGIN);
    const top = Math.min(Math.max(a.top - p.height - ANCHOR_GAP, VIEWPORT_MARGIN), maxTop);

    // Uppdatera BARA när positionen faktiskt ändras: en realtids-refresh kan ge en ny
    // authors-referens utan att left/top rör sig, och en setPos med samma värden vore en
    // onödig re-render (Copilot, PR #160). Funktionell update returnerar prev oförändrad.
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
    // Deps: authors.LENGTH (inte hela arrayen) , bara RAD-ANTALET påverkar popoverns höjd
    // och därmed placeringen; en ny array-referens med samma längd ska inte mäta om.
  }, [anchorRef, authors.length]);

  return (
    <div
      ref={popoverRef}
      id={id}
      role="tooltip"
      data-reaction-authors-popover=""
      data-reaction-authors-emoji={emoji}
      className="vm-reaction-authors vm-reaction-authors-in fixed z-50 max-w-[min(16rem,calc(100vw-1rem))] rounded-card border border-border bg-surface-raised p-2.5 text-left shadow-[var(--vm-shadow-raised)]"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
        <span aria-hidden="true" className="text-sm leading-none">
          {emoji}
        </span>
        <span>
          Reagerade med {emojiLabel} ({authors.length})
        </span>
      </p>
      {authors.length === 0 ? (
        <p className="text-xs text-fg-muted" data-reaction-authors-empty>
          Ingen har reagerat med den här emojin.
        </p>
      ) : (
        // MAX-HÖJD + lugn scroll: vid många reagerande växer popovern inte obegränsat
        // (skulle annars klampas mot skärmtoppen och skymma ankar-brickan). ~5,5 rader
        // syns, resten scrollas, så listan förblir kompakt och aldrig rörig. Rubriken
        // ovanför scrollar inte med (alltid synlig). overscroll-contain hindrar att
        // scrollen läcker till sidan bakom på touch.
        <ul
          className="vm-reaction-authors-scroll flex max-h-[11.5rem] flex-col gap-1.5 overflow-y-auto overscroll-contain"
          data-reaction-authors-list
        >
          {authors.map((author) => {
            const hue = avatarHueFromId(author.userId);
            return (
              <li
                key={author.userId}
                data-reaction-authors-item
                data-reaction-authors-mine={author.mine ? '' : undefined}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className="vm-rooms-avatar flex h-6 w-6 shrink-0 items-center justify-center rounded-pill font-display text-[0.625rem] font-bold leading-none"
                  style={{ '--vm-avatar-hue': hue } as React.CSSProperties}
                >
                  {initialsFromName(author.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
                  {author.name}
                  {author.mine && <span className="font-normal text-fg-muted"> (du)</span>}
                </span>
                <time
                  className="shrink-0 text-[0.6875rem] text-fg-muted"
                  dateTime={author.createdAtIso}
                >
                  {formatTime(author.createdAtIso)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
      {/* PIL mot ankar-brickan: en liten pekare på popoverns underkant, centrerad, så det
          är tydligt vilken reaktion listan gäller (popovern ligger ovanför brickan). Ren
          dekor (aria-hidden), bär ingen text; formen + fyllningen bor i rooms.css. */}
      <span aria-hidden="true" className="vm-reaction-authors-arrow" />
    </div>
  );
}
