// Den TOTALA (cross-rum) topplistans vy (T82 del 3, #173). Orkestrerar de tre delarna
// enligt den spikade UX:en:
//   1. "DIN PLACERING"-HJÄLTEN överst (TotalSelfHero), framträdande , den inloggade
//      spelarens egen position ska aldrig vara svår att hitta (ägarens krav).
//   2. KOMPRIMERAT LÄGE (default): pallen / topp-5 alltid synlig. Egen rad markerad.
//      "Visa alla N"-knapp för att fälla ut.
//   3. UTFÄLLT LÄGE: hela listan som EN virtualiserad scroll + sök + "hoppa till mig"
//      (TotalLeaderboardList). Egen rad fortsatt markerad.

import { useEffect, useRef, useState } from 'react';
import { useTotalLeaderboardStore } from './total-leaderboard-context';
import { TotalSelfHero } from './TotalSelfHero';
import { TotalLeaderboardRow } from './TotalLeaderboardRow';
import { TotalLeaderboardList } from './TotalLeaderboardList';

/** Hur många toppdeltagare som visas i det KOMPRIMERADE läget (pallen + lite till). */
const PODIUM_COUNT = 5;

/** Id på den fulla listans region (delas av expand-toggeln + listans komprimera-kontroll). */
const FULL_LIST_ID = 'total-leaderboard-full';

export function TotalLeaderboardView() {
  const store = useTotalLeaderboardStore();
  const [expanded, setExpanded] = useState(false);
  // Ref till "Visa alla N"-toggeln, så fokus kan återföras dit när listan komprimeras via
  // den sticky kontrollen INUTI listan (annars tappas fokus när den kontrollen avmonteras).
  const expandToggleRef = useRef<HTMLButtonElement | null>(null);
  // Sätts när komprimeringen skedde via en KONTROLL (inte vid initial render), så fokus
  // bara flyttas som svar på användarens komprimera-klick, inte vid första monteringen.
  const restoreFocusRef = useRef(false);

  // Komprimera den fulla listan. Markera att fokus ska återföras till expand-toggeln när
  // den åter-monteras (effekten nedan kör efter att toggeln finns i DOM:en igen).
  const collapse = () => {
    restoreFocusRef.current = true;
    setExpanded(false);
  };

  // Fokus-återföring EFTER att DOM:en åter-renderat i komprimerat läge (expand-toggeln finns
  // igen). Körs bara när komprimeringen var en användar-åtgärd, så ingen fokus-stöld vid mount.
  useEffect(() => {
    if (!expanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      expandToggleRef.current?.focus();
    }
  }, [expanded]);

  const ready = store.enabled && store.status === 'ready';

  return (
    <section aria-labelledby="total-leaderboard-heading" data-total-leaderboard-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Hela poolen
        </p>
        <h2
          id="total-leaderboard-heading"
          className="font-display text-xl font-semibold sm:text-2xl"
        >
          Global topplista
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Alla deltagare i alla rum, rangordnade på sin totala poäng. Din egen placering visas
          överst, så du alltid ser var du står mot alla andra.
        </p>
      </header>

      {/* Fel-väg (fail loud). */}
      {store.status === 'error' ? (
        <p
          role="alert"
          data-total-error=""
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {store.error ?? 'Något gick fel när den totala topplistan skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning. */}
      {store.status === 'loading' || store.status === 'idle' ? (
        <p role="status" data-total-loading="" className="mt-4 text-sm text-fg-muted">
          Laddar den totala topplistan…
        </p>
      ) : null}

      {/* Tom (inga deltagare än, ovanligt , t.ex. inga rum i live-läge). */}
      {ready && store.total.length === 0 ? (
        <p data-total-empty="" className="mt-4 text-sm text-fg-muted">
          Inga deltagare att rangordna än. Gå med i ett rum och börja tippa.
        </p>
      ) : null}

      {ready && store.total.length > 0 ? (
        <div className="mt-5 flex flex-col gap-5">
          {/* 1) HJÄLTEN: din placering (om vi kan peka ut en egen rad). */}
          {store.selfSummary !== null ? <TotalSelfHero summary={store.selfSummary} /> : null}

          {/* 2) KOMPRIMERAT: pallen / topp-5. Egen rad markerad. */}
          {!expanded ? (
            <div data-total-podium="" className="flex flex-col gap-2">
              {store.total.slice(0, PODIUM_COUNT).map((entry) => (
                <TotalLeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  isSelf={store.currentUserId !== null && entry.userId === store.currentUserId}
                />
              ))}
            </div>
          ) : null}

          {/* "Visa alla N"-knapp (KOMPRIMERAT läge). I utfällt läge tar listans STICKY
              "Komprimera"-kontroll över (alltid nåbar oavsett scroll), så vi duplicerar inte
              en toggle ovanför fönstret , det var hela problemet ägaren flaggade. */}
          {!expanded && store.total.length > PODIUM_COUNT ? (
            <button
              ref={expandToggleRef}
              type="button"
              data-total-expand-toggle=""
              aria-expanded={false}
              aria-controls={FULL_LIST_ID}
              onClick={() => setExpanded(true)}
              className="vm-total-control self-start rounded-pill px-5 py-2.5 text-sm font-semibold"
            >
              {`Visa alla ${store.total.length}`}
            </button>
          ) : null}

          {/* 3) UTFÄLLT: hela listan, virtualiserad + sök + hoppa till mig + en STICKY
              "Komprimera"-kontroll inuti listan (onCollapse), så listan kan fällas in från
              vilken scroll-position som helst utan att skrolla tillbaka till toppen. */}
          {expanded ? (
            <div id={FULL_LIST_ID} data-total-full="">
              <TotalLeaderboardList
                entries={store.total}
                currentUserId={store.currentUserId}
                onCollapse={collapse}
                listId={FULL_LIST_ID}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
