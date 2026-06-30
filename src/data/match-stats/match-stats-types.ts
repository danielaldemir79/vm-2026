// DELAD match-statistik-modell (T86, #178): den ENA sanningen för hur en matchs
// redan-parsade live-data (events/statistics/lineups) projiceras till rena, MATCH-
// AGNOSTISKA domän-strukturer. Byggd för ÅTERANVÄNDNING (G5): T86 (rik matchvy) renderar
// EN match, T87 (skytteliga) aggregerar mål/assist över ALLA matcher, T88 (turnerings-
// statistik) aggregerar kort/innehav/skott över ALLA matcher. Alla tre läser SAMMA
// projektion, så "vad är ett mål / vem är skytt / hur räknas ett egenmål" har en sanning.
//
// VARFÖR EN EGEN MODELL OCH INTE live-card-model.ts (skarven mot återanvändningen):
// live-card-model.ts projicerar samma data men SID-NYCKLAT (home/away), för EN match i
// EN vy , dess GoalEntry tappar `teamApiId` och spelar-id:t (bara `side` + namn bevaras),
// och dess "vem är hemma" kräver ett homeApiId. Det är rätt för ETT livekort men oanvändbart
// för en CROSS-MATCH-aggregering (där home/away är meningslöst och man måste gruppera på
// lag-id + spelar-id över hundratals matcher). Denna modul är därför TEAM-/SPELAR-NYCKLAD
// och match-agnostisk: ingen home/away, ingen homeApiId, bara API:ts egna id:n bevarade
// exakt som de kommer. live-card-model.ts blir på sikt en tunn sid-vy ovanpå denna (T95),
// men det ligger UTANFÖR T86 (rör inte en fungerande live-vy mitt under VM).
//
// INGEN OMTOLKNING AV API:t (gissa aldrig, lessons "lattgissad-domanregel"): vi BEVARAR
// `teamApiId` exakt som API-Football attribuerar eventet , vi gissar ALDRIG om ett egenmåls
// team-fält pekar på det gjorda-emot-laget eller det gynnade laget (de två stora fotbolls-
// API:erna är OENIGA om den konventionen, och API-Footballs egen doc går inte att nå för
// bekräftelse, se docs/decisions.md 2026-06-16). Det enda vi härleder om ett egenmål är
// den VERIFIERBARA flaggan `isOwnGoal` (ur detail "Own Goal", samma källa som live-card-
// model redan använder), så en konsument (T87) kan EXKLUDERA egenmål ur en spelares
// skytte-tally , den regeln (ett egenmål räknas ALDRIG som skyttens mål) är universell och
// provider-oberoende, till skillnad från team-krediteringen.

import type { CardColor, LiveEventKind } from '../livescore';

/**
 * Ett mål, match-agnostiskt (T87 aggregerar dessa över alla matcher till en skytteliga).
 * `teamApiId` är BEVARAT exakt som API:t attribuerade eventet (ingen omtolkning). Egenmål
 * FLAGGAS (isOwnGoal) men krediteras INTE bort till motståndaren här , den verifierbara
 * regeln T87 behöver är "ett egenmål är aldrig skyttens mål", och den uttrycks genom att en
 * konsument filtrerar `isOwnGoal === false` innan den räknar skytt-tally per spelare.
 */
export interface MatchGoal {
  /** Spelad minut (event.time.elapsed). */
  minute: number;
  /** Tilläggsminut inom perioden (90+`extra`), null när inget tillägg. */
  extra: number | null;
  /** API:ts lag-id eventet är attribuerat till (BEVARAT, ej omtolkat). */
  teamApiId: number;
  teamName: string;
  /**
   * Målskyttens API-spelar-id, null när API:t saknade det. NYCKEL för T87:s skytteliga
   * (gruppera mål per spelar-id, namn kan stavas olika mellan svar , id:t är stabilt).
   */
  scorerId: number | null;
  /** Målskyttens namn (städat), null när API:t saknade det (gissa aldrig en spelare). */
  scorerName: string | null;
  /** Assistens API-spelar-id, null när ingen assist (vanligt). */
  assistId: number | null;
  /** Assistens namn (städat), null när ingen assist. */
  assistName: string | null;
  /** true för straffmål (detail "Penalty"). Räknas SOM mål men flaggas (Daniels spec). */
  isPenalty: boolean;
  /**
   * true för egenmål (detail "Own Goal"). Räknas som mål i matchen men ska EXKLUDERAS ur en
   * spelares skytte-tally (ett egenmål är aldrig skyttens mål). `teamApiId` är INTE omtolkat
   * (se modul-headern: team-krediterings-konventionen är overifierad).
   */
  isOwnGoal: boolean;
}

/**
 * En straffläggnings-spark (efter oavgjord ordinarie + förlängning i slutspel), match-
 * agnostisk. SKILJD från MatchGoal MED FLIT: en straffserie-spark RÄKNAS INTE som mål (varken
 * i ställningen, skytteligan eller en mål-notis , FIFA: straffserien avgör bara vinnaren), och
 * en MISSAD spark finns med här men är aldrig ett mål. Därför är detta en egen typ, inte en
 * MatchGoal med en flagga, så ingen konsument råkar räkna en straffserie-spark som ett mål.
 *
 * KÄLLHÄNVISAT (fixture-aet-pen.json, gissas aldrig): API-Football levererar varje spark som
 * ett event med comments "Penalty Shootout", minut 120 och `extra` = sparkens ORDNING (1,2,3...).
 * En satt spark har detail "Penalty", en missad har detail "Missed Penalty" (bägge type "Goal").
 */
export interface ShootoutKick {
  /** Sparkens ordning i serien (API:ts event.time.extra: 1,2,3...). Driver kronologin. */
  order: number;
  /** API:ts lag-id sparken är attribuerad till (bevarat, ej omtolkat). */
  teamApiId: number;
  teamName: string;
  /** Skyttens API-spelar-id, null när API:t saknade det. */
  playerId: number | null;
  /** Skyttens namn (städat), null när API:t saknade det (gissa aldrig en spelare). */
  playerName: string | null;
  /** true = satt straff (detail "Penalty"), false = missad (detail "Missed Penalty"). */
  scored: boolean;
}

/** Ett kort (gult/rött), match-agnostiskt (T88 aggregerar kort per lag över alla matcher). */
export interface MatchCardEvent {
  minute: number;
  extra: number | null;
  teamApiId: number;
  teamName: string;
  /** Spelarens API-id, null när API:t saknade det. */
  playerId: number | null;
  /** Spelarens namn (städat), null när API:t saknade det. */
  playerName: string | null;
  /** Kortfärg (redan normaliserad ur detail av parse-live). */
  color: CardColor;
}

/** Ett byte, match-agnostiskt. In = event.player, ut = event.assist (API-formen vid subst). */
export interface MatchSub {
  minute: number;
  extra: number | null;
  teamApiId: number;
  teamName: string;
  /** Inbytt spelares id/namn (event.player), namn null när API:t saknade det. */
  playerInId: number | null;
  playerInName: string | null;
  /** Utbytt spelares id/namn (event.assist), null när API:t saknade det. */
  playerOutId: number | null;
  playerOutName: string | null;
}

/**
 * En övrig händelse (VAR-granskning, eller en `other`-typ vi inte modellerar separat),
 * bevarad så en tidslinje kan visa HELA förloppet utan att tappa något (kind + rå typ +
 * detail räcker för en neutral rad). Mål/kort/byten har egna, rikare strukturer ovan.
 */
export interface MatchOtherEvent {
  minute: number;
  extra: number | null;
  teamApiId: number;
  teamName: string;
  /** Normaliserad kind ('var' eller 'other'). */
  kind: Extract<LiveEventKind, 'var' | 'other'>;
  /** Den råa API-typen (bevarad). */
  rawType: string;
  /** Underkategori ("Penalty confirmed"/...). */
  detail: string;
  /** Spelare inblandad, om någon (städat namn), null annars. */
  playerName: string | null;
}

/**
 * Ett kanoniskt statistik-nyckeltal för ETT lag, parsad till ett TAL där det går (T88
 * aggregerar t.ex. medel-bollinnehav, totalt antal skott över alla matcher). Behåller även
 * råtexten för exakt visning ("78%" vs talet 78).
 */
export interface TeamStatMetric {
  /** Den kanoniska nyckeln (se STAT_METRICS), t.ex. 'possession' | 'shotsTotal'. */
  key: TeamStatKey;
  /** Råvärdet för visning (t.ex. "78%" eller "13"), null när API:t saknade ett värde. */
  text: string | null;
  /** Det numeriska värdet (procent "78%" -> 78, "13" -> 13), null när icke-numeriskt/saknat. */
  value: number | null;
}

/**
 * De kanoniska statistik-nyckeltal vi normaliserar (en STÄNGD union så konsumenter kan
 * switcha uttömmande, och så ett tillagt nyckeltal blir ett kompileringsfel snarare än en
 * tyst missad nyckel). URVAL (KISS): de mest meningsfulla nyckeltalen för både matchvyn
 * (T86) och turneringsstatistiken (T88), inte API:ts hela råa lista (med dubbletter).
 */
export type TeamStatKey =
  | 'possession'
  | 'shotsTotal'
  | 'shotsOnGoal'
  | 'shotsOffGoal'
  | 'corners'
  | 'fouls'
  | 'offsides'
  | 'saves'
  | 'passesAccuracy';

/** Ett lags samlade, normaliserade nyckeltal (match-agnostiskt, team-nycklat). */
export interface TeamMatchStats {
  teamApiId: number;
  teamName: string;
  /** Nyckeltalen i kanonisk ordning (bara de API:t faktiskt levererade ett värde för). */
  metrics: TeamStatMetric[];
}

/** En spelare i en normaliserad laguppställning (bär API:ts fält rakt av). */
export interface LineupPlayerInfo {
  apiPlayerId: number;
  name: string;
  number: number;
  /** Position ("G"/"D"/"M"/"F"). */
  position: string;
  /** Rutnätsposition "rad:kolumn", null för avbytare. */
  grid: string | null;
}

/** Ett lags normaliserade laguppställning (formation + startelva + avbytare + ev. tränare). */
export interface TeamLineupInfo {
  teamApiId: number;
  teamName: string;
  formation: string;
  startXI: LineupPlayerInfo[];
  substitutes: LineupPlayerInfo[];
  /** Tränarens namn, null när API:t saknade lineup-coach (vi gissar aldrig). */
  coachName: string | null;
}
