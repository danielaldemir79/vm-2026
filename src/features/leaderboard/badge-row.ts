// EN sanning för MÄRKES-RADENS innehåll (T19, #19): vilka märken som visas, i vilken
// ordning, med vilken etikett + förklaring. REN funktion (inget I/O, ingen React), så
// raderna kan enhetstestas och UI:t (TipsScoreSummary) bara renderar dem. Härleds ur
// MemberBadges (deriveMemberBadges), så samma sanning som topplistan.
//
// Streaken visas BARA när den är minst MIN_STREAK_SHOWN (en svit på 1 är inte en
// "streak" värd en bricka, det vore brus). Skräll- och perfekt-omgång-märkena visas
// bara när de TJÄNATS (boolean). En medlem utan något märke ger en TOM lista, och
// summeringen utelämnar då hela raden (hellre inget än en tom "märken:"-etikett).

import type { MemberBadges } from './derive-badges';

/** Minsta streak-längd för att streak-brickan ska visas (en svit på 1 räknas inte). */
export const MIN_STREAK_SHOWN = 2;

/** En märkes-bricka för UI:t: stabil id (driver ikon), kort etikett + en förklaring. */
export interface BadgeRow {
  /** Stabil nyckel (ikon-/test-hak). */
  id: 'streak' | 'called-upset' | 'perfect-round';
  /** Kort synlig etikett ("3 i rad"). */
  label: string;
  /** Längre förklaring (title/tooltip + sr-only), så märket är begripligt. */
  description: string;
}

/**
 * Bygg märkes-raden ur en medlems härledda badges. Ordning: streak (om >= tröskeln),
 * sedan skräll, sedan perfekt omgång. En medlem utan tjänade märken ger en tom lista.
 *
 * @param badges  MemberBadges (deriveMemberBadges-utfallet), eller null (ingen egen rad).
 * @returns       de märken som ska visas, i visnings-ordning (kan vara tom).
 */
export function buildBadgeRow(badges: MemberBadges | null): BadgeRow[] {
  if (badges === null) {
    return [];
  }
  const rows: BadgeRow[] = [];

  // STREAK: visa nuvarande löpande svit om den är minst tröskeln (annars ingen bricka).
  // Vi visar NUVARANDE (den levande sviten), inte längsta, så brickan känns aktuell.
  if (badges.streak.current >= MIN_STREAK_SHOWN) {
    rows.push({
      id: 'streak',
      label: `${badges.streak.current} i rad`,
      description: `Du har ${badges.streak.current} rätt-tippade matcher i rad. Håll sviten vid liv!`,
    });
  }

  // KALLADE SKRÄLLEN: tjänat genom en exakt-träff där underdog (sämre FIFA-ranking) vann.
  if (badges.calledUpset) {
    rows.push({
      id: 'called-upset',
      label: 'Kallade skrällen',
      description:
        'Du prickade exakt resultat i en match där ett sämre rankat lag slog favoriten. Vilken känsla!',
    });
  }

  // PERFEKT OMGÅNG: en svensk dag där alla dina (minst 2) tips slog in.
  if (badges.perfectRound) {
    rows.push({
      id: 'perfect-round',
      label: 'Perfekt omgång',
      description: 'Du tippade rätt på alla dina matcher en hel speldag. En perfekt omgång!',
    });
  }

  return rows;
}
