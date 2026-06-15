// Namn-pooler för bot-personas (T82, #173). REN data, inget I/O.
//
// SYFTE: ge persona-motorn (personas.ts) råmaterial att bygga VARIERADE, trovärdiga
// visningsnamn med, så bot-medlemmarna i topplistan ser ut som en blandad vänkrets
// (svenska + internationella förnamn, vissa med efternamn, vissa smeknamn) i stället
// för en uppenbar "bot1, bot2"-rad. Namnen är fiktiva och generiska med flit (inga
// riktiga personer), de ska bara KÄNNAS som folk.
//
// Längd-kontrakt: alla genererade namn måste rymmas i room_members.display_name
// (char_length 1..40, T14) och bot_accounts.display_name (samma gräns, T82-migrationen).
// Pooler-na nedan är korta nog att även "Förnamn Efternamn" ryms med marginal.

/** Vanliga svenska förnamn (blandat kön), för den lokala vänkrets-känslan. */
export const SWEDISH_FIRST_NAMES: readonly string[] = [
  'Erik',
  'Anna',
  'Johan',
  'Sara',
  'Anders',
  'Emma',
  'Karl',
  'Maria',
  'Oskar',
  'Linnea',
  'Gustav',
  'Elin',
  'Magnus',
  'Sofia',
  'Henrik',
  'Klara',
  'Fredrik',
  'Hanna',
  'Mattias',
  'Ida',
  'Niklas',
  'Josefin',
  'Pär',
  'Åsa',
  'Björn',
  'Märta',
  'Sören',
  'Görel',
];

/** Internationella förnamn, för bredden (VM samlar folk från hela världen). */
export const INTERNATIONAL_FIRST_NAMES: readonly string[] = [
  'Diego',
  'Yuki',
  'Kwame',
  'Mateo',
  'Aisha',
  'Lars',
  'Giulia',
  'Omar',
  'Chen',
  'Priya',
  'Luka',
  'Fatima',
  'Pedro',
  'Ingrid',
  'Hassan',
  'Mei',
  'Carlos',
  'Sofie',
  'Tariq',
  'Nina',
  'Andrés',
  'Olu',
  'Viktor',
  'Amara',
];

/** Efternamn (svenska + internationella), för "Förnamn Efternamn"-varianten. */
export const LAST_NAMES: readonly string[] = [
  'Andersson',
  'Johansson',
  'Lindqvist',
  'Berg',
  'Nyström',
  'Silva',
  'Tanaka',
  'Okafor',
  'Rossi',
  'Müller',
  'Kovač',
  'Haddad',
  'Sandberg',
  'Ekström',
  'Holm',
  'Lund',
];

/**
 * Vanliga smeknamn/handles, för de botar som går under ett alias i stället för ett
 * riktigt namn (precis som folk gör i tipsligor). Blandat fotbolls-flavour och vanligt.
 */
export const NICKNAMES: readonly string[] = [
  'Bollkungen',
  'Hattrick',
  'Spelaren',
  'Kantnicke',
  'Mittback99',
  'Frilägeskungen',
  'Domaren',
  'Straffläggaren',
  'Hörnflaggan',
  'Offsidekungen',
  'Tunnelmästaren',
  'Nicken',
  'Maestron',
  'Glassen',
  'Räven',
  'Pärlan',
];

/**
 * COOLA smeknamn enbart för FSU-kohorten (Full Stack United-rummet). KRAV (T82-
 * direktivet): de 5 FSU-botarna ska bära ett coolt smeknamn, ALDRIG ett vanligt
 * för-/efternamn, så de sticker ut som en egen liten klick. Hålls SKILD från den
 * vanliga NICKNAMES-poolen så fördelnings-testet kan bevisa att FSU bara får dessa.
 */
export const FSU_NICKNAMES: readonly string[] = [
  'NollEttan',
  'CtrlAltDelete',
  'SegfaultSven',
  'RootAccess',
  'KernelKalle',
  'StackOverflowSara',
  'GitGud',
  'NullPekaren',
];
