// Normaliserade livescore-domäntyper. Detta är appens EGEN form (konsument-typen),
// frikopplad från API-Footballs råa svar (api-football-types.ts). Parsern
// (parse-live.ts) översätter RÅ -> dessa. Genom att hålla appen mot den här formen
// kan en framtida byte av datakälla ske bakom parsern utan att UI:t rörs.

/**
 * Normaliserad matchstatus. En STÄNGD union (inte API:ts fria short-strängar), så
 * konsumenter (klock-logiken, livekortet) kan switcha uttömmande på den.
 *
 * Mappning från API-Footballs short-koder (källa: api-football.com fixtures-status,
 * verifierad mot de fångade svaren) görs i parse-live.ts:
 *   - 'scheduled'  : NS, TBD (ej startad)
 *   - 'live'       : 1H, 2H, ET (bollen rullar, klockan tickar)
 *   - 'paused'     : HT, BT, P, SUSP, INT (spelet vilar, klockan FRYSER)
 *   - 'finished'   : FT, AET, PEN (avgjord)
 *   - 'postponed'  : PST, CANC, ABD, AWD, WO (inställd/uppskjuten/tilldelad)
 *   - 'unknown'    : en short-kod vi inte känner igen (fail-safe, ALDRIG "live")
 *
 * Den råa short-koden bärs vidare i LiveMatchSnapshot.apiStatusShort så inget
 * tappas vid en okänd kod.
 */
export type LiveStatus = 'scheduled' | 'live' | 'paused' | 'finished' | 'postponed' | 'unknown';

/**
 * Den slags händelse ett LiveEvent är. Stängd union normaliserad från API:ts
 * case-inkonsekventa `type` ("Goal"/"Card"/"subst"/"Var"). Okänd typ blir 'other'
 * (fail-safe, bär den råa typen vidare i `rawType`).
 */
export type LiveEventKind = 'goal' | 'card' | 'subst' | 'var' | 'other';

/** Kortfärg för ett kort-event (utläst ur detail), null när det inte är ett kort. */
export type CardColor = 'yellow' | 'red';

/**
 * En ögonblicksbild av en pågående/avgjord match, normaliserad ur ett
 * fixtures-svar (live=all eller id-uppslag).
 */
export interface LiveMatchSnapshot {
  /** API-Footballs fixture-id (stabil nyckel för polling/identitet). */
  apiFixtureId: number;
  /** Normaliserad status (stängd union). */
  status: LiveStatus;
  /** Den RÅA short-koden, bevarad så en okänd status inte tappas (fail-loud-spår). */
  apiStatusShort: string;
  /** Spelad minut enligt API:t, null i pauser/före avspark. */
  elapsedMinute: number | null;
  /** Avspark i ISO 8601 (UTC, normaliserad till Z), för match-identitet. */
  kickoffUtc: string;
  homeTeamApiId: number;
  homeTeamName: string;
  awayTeamApiId: number;
  awayTeamName: string;
  /** Löpande mål hemma, null mycket tidigt innan API:t satt det. */
  homeGoals: number | null;
  /** Löpande mål borta, null mycket tidigt innan API:t satt det. */
  awayGoals: number | null;
}

/** Ett normaliserat matchhändelse-event. */
export interface LiveEvent {
  /** Spelad minut (event.time.elapsed). */
  minute: number;
  /** Tilläggsminut inom perioden (90+`extra`), null när inget tillägg. */
  extra: number | null;
  /** Normaliserad händelsetyp. */
  kind: LiveEventKind;
  /** Den RÅA typen, bevarad (särskilt för kind 'other'). */
  rawType: string;
  /** Underkategori ("Normal Goal"/"Penalty"/"Yellow Card"/...). */
  detail: string;
  teamApiId: number;
  teamName: string;
  /**
   * Spelarens API-id, null om API:t saknade det. STABIL nyckel för cross-match-aggregering
   * (skytteliga, T87): namn kan stavas olika mellan svar, id:t är beständigt. Bärs vidare av
   * parse-live ur event.player.id (kan vara null i råsvaret).
   */
  playerId: number | null;
  /** Spelarens namn, null om API:t saknade det. */
  playerName: string | null;
  /** Assistens API-id, null när ingen assist (vanligt: assist {id:null,name:null}). */
  assistId: number | null;
  /** Assistens namn, null när ingen assist (vanligt: assist {id:null,name:null}). */
  assistName: string | null;
  /** Kortfärg, satt bara för kind 'card' (annars null). */
  cardColor: CardColor | null;
}

/** Ett normaliserat statistik-nyckeltal för ETT lag. */
export interface LiveStatisticValue {
  /** Statistik-etiketten exakt som API:t ger den ("Ball Possession"/"Total Shots"/...). */
  type: string;
  /** Råvärdet normaliserat: number för tal, string för "%"/decimaler, null när saknas. */
  value: number | string | null;
}

/** Ett lags samlade matchstatistik. */
export interface LiveTeamStatistics {
  teamApiId: number;
  teamName: string;
  statistics: LiveStatisticValue[];
}

/** En spelare i en normaliserad laguppställning. */
export interface LiveLineupPlayer {
  apiPlayerId: number;
  name: string;
  number: number;
  position: string;
  /** Rutnätsposition "rad:kolumn", null för avbytare. */
  grid: string | null;
}

/** Ett lags normaliserade laguppställning. */
export interface LiveLineup {
  teamApiId: number;
  teamName: string;
  formation: string;
  startXI: LiveLineupPlayer[];
  substitutes: LiveLineupPlayer[];
  /** Tränarens namn (city/landslagsförbundskapten), null när API:t saknade det. */
  coachName: string | null;
}

/**
 * Det avgjorda facit-resultatet ur ett fixtures?id-svar. `decidedBy` säger HUR
 * matchen avgjordes så konsumenten inte behöver gissa om penalty-fältet gäller.
 * Mål-fälten är det AUKTORITATIVA slutresultatet ur API:ts `goals`-fält, redan
 * aggregerat (ordinarie + ev. förlängning) men EXKLUSIVE straffar , rätt för FT,
 * AET och PEN (källhänvisat i parse-live.ts, gissas aldrig).
 */
export interface FinalResult {
  apiFixtureId: number;
  homeGoals: number;
  awayGoals: number;
  /** 'regulation' (FT), 'extra-time' (AET) eller 'penalties' (PEN). */
  decidedBy: 'regulation' | 'extra-time' | 'penalties';
  /** Straffresultat, satt bara när decidedBy === 'penalties'. */
  penalties: { homeGoals: number; awayGoals: number } | null;
}
