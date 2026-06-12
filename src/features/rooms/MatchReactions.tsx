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

import { useId, useState } from 'react';
import { REACTION_EMOJIS, type ReactionEmoji } from '../../data/rooms';
import { useReactionsStore } from './reactions-context';
import { summaryForMatch } from './reaction-aggregate';

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
          data-mine (design-frontend tonar den), så markeringen är färg-oberoende. */}
      {summary.tallies.map((t) => (
        <button
          key={t.emoji}
          type="button"
          onClick={() => handleTally(t.emoji)}
          data-reactions-tally={t.emoji}
          data-mine={t.mine ? '' : undefined}
          aria-pressed={t.mine}
          aria-label={`${EMOJI_LABEL[t.emoji]}, ${t.count} ${
            t.count === 1 ? 'reaktion' : 'reaktioner'
          }${t.mine ? ', din reaktion' : ''}`}
          className="vm-reaction-tally inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-sm leading-none transition-[border-color,background-color] duration-150 outline-none hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] aria-pressed:border-accent"
        >
          <span aria-hidden="true">{t.emoji}</span>
          <span className="text-xs font-semibold tabular-nums text-fg-muted" data-reactions-count>
            {t.count}
          </span>
        </button>
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
