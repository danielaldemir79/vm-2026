// Sektions-katalogen för den sticky chip-navigeringen (T78, #165).
//
// EN SANNING för "vilka sektioner kan navet hoppa till": id (= sektionens
// rubrik-id som REDAN finns i DOM:en, scroll-målet), en KORT svensk chip-etikett,
// och ett stabilt order-tal som speglar sektionernas ordning i App.tsx. Navet
// renderar chips ur det FAKTISKA registret (SectionNavProvider) sorterat på order,
// så en sektion som inte renderar (null i fixtures-/icke-live-läge) aldrig ger ett
// chip. Den här katalogen säger bara HUR ett registrerat id ska visas, inte ATT det
// finns, närvaron avgörs av att sektionen faktiskt registrerar sig (useRegisterSection).
//
// VARFÖR korta etiketter: Daniels återkommande krav är att raden inte får bli rörig.
// Korta ord (ett par tecken) håller chip-raden smal på mobil (PWA i första hand) utan
// att tvinga fram tidig horisontell scroll. Den fulla rubriken finns kvar i sektionen.
//
// RUMS- och ADMIN-sektionerna är MEDVETET utelämnade (hjälp-/arrangörsytor): de hålls
// utanför raden för att hålla den lean (Daniels krav), så de saknar både katalog-post
// och registrerings-anrop.

/** En sektions stabila identitet i navet: scroll-mål-id, chip-etikett, ordning. */
export interface SectionDescriptor {
  /** Sektionens rubrik-id (REDAN i DOM:en). Scroll-hoppar till `<section>` med detta. */
  readonly id: string;
  /** Kort svensk chip-etikett (håller raden smal). */
  readonly label: string;
  /** Stabil ordning (speglar App.tsx-ordningen), navet sorterar chips på detta. */
  readonly order: number;
}

/**
 * Katalogen, EN post per navigerbar sektion, i App.tsx-ordning. `id` matchar exakt
 * de befintliga `<section aria-labelledby="...">`-rubrik-id:na (T78 lägger INTE till
 * nya rubrik-id:n). Etiketterna är korta med flit (smal rad, Daniels lean-krav).
 *
 * Tracker-sektionerna (Idag/Grupper/Vad krävs/Slutspel) renderar alltid; tips-pool-
 * och toppliste-sektionerna (Match-tips/Grupp-tips/Mästare/Topplista) renderar bara i
 * live-läge. Navet visar bara de som FAKTISKT registrerat sig, så ordningen här gäller
 * den delmängd som råkar vara närvarande.
 */
export const SECTIONS = {
  daily: { id: 'dagens-matcher-rubrik', label: 'Idag', order: 10 },
  groups: { id: 'gruppspel-rubrik', label: 'Grupper', order: 20 },
  scenarios: { id: 'vad-kravs-rubrik', label: 'Vad krävs', order: 30 },
  bracket: { id: 'slutspel-rubrik', label: 'Slutspel', order: 40 },
  predictions: { id: 'predictions-heading', label: 'Match-tips', order: 50 },
  groupPredictions: { id: 'group-predictions-heading', label: 'Grupp-tips', order: 60 },
  bracketPredictions: { id: 'bracket-predictions-heading', label: 'Mästare', order: 70 },
  leaderboard: { id: 'leaderboard-heading', label: 'Topplista', order: 80 },
} as const satisfies Record<string, SectionDescriptor>;
