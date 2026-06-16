// PUSH-PREFERENSER (T89, #182). REN logik: avgör OM en given användare ska få en mål-notis
// (master på/av, nattläge, match-scope). Ingen IO, ingen Date.now() , tiden matas in , så
// gränsfallen (nattfönstrets kanter, midnatt-wrap) enhetstestas deterministiskt och speglas
// till dispatchern via edge-mirror:n.
//
// Preferenserna lagras SERVER-SIDE (push_subscriptions-kolumner, T89-migrationen) så
// dispatchern (service_role) kan respektera dem , klient-only localStorage räcker inte när
// beslutet "ska denna enhet få pushen" tas i backend.
//
// =====================================================================================
// DOMÄNREGLER (Daniels spec + issue #182):
//
//  P1. MASTER PÅ SOM DEFAULT. När en enhet prenumererar är notiserna PÅ (notify_enabled
//      default true i DB:n). Användaren kan stänga av dem (utan att avregistrera enheten).
//
//  P2. NATTLÄGE (Daniels uttryckliga "stäng av på nätterna"). En PER-ANVÄNDARE-togglad
//      tystnad, default AV (notiser på dygnet runt tills användaren slår på nattläget).
//      Slås den på tystas notiser i nattfönstret 23:00-08:00 EUROPE/STOCKHOLM (samma zon
//      pollaren + appens dag-gruppering använder , swedishDay i livescore-poller). Fönstret
//      WRAPPAR över midnatt: tyst när lokal timme >= 23 ELLER < 8. Gränsen är INKLUSIV i
//      början (23:00 tyst) och EXKLUSIV i slutet (08:00 ljuder igen) , en vanlig
//      "tysta-på-natten"-konvention. KÄLLA: Daniels direktiv (memory vm2026-next-build-plan)
//      + SPEC §13.3; tidszonen är samma som poll-loggens swedishDay (decisions.md).
//
//  P3. MATCH-SCOPE (issue #182: "alla matcher" vs "bara favoritlag"). Default 'all'.
//      'favorite' = bara matcher där favoritlaget spelar. Favoritlaget är i dag KLIENT-only
//      (FavoriteTeamProvider, localStorage); för att filtrera SERVER-side lagras det valda
//      laget (FIFA-kod) i preferens-raden NÄR användaren väljer 'favorite' i Mer. Saknas ett
//      favoritlag men scope='favorite' (inkonsekvent rad) faller vi tillbaka på att SLÄPPA
//      IGENOM (hellre en notis för mycket än att tyst svälja alla , fail-open på scope, men
//      fail-CLOSED på master/natt som är de uttryckliga av-knapparna).
// =====================================================================================

/** Match-scope: alla matcher, eller bara matcher där favoritlaget spelar (#182). */
export type MatchScope = 'all' | 'favorite';

/**
 * En användares push-preferenser (en rad per enhet i push_subscriptions, men semantiskt
 * per-användare , alla en användares enheter delar avsikten; vi utvärderar per rad eftersom
 * tabellen är enhets-nyckad, vilket också låter en användare ha olika enheter på/av).
 */
export interface PushPreferences {
  /** Master på/av (P1). false = användaren har stängt av notiser för enheten. */
  notifyEnabled: boolean;
  /** Nattläge på/av (P2). true = tysta i nattfönstret. */
  quietHoursEnabled: boolean;
  /** Match-scope (P3). */
  scope: MatchScope;
  /** Valt favoritlag (FIFA-kod, t.ex. 'SWE'), null om inget valt. Bara relevant vid scope='favorite'. */
  favoriteTeamId: string | null;
}

/** Kontext om DEN match målet gjordes i, för scope-filtret (P3). */
export interface GoalMatchContext {
  /** FIFA-koderna för matchens två lag (en eller båda kan vara null för oseedade slutspel). */
  homeTeamId: string | null;
  awayTeamId: string | null;
}

/** Nattfönstrets start-timme (inklusiv): 23:00. Källa: P2-regeln (Daniels direktiv). */
export const QUIET_HOURS_START_HOUR = 23;
/** Nattfönstrets slut-timme (exklusiv): 08:00. Källa: P2-regeln. */
export const QUIET_HOURS_END_HOUR = 8;
/** Tidszonen nattfönstret utvärderas i (samma som pollarens swedishDay). */
export const QUIET_HOURS_TZ = 'Europe/Stockholm';

/**
 * Är `now` inom nattfönstret (P2) i Europe/Stockholm? Tiden räknas om till lokal timme i
 * Stockholm via Intl (DST-säkert , Intl hanterar sommar/vinter-tid, inte en fast offset).
 * Wrappar över midnatt: tyst när lokal timme >= 23 ELLER < 8.
 *
 * @param now  ögonblicket att utvärdera (en riktig Date; injiceras av anroparen, testbart).
 */
export function isQuietHoursStockholm(now: Date): boolean {
  const localHour = stockholmHour(now);
  // Wrap-fönster (start > slut): tyst i [start, 24) ELLER [0, slut).
  return localHour >= QUIET_HOURS_START_HOUR || localHour < QUIET_HOURS_END_HOUR;
}

/**
 * Den lokala timmen (0-23) i Europe/Stockholm för ett ögonblick. Intl med hour12:false +
 * 2-siffrig timme; '24' (midnatt i vissa locale) normaliseras till 0. Fail loud på en
 * ogiltig Date (hellre det än en tyst NaN som skulle släppa igenom/tysta fel).
 */
export function stockholmHour(now: Date): number {
  if (Number.isNaN(now.getTime())) {
    throw new Error('[VM2026] isQuietHoursStockholm: ogiltig Date.');
  }
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: QUIET_HOURS_TZ,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const hour = Number.parseInt(hourStr, 10);
  // en-GB kan ge '24' för midnatt; normalisera till 0 (samma dygn-timme).
  return hour === 24 ? 0 : hour;
}

/**
 * Matchar match-scopet för en given användare (P3). 'all' -> alltid sant. 'favorite' ->
 * sant bara om favoritlaget spelar i matchen. Inkonsekvent rad (scope='favorite' men inget
 * favoritlag valt) -> fail-OPEN (släpp igenom), så en halvkonfigurerad preferens hellre ger
 * en notis för mycket än tyst sväljer alla.
 */
export function matchesScope(prefs: PushPreferences, match: GoalMatchContext): boolean {
  if (prefs.scope === 'all') {
    return true;
  }
  // scope === 'favorite'
  if (prefs.favoriteTeamId === null) {
    return true; // fail-open (se P3)
  }
  return match.homeTeamId === prefs.favoriteTeamId || match.awayTeamId === prefs.favoriteTeamId;
}

/** Varför en notis INTE skickades (för loggning/spårbarhet i dispatchern). */
export type SuppressionReason = 'disabled' | 'quiet-hours' | 'out-of-scope';

/** Resultatet av preferens-utvärderingen: skicka, eller skippa med ett skäl. */
export type NotifyDecision = { notify: true } | { notify: false; reason: SuppressionReason };

/**
 * Beslutet: ska DENNA användare få mål-notisen NU, för DENNA match? Ordningen är medveten:
 *   1. Master av (P1) -> 'disabled' (det starkaste av-valet, vinner först).
 *   2. Nattläge på + i nattfönstret (P2) -> 'quiet-hours'.
 *   3. Scope passar inte (P3) -> 'out-of-scope'.
 * Annars: skicka.
 *
 * Fail-CLOSED på master + natt (de uttryckliga av-knapparna), fail-OPEN på scope (se P3).
 *
 * @param prefs  användarens preferenser (ur DB-raden).
 * @param match  matchens lag-kontext (för scope).
 * @param now    ögonblicket (för nattläget); injiceras, testbart.
 */
export function shouldNotifyUser(
  prefs: PushPreferences,
  match: GoalMatchContext,
  now: Date
): NotifyDecision {
  if (!prefs.notifyEnabled) {
    return { notify: false, reason: 'disabled' };
  }
  if (prefs.quietHoursEnabled && isQuietHoursStockholm(now)) {
    return { notify: false, reason: 'quiet-hours' };
  }
  if (!matchesScope(prefs, match)) {
    return { notify: false, reason: 'out-of-scope' };
  }
  return { notify: true };
}
