// Reaktions-RAD på ett matchkort (T24, #24).
//
// SCOPE (KISS, MVP): en rad under matchkortet med (a) de befintliga reaktionerna som
// brickor (emoji + antal, MIN markerad), klickbara för att byta/avmarkera, och (b) en
// "lägg till reaktion"-knapp som fäller ut den kurerade 8-emoji-väljaren. En reaktion
// per användare och match: att trycka en emoji jag redan valt AVMARKERAR den, en annan
// BYTER. MVP-ytan är matchkorten i dagens-vyn (där snacket händer, decisions.md T24).
//
// SEMANTIK + DATA-HAKAR äger detta lager (data-reactions-*, role/aria, etiketter);
// design-frontend lägger premium-finishen ovanpå UTAN att röra logiken (samma
// seam-princip som RoomComments). Renderar INGET om reaktions-lagret är inaktivt
// (inget aktivt rum / live ej konfigurerat), så ett matchkort i lokalt läge är orört.
//
// A11y: väljaren är en utfällbar grupp med riktiga <button>:ar; varje bricka/knapp har
// ett tydligt aria-label ("Reagera med eld, 2 reaktioner, din reaktion"). aria-pressed
// bär "min" status FÄRG-OBEROENDE (skärmläsare hör vald/ej vald utan att se markeringen).
//
// SE VILKA SOM REAGERAT (T74, #157): varje BRICKA är också en trigger för en popover
// som listar VILKA (namn) som valt emojin + NÄR. Tre vägar att öppna den (touch + desktop
// + tangentbord):
//   - TOUCH: LÅNGTRYCK (håll ~500 ms, use-long-press) -> popover; SLÄPP -> dölj. Tröskeln
//     skiljer ett långtryck från ett tap (som togglar reaktionen), och vi sväljer click:et
//     som följer ett långtryck så håll-gesten inte OCKSÅ togglar (suppressNextClick).
//   - DESKTOP: HOVER (pointerenter/leave) visar/döljer popovern.
//   - TANGENTBORD: FOCUS (focus/blur) visar/döljer den, så den når utan touch eller mus.
// Popovern placeras OVANFÖR brickan (fingret skymmer den inte) och klampas inom viewporten
// (ReactionAuthorsPopover). Triggern pekar på popovern via aria-describedby (skärmläsare).

import { useId, useRef, useState } from 'react';
import { REACTION_EMOJIS, type ReactionEmoji } from '../../data/rooms';
import { useReactionsStore } from './reactions-context';
import { summaryForMatch, type ReactionTally } from './reaction-aggregate';
import { resolveReactionAuthors } from './reaction-authors';
import { useLongPress } from './use-long-press';
import { ReactionAuthorsPopover } from './ReactionAuthorsPopover';

// Svenska namn på emojierna för skärmläsare (aria-label), så de inte läses som råa
// kodpunkter. Speglar betydelserna i migrationen/decisions.md (T24).
const EMOJI_LABEL: Record<ReactionEmoji, string> = {
  '⚽': 'mål',
  '🔥': 'het match',
  '😂': 'skratt',
  '😭': 'besvikelse',
  '🎉': 'fira',
  '👏': 'bra spelat',
  '😱': 'chock',
  '🧊': 'iskall',
};

export interface MatchReactionsProps {
  /** Matchen reaktions-raden gäller (match-id ur planen). */
  matchId: string;
}

interface ReactionTallyButtonProps {
  /** Aggregatet för EN emoji (emoji, antal, min, reagerarna). */
  tally: ReactionTally;
  /** userId -> displayName (ur rummets medlemmar), för popoverns namn. */
  nameByUser: ReadonlyMap<string, string>;
  /** Mitt user_id (för "(du)"-markering i popovern). */
  myUserId: string | null;
  /** Toggla reaktionen (min -> avmarkera, annars byt till den). */
  onToggle: (emoji: ReactionEmoji) => void;
}

/**
 * EN reaktions-bricka (emoji + antal) som OCKSÅ är trigger för "vem reagerade"-popovern.
 *
 * VARFÖR egen komponent: varje bricka behöver sitt EGET ankar-ref, sin egen long-press-
 * timer och sin egen öppen/stängd-status. Att hålla det per bricka (i stället för en
 * delad karta i MatchReactions) gör varje bricka självständig och hooken (useLongPress)
 * anropas på toppnivå i en komponent (regler), en per bricka.
 *
 * INTERAKTION (T74): klick togglar reaktionen (om det inte var ett långtryck, då sväljs
 * click:et). Långtryck/hover/focus öppnar popovern; släpp/leave/blur stänger den.
 */
function ReactionTallyButton({ tally, nameByUser, myUserId, onToggle }: ReactionTallyButtonProps) {
  const popoverId = useId();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  // Öppen via touch (långtryck) ELLER via hover/focus (desktop/tangentbord). Två källor
  // sammanvägs: popovern visas om NÅGON av dem är aktiv.
  const [hoverFocusOpen, setHoverFocusOpen] = useState(false);

  // Långtryck-vägen (touch): popovern visas medan longPress.active. Ingen onLongPress-
  // callback behövs, vi läser `active` direkt (en sanning för touch-synligheten).
  const longPress = useLongPress({});

  const open = longPress.active || hoverFocusOpen;

  const handleClick = () => {
    // Svälj click:et som följer ETT långtryck (annars hade håll-gesten också togglat
    // reaktionen). shouldSuppressClick läser SYNKRONT (ref): ett pointerup + det click
    // som följer i samma React-flush får rätt svar. Ett vanligt tap går igenom som vanligt.
    if (longPress.shouldSuppressClick()) {
      return;
    }
    onToggle(tally.emoji);
  };

  // Härled popover-raderna BARA när popovern är öppen (ingen onödig mappning annars).
  const authors = open ? resolveReactionAuthors(tally.reactors, nameByUser, myUserId) : [];

  return (
    <span className="relative inline-flex">
      <button
        ref={anchorRef}
        type="button"
        onClick={handleClick}
        onPointerDown={longPress.handlers.onPointerDown}
        onPointerUp={longPress.handlers.onPointerUp}
        onPointerLeave={(e) => {
          longPress.handlers.onPointerLeave(e);
          // Stäng hover-/focus-öppningen BARA om knappen inte har fokus. Öppnades
          // popovern via tangentbord (focus) och musen råkar lämna knappen ska den
          // INTE stängas , det skulle bryta tangentbords-vägen. onBlur stänger den
          // fokus-öppnade vägen (Copilot, PR #160).
          if (document.activeElement !== e.currentTarget) {
            setHoverFocusOpen(false);
          }
        }}
        onPointerCancel={longPress.handlers.onPointerCancel}
        onPointerEnter={(e) => {
          // Hover öppnar popovern, men BARA för en mus/penna (hover finns inte på touch);
          // ett touch-pointerenter ska inte öppna direkt, där äger långtrycket gesten.
          if (e.pointerType !== 'touch') {
            setHoverFocusOpen(true);
          }
        }}
        onFocus={() => setHoverFocusOpen(true)}
        onBlur={() => setHoverFocusOpen(false)}
        data-reactions-tally={tally.emoji}
        data-mine={tally.mine ? '' : undefined}
        aria-pressed={tally.mine}
        aria-describedby={open ? popoverId : undefined}
        aria-label={`${EMOJI_LABEL[tally.emoji]}, ${tally.count} ${
          tally.count === 1 ? 'reaktion' : 'reaktioner'
        }${tally.mine ? ', din reaktion' : ''}`}
        className="vm-reaction-tally inline-flex touch-manipulation items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-sm leading-none transition-[border-color,background-color] duration-150 outline-none hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] aria-pressed:border-accent"
      >
        <span aria-hidden="true">{tally.emoji}</span>
        {/* Antalet är den enda TEXTEN på brickan. Färgen är single-sourcad i
            rooms.css (vilo = fg-muted, min = lyft till fg), inte en text-utility
            här, så count-tonen är EN sanning och inte en specificitets-strid. */}
        <span className="text-xs font-semibold tabular-nums" data-reactions-count>
          {tally.count}
        </span>
      </button>
      {open && (
        <ReactionAuthorsPopover
          id={popoverId}
          emoji={tally.emoji}
          emojiLabel={EMOJI_LABEL[tally.emoji]}
          authors={authors}
          anchorRef={anchorRef}
        />
      )}
    </span>
  );
}

/**
 * Reaktions-raden för EN match. Tunn konsument av reaktions-storen: slår upp sin match
 * i den aggregerade kartan och renderar brickorna + väljaren.
 */
export function MatchReactions({ matchId }: MatchReactionsProps) {
  const store = useReactionsStore();
  const pickerId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  if (!store.enabled) {
    return null;
  }

  const summary = summaryForMatch(store.byMatch, matchId);

  // Trycka en emoji: är det MIN nuvarande -> avmarkera; annars sätt/byt. Stänger
  // väljaren efter ett val (snabbt, fokuserat). Fel fångas + visas (fail loud i UI).
  const handlePick = async (emoji: ReactionEmoji) => {
    setUiError(null);
    setPickerOpen(false);
    try {
      if (summary.myEmoji === emoji) {
        await store.removeReaction(matchId);
      } else {
        await store.react(matchId, emoji);
      }
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Kunde inte spara reaktionen.');
    }
  };

  // Trycka en BEFINTLIG bricka: samma logik (min -> avmarkera, annars byt till den).
  const handleTally = (emoji: ReactionEmoji) => {
    void handlePick(emoji);
  };

  return (
    <div
      data-match-reactions=""
      data-reactions-match={matchId}
      data-reactions-total={summary.total}
      className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3"
    >
      {/* Befintliga reaktioner som brickor (emoji + antal). MIN bär aria-pressed +
          data-mine (design-frontend tonar den), så markeringen är färg-oberoende. Varje
          bricka är OCKSÅ trigger för "vem reagerade"-popovern (långtryck/hover/focus). */}
      {summary.tallies.map((t) => (
        <ReactionTallyButton
          key={t.emoji}
          tally={t}
          nameByUser={store.nameByUser}
          myUserId={store.userId}
          onToggle={handleTally}
        />
      ))}

      {/* "Lägg till reaktion"-knappen: fäller ut väljaren. aria-expanded + aria-controls
          knyter den till väljar-gruppen (a11y). En diskret emoji-glyf, ingen tung knapp. */}
      <button
        type="button"
        onClick={() => setPickerOpen((open) => !open)}
        data-reactions-add=""
        aria-expanded={pickerOpen}
        aria-controls={pickerId}
        aria-label={pickerOpen ? 'Stäng reaktionsväljaren' : 'Lägg till en reaktion'}
        className="vm-reaction-add inline-flex h-7 items-center gap-1 rounded-pill border border-dashed border-border px-2 text-sm leading-none text-fg-muted transition-[border-color,color] duration-150 outline-none hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)]"
      >
        <span aria-hidden="true">{summary.total === 0 ? '🙂' : '+'}</span>
        {summary.total === 0 ? (
          <span className="text-xs font-medium">Reagera</span>
        ) : (
          <span className="sr-only">Lägg till en reaktion</span>
        )}
      </button>

      {/* Väljaren: den kurerade 8-emoji-listan. role=group + aria-label så SR förstår
          den som en sammanhållen väljare. Min nuvarande emoji bär aria-pressed (vald).
          Renderas bara när öppen (KISS, ingen alltid-synlig palett som tar plats). */}
      {pickerOpen && (
        <div
          id={pickerId}
          role="group"
          aria-label="Välj en reaktion"
          data-reactions-picker=""
          className="vm-reaction-picker flex w-full flex-wrap items-center gap-1 rounded-card border border-border bg-surface-raised p-1.5"
        >
          {REACTION_EMOJIS.map((emoji) => {
            const isMine = summary.myEmoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => void handlePick(emoji)}
                data-reactions-pick={emoji}
                data-mine={isMine ? '' : undefined}
                aria-pressed={isMine}
                aria-label={`Reagera med ${EMOJI_LABEL[emoji]}${isMine ? ', vald' : ''}`}
                className="vm-reaction-option inline-flex h-8 w-8 items-center justify-center rounded-pill text-lg leading-none transition-[transform,background-color] duration-150 outline-none hover:scale-110 hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] aria-pressed:bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)]"
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            );
          })}
        </div>
      )}

      {uiError && (
        <p
          role="status"
          data-reactions-error
          className="w-full text-xs"
          style={{ color: 'var(--color-danger)' }}
        >
          {uiError}
        </p>
      )}
    </div>
  );
}
