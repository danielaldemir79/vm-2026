// Budget-medveten poll-planerare. API-Football-gratisnyckeln har en hård kvot
// (100 anrop/dag), så vi planerar dagens anrop med en STRIKT prioritetsordning
// i stället för att polla blint och slå i taket mitt i en match.
//
// KRAV (från Daniel, HARD , gissas inte, det är en uttrycklig produkt-regel):
//   1. RESERVERA FÖRST tillräckligt för att fånga SLUTRESULTATET (facit) på VARJE
//      match dagen (ett `fixtures?id`-anrop per match). Det är HÖGSTA prio , facit
//      driver appens poäng/tabeller och får ALDRIG missas pga budget.
//   2. Fördela RESTEN på:
//      - live=all-RYGGRADEN: 1 anrop täcker ALLA samtidiga live-matcher (en query),
//        så det är extremt budget-effektivt , huvuddelen av resten går hit.
//      - events: extra anrop vid ställnings-ändring (mål), en mindre pott.
//      - GLES statistik: en liten pott, statistik behöver inte tät uppdatering.
//   3. ADAPTIVT intervall ur dagens matchantal: en tung dag (många matcher) ger
//      glesare live-pollning (färre anrop kvar efter facit-reservationen), en lätt
//      dag tätare. Intervallet HÄRLEDS ur hur många live-anrop som faktiskt ryms.
//
// INVARIANT (testad): även på tyngsta dagen får varje match sin reserverade
// facit-fångst, och summan av alla planerade anrop <= budget. Facit offras aldrig.

/** En matchdags-post planeraren behöver: bara det som styr planen. */
export interface PollDayMatch {
  /** Appens match-id (för spårbarhet i planen). */
  appMatchId: string;
  /** Avspark i ISO 8601 (UTC). Reserverad för framtida tidsfönster-logik. */
  kickoffUtc: string;
}

/** Hur dagens anropsbudget fördelas (alla tal är ANTAL anrop för dagen). */
export interface PollAllocation {
  /** Reserverat för facit (ett `fixtures?id` per match). Lika med antalet matcher. */
  finalResultReserve: number;
  /** Anrop till live=all-ryggraden (1 query täcker alla samtidiga live-matcher). */
  liveBackbone: number;
  /** Anrop till events (vid ställnings-ändring). */
  events: number;
  /** Anrop till statistik (glest). */
  statistics: number;
}

/** Den färdiga planen för en matchdag. */
export interface PollPlan {
  /** Antal matcher dagen. */
  matchCount: number;
  /** Dagens totala budget (anrop). */
  dailyBudget: number;
  allocation: PollAllocation;
  /** Summan av alla poster i allocation (<= dailyBudget, invariant). */
  totalPlanned: number;
  /**
   * Härlett glesare/tätare live-intervall i minuter: hur ofta live=all bör anropas
   * under matchfönstret, beräknat ur liveBackbone-potten över ett antaget aktivt
   * fönster. Null när inga matcher (inget att polla). Tung dag -> större tal.
   */
  liveIntervalMinutes: number | null;
}

/**
 * Antaget aktivt live-fönster per dag i minuter, som live-intervallet räknas mot.
 * VM-matcher en given dag ligger normalt inom ett spann på några timmar; vi
 * använder ett fast antaget fönster så intervallet blir en ren funktion av potten
 * (fler anrop -> tätare). 6 h = ett rymligt men realistiskt matchfönster-tak.
 */
export const ACTIVE_WINDOW_MINUTES = 6 * 60;

/**
 * Hur resten (efter facit-reservationen) delas mellan de tre potterna. live=all är
 * billigast per värde (1 anrop = alla matcher), så den får merparten. Andelarna är
 * en medveten avvägning, inte en gissning: ryggraden prioriteras, events näst,
 * statistik minst (glest med flit). Summerar till 1.
 */
const SHARE_LIVE_BACKBONE = 0.7;
const SHARE_EVENTS = 0.2;
// statistik får resten (1 - 0.7 - 0.2 = 0.1), beräknas som rest så summan stämmer.

/**
 * Planera dagens anrop. Facit reserveras FÖRST (krav 1), resten fördelas (krav 2),
 * live-intervallet härleds adaptivt (krav 3). Garanterar invarianten
 * totalPlanned <= dailyBudget och finalResultReserve == matchCount (när budget räcker).
 *
 * Edge-fall:
 *   - 0 matcher: allt 0, intervall null (inget att polla).
 *   - budget < matchCount (otillräcklig för facit på alla): vi reserverar så många
 *     facit vi kan (fail loud via en negativ rest hade varit fel), resten 0. Detta
 *     är ett degenererat fall (100-budget rymmer långt fler än en dags matcher),
 *     men planeraren ska aldrig planera fler anrop än budgeten , facit-prioritet
 *     betyder att facit tar budgeten FÖRST.
 *
 * @param matchesForDay  dagens matcher.
 * @param dailyBudget    anropstak för dagen (default 100, gratisnyckelns kvot).
 */
export function planPolls(matchesForDay: readonly PollDayMatch[], dailyBudget = 100): PollPlan {
  if (dailyBudget < 0) {
    throw new Error(`planPolls: dailyBudget får inte vara negativ (fick ${dailyBudget}).`);
  }
  const matchCount = matchesForDay.length;

  if (matchCount === 0) {
    return {
      matchCount: 0,
      dailyBudget,
      allocation: { finalResultReserve: 0, liveBackbone: 0, events: 0, statistics: 0 },
      totalPlanned: 0,
      liveIntervalMinutes: null,
    };
  }

  // KRAV 1: facit först. Reservera ett id-uppslag per match, men aldrig mer än
  // budgeten (degenererat fall där budgeten inte ens räcker till alla facit).
  const finalResultReserve = Math.min(matchCount, dailyBudget);

  // Resten fördelas på de tre potterna (krav 2). Heltal: golv per pott, statistik
  // får resten så summan ALDRIG överstiger budgeten (invariant).
  const remainder = dailyBudget - finalResultReserve;
  const liveBackbone = Math.floor(remainder * SHARE_LIVE_BACKBONE);
  const events = Math.floor(remainder * SHARE_EVENTS);
  const statistics = remainder - liveBackbone - events; // resten -> exakt summa

  const totalPlanned = finalResultReserve + liveBackbone + events + statistics;

  // KRAV 3: adaptivt live-intervall. Fler live-anrop -> tätare (mindre intervall);
  // färre (tung dag, mer budget bunden i facit) -> glesare (större intervall).
  // Intervall = aktivt fönster / antal live-anrop. Inga live-anrop -> null.
  const liveIntervalMinutes =
    liveBackbone > 0 ? Math.round(ACTIVE_WINDOW_MINUTES / liveBackbone) : null;

  return {
    matchCount,
    dailyBudget,
    allocation: { finalResultReserve, liveBackbone, events, statistics },
    totalPlanned,
    liveIntervalMinutes,
  };
}
