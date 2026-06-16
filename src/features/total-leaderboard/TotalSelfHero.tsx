// "DIN PLACERING"-HJÄLTEN för den totala topplistan (T82 del 3, #173).
//
// Ägarens uttryckliga krav: den inloggade spelarens egen position ska ALDRIG vara svår
// att hitta. Hjälten är därför det FÖRSTA, mest framträdande i sektionen: en stor
// placerings-siffra ("2:a") + "av N" + poängen.
//
// T90 (#183): "med i N rum"-kontexten BORTTAGEN. Under den RÄTTVISA modellen (bästa rum,
// inte summa) ger antal rum INGEN fördel, så att visa rum-antalet bredvid placeringen vore
// vilseledande (det antyder att rum-antalet påverkar poängen). Poängen ÄR deltagarens bästa
// enskilda rum-resultat; vi visar bara placering + av N + poäng.
//
// FÄRG-OBEROENDE PREMIUM (lessons aa-...-varsta-fall): den stora placeringen står som
// mörk/ljus ink på en SOLID accent-bricka (samma färg-oberoende solid-bricka-form som
// DU-brickan/primärknappen, AA-mätt 10.85:1 mörkt / 5.40:1 ljust), aldrig accent-text på
// tint. Resten är fg/fg-muted på en opak surface-raised-yta (README-mätt brödtext-par).
// En hårfin accent-kant + en svag accent-glow i hörnet ger kortet relief utan en bild;
// glow:en sitter i ETT hörn och bär ingen text (motsatta-hörn-disciplinen, §17).
//
// SKÄRMLÄSARE: hela meningen läses i ord via en visuellt-gömd sammanfattning
// (sr-only), så "andra plats av 240, 87 poäng" når en skärmläsar-användare utan att tolka
// den visuella siffer-uppställningen. De synliga siffrorna är aria-hidden.

import type { TotalSelfSummary } from './aggregate-total';
import type { SelfRankChange } from './self-rank-snapshot';

/** Svensk ordningstalsändelse: 1:a/2:a ... men 11:e/12:e. Liten språklig finish. */
function ordinalSuffix(rank: number): string {
  // 1 och 2 (och 21, 22 ...) får ":a", övriga ":e". 11/12 är ":e" (oregelbundna).
  const lastTwo = rank % 100;
  if (lastTwo === 11 || lastTwo === 12) {
    return ':e';
  }
  const last = rank % 10;
  return last === 1 || last === 2 ? ':a' : ':e';
}

/**
 * "DIN FÖRÄNDRING"-indikatorn (T92 del C): en FÄRG-OBEROENDE rank-rörelse sedan ditt senaste
 * besök. Pil-FORMEN (▲/▼) + antalet bär betydelsen, färgen förstärker bara (WCAG 1.4.1). Visas
 * bara vid en faktisk rörelse (up/down); 'new' (första besöket) och 'same' visar inget , vi
 * pratar aldrig om en rörelse som inte hänt. En sr-only-mening ger skärmläsaren orden.
 */
function RankChangeIndicator({ change }: { change: SelfRankChange }) {
  if (change.direction !== 'up' && change.direction !== 'down') {
    return null;
  }
  const up = change.direction === 'up';
  const word = up
    ? `Upp ${change.delta} sedan ditt senaste besök`
    : `Ner ${change.delta} sedan ditt senaste besök`;
  return (
    <span
      data-total-hero-change=""
      data-direction={change.direction}
      className={`vm-total-hero-change inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums ${
        up ? 'vm-total-hero-change--up' : 'vm-total-hero-change--down'
      }`}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span aria-hidden="true">{change.delta}</span>
      <span className="sr-only">{word}</span>
    </span>
  );
}

export function TotalSelfHero({
  summary,
  change = null,
}: {
  summary: TotalSelfSummary;
  /** Rank-förändring sedan senaste besök (T92 del C), eller null = visa ingen indikator. */
  change?: SelfRankChange | null;
}) {
  const ordinal = `${summary.rank}${ordinalSuffix(summary.rank)}`;
  const spoken =
    `Din placering: ${ordinal} av ${summary.totalParticipants} deltagare, ` +
    `${summary.points} poäng.`;

  return (
    <div
      data-total-self-hero=""
      data-rank={summary.rank}
      data-points={summary.points}
      className="vm-total-hero relative flex items-center gap-4 overflow-hidden rounded-card px-4 py-4 sm:gap-5 sm:px-6 sm:py-5"
    >
      {/* Skärmläsar-meningen (hela placeringen i ord). De synliga siffrorna är aria-hidden. */}
      <p className="sr-only">{spoken}</p>

      {/* PLACERINGS-BRICKAN: stor ordningssiffra på solid accent (färg-oberoende ink). */}
      <span
        aria-hidden="true"
        data-total-hero-rank=""
        className="vm-total-hero-medal flex shrink-0 flex-col items-center justify-center rounded-card px-3 py-2 leading-none sm:px-4 sm:py-3"
      >
        <span className="font-display text-3xl font-bold tabular-nums sm:text-4xl">
          {summary.rank}
        </span>
        <span className="mt-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em]">
          plats
        </span>
      </span>

      {/* HÖGER: ledtext + "av N" + poäng + rum-kontext. */}
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 font-display text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Din placering
        </p>
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {ordinal}
          </span>
          <span className="font-display text-sm font-medium text-fg-muted">
            av {summary.totalParticipants}
          </span>
          {/* DIN FÖRÄNDRING (del C): rank-rörelse sedan senaste besök, bara vid faktisk rörelse. */}
          {change !== null ? <RankChangeIndicator change={change} /> : null}
        </p>
        <p className="m-0 flex flex-wrap items-baseline gap-x-3 text-sm text-fg-muted">
          <span
            data-total-hero-points=""
            className="font-display font-semibold text-fg tabular-nums"
          >
            {summary.points} poäng
          </span>
          <span data-total-hero-best="">Ditt bästa rum</span>
        </p>
      </div>
    </div>
  );
}
