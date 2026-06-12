// Härled slutspelsträdets LEVANDE tillstånd ur matchresultaten (REN funktion).
//
// Detta är slutspelsträdets motsvarighet till deriveGroupTables (SPEC §6,
// "härledd state"): trädet LAGRAS aldrig, det är en ren funktion av den enda
// sanningen (matchlistan) + den hårt testade FIFA-motorn (T4). Tre lägen, helt
// datadrivna, ingen gissning:
//
//   1. GRUPPSPEL PÅGÅR  -> trädet är LEVANDE redan nu (T56, #100): varje slot
//      fylls PRELIMINÄRT med det lag som leder positionen JUST NU (gruppens
//      nuvarande 1:a/2:a ur tabellen, och de 8 bästa treorna seedade via FIFA:s
//      Annexe C på NUVARANDE ställning). Resolution 'preliminary': laget rör sig
//      vid varje inmatat resultat och är ÄRLIGT MÄRKT i UI:t ("Nuvarande
//      ställning, inte klart förrän grupperna är färdigspelade"). Slot:en bär
//      ÄVEN sina "möjliga lag" + positions-etiketten ("1:a grupp A", "3:a
//      A/B/C/D/F" enligt FIFA Article 12.6), så ingen information går förlorad.
//      Kan en position inte fyllas preliminärt (gruppen saknar laget, eller
//      treorna kan inte rangordnas ärligt) faller slot:en tillbaka till
//      'possible' (bara möjliga lag), aldrig en gissning som facit.
//   2. GRUPPERNA KLARA  -> slotarna LÅSES till riktiga lag: gruppvinnare/tvåa
//      ur de härledda tabellerna, och de 8 bästa treorna seedade via FIFA:s
//      Annexe C (seedThirdPlaces, T4). Treplats-rankningen (Article 13) avgör
//      VILKA 8 grupper som bidrar (rankThirdPlaces). Detta SKARPA läge är
//      OFÖRÄNDRAT av T56 (read-only mot facit): det riktiga trädet rörs aldrig.
//   3. SLUTSPELSRESULTAT FINNS -> vinnaren propagerar till nästa slot
//      (match-winner), och bronsmatchen matas av semifinal-FÖRLORARNA
//      (match-loser). En straff-avgjord match (FIFA Art. 14) ger en entydig
//      vinnare via penalties.
//
// Funktionen är React-fri och muterar inte sina argument, så den är enhetstestbar
// fristående och kan köras om vid varje resultatinmatning (live).
//
// KÄLLA (gissas ALDRIG): hela strukturen + seedningen kommer från den redan
// källhänvisade, verifierade T4-motorn (bracket-structure.ts, build-bracket.ts,
// seed-third-places.ts/Annexe C, rank-third-places.ts/Article 13). Denna modul
// HÄRLEDER bara lag-tillståndet ovanpå den, den definierar ingen ny slutspelsregel.

import type { GroupId, GroupTable, Match } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { buildBracket, type BracketNode } from '../../domain/bracket/build-bracket';
import { seedThirdPlaces } from '../../domain/bracket/seed-third-places';
import { computeThirdPlaceRanking } from '../../domain/bracket/rank-third-places';
import { preliminaryThirdSeeding } from '../../domain/bracket/preliminary-third-seeding';

/** Hur en slots lag är bestämt just nu. */
export type SlotResolution =
  // Ett konkret, framräknat lag (gruppspel klart / slutspelsmatch avgjord).
  | 'resolved'
  // Gruppspelet pågår men positionen har ett PRELIMINÄRT lag: det lag som leder
  // positionen JUST NU (nuvarande 1:a/2:a, eller en preliminärt seedad bästa
  // trea via Annexe C på nuvarande ställning). teamId är satt, men EJ slutgiltigt,
  // det rör sig vid nästa resultat. Slot:en bär även sina candidateTeamIds.
  // Ärligt MÄRKT i UI:t ("Nuvarande ställning, inte klart"). (T56, #100.)
  | 'preliminary'
  // Gruppspelet pågår och inget preliminärt lag kan ärligt ges (positionen kan
  // inte fyllas, t.ex. treorna kan inte rangordnas än), men en mängd MÖJLIGA lag
  // finns (de lag som ännu kan landa i positionen) + en grupp-positions-etikett.
  | 'possible'
  // Inget kan ännu sägas om laget (t.ex. en senare slutspelsmatch vars båda
  // föregångare ännu inte är avgjorda, och inga möjliga lag är meningsfulla).
  | 'tbd';

/**
 * En slot i det HÄRLEDDA trädet: T4:s strukturella BracketNode + lag-tillståndet.
 * `label` är en människo-läsbar position ("1:a grupp A", "Vinnare M89") som UI:t
 * kan visa oavsett läge. `teamId` är satt när `resolution === 'resolved'`.
 * `candidateTeamIds` bär de möjliga lagen när `resolution === 'possible'`.
 */
export interface BracketSlotState {
  /** Slot-id, t.ex. "M79-home" (från build-bracket). */
  id: string;
  /** Matchnummer-id, t.ex. "M79". */
  matchId: string;
  /** Hemma/borta. */
  side: BracketNode['side'];
  /** Rundan (round-of-32 ... final). */
  stage: BracketNode['stage'];
  /** Slot dit vinnaren går vidare, null för final/bronsmatch. */
  nextSlotId: string | null;
  resolution: SlotResolution;
  /** Människo-läsbar positions-etikett (alltid satt). */
  label: string;
  /** Framräknat lag (Team.id), satt vid 'resolved', annars null. */
  teamId: string | null;
  /** Möjliga lag (Team.id) vid 'possible', annars tom. */
  candidateTeamIds: string[];
}

/** En slutspelsmatch i det härledda trädet: dess två slots + ev. utfall. */
export interface BracketMatchState {
  matchId: string;
  stage: BracketNode['stage'];
  home: BracketSlotState;
  away: BracketSlotState;
  /**
   * Vinnarens slot-id ('home'-slotens eller 'away'-slotens id) när matchen är
   * avgjord (inkl. på straffar), annars null. Driver vinnar-propageringen och
   * låter UI:t markera/animera fram vinnaren.
   */
  winnerSlotId: string | null;
}

/** Hela det härledda slutspelsträdet, i officiell match-ordning (M73 -> M104). */
export interface BracketState {
  matches: BracketMatchState[];
  /**
   * Är gruppspelet klart och trädets sextondelsfinaler LÅSTA till riktiga lag?
   * (true när alla 12 gruppers tabeller är slutgiltiga, se isGroupStageComplete.)
   */
  locked: boolean;
  /**
   * Visar trädet ett PRELIMINÄRT läge ur nuvarande ställning (T56, #100)? True när
   * gruppspelet PÅGÅR och minst en slot har ett preliminärt lag, alltså när UI:t
   * ska visa den ärliga "Nuvarande ställning, inte klart"-märkningen. False när
   * trädet är låst (locked) ELLER när inga preliminära lag kunde ges (tidigt i
   * gruppspelet, bara möjliga lag). Härleds, lagras inte. `locked` och
   * `preliminary` är ömsesidigt uteslutande.
   */
  preliminary: boolean;
}

/* ------------------------------------------------------------------ *
 * Etiketter (människo-läsbara positioner). Rena, ingen logik.
 * ------------------------------------------------------------------ */

function winnerLabel(group: GroupId): string {
  return `1:a grupp ${group}`;
}
function runnerUpLabel(group: GroupId): string {
  return `2:a grupp ${group}`;
}
function bestThirdLabel(groups: readonly GroupId[]): string {
  return `3:a ${groups.join('/')}`;
}
function matchWinnerLabel(matchId: string): string {
  return `Vinnare ${matchId}`;
}
function matchLoserLabel(matchId: string): string {
  return `Förlorare ${matchId}`;
}

/* ------------------------------------------------------------------ *
 * Gruppspel: är det klart, och uppslag av tabell-positioner.
 * ------------------------------------------------------------------ */

/**
 * Är gruppspelet klart? Sant när ALLA 12 KANONISKA grupperna (A-L) finns OCH var
 * och en är färdigspelad (varje lag har spelat 3 matcher i VM 2026-formatet). Vi
 * härleder det ur tabellerna (played), inte ur ett separat flagg-fält, så det är
 * en ren funktion av sanningen.
 *
 * Varför UNIKA groupId:n, inte bara `tables.length >= 12` (C3, Copilot runda 1):
 * en längd-koll släpper igenom 12 tabeller som råkar ha en dubblett och saknar en
 * grupp (t.ex. två A, ingen L). Då skulle gruppspelet låsas felaktigt, och slot-
 * resolvern slår upp den saknade gruppen, får undefined och en `resolved` slot med
 * teamId null (en låst plats utan lag). Vi kräver därför att Set:et av groupId:n
 * täcker hela GROUP_IDS (en av varje), fail-safe: hellre fortsatt "pågår" än en
 * felaktig låsning på ofullständig/dubblerad data.
 *
 * Grupp-mängden (alla 12, A-L) härleds ur GROUP_IDS, enda sanningen för giltiga
 * grupper, så formatet har EN definition i stället för en lös 12:a.
 *
 * MATCHES_PER_TEAM = 3: i en grupp om 4 lag spelar varje lag 3 matcher (envars-
 * möte). Härleds inte ur datan (en ofullständig grupp har färre), utan är
 * formatets konstant (SPEC §5).
 */
const MATCHES_PER_TEAM = 3;

export function isGroupStageComplete(tables: readonly GroupTable[]): boolean {
  // Alla KANONISKA grupperna (GROUP_IDS, A-L) måste vara representerade (unika
  // groupId:n), så en dubblett + saknad grupp inte låser seedningen felaktigt.
  // När hela GROUP_IDS täcks är `tables.length >= 12` givet på köpet.
  const presentGroups = new Set(tables.map((t) => t.groupId));
  if (!GROUP_IDS.every((g) => presentGroups.has(g))) {
    return false;
  }
  return tables.every(
    (t) => t.standings.length > 0 && t.standings.every((row) => row.played >= MATCHES_PER_TEAM)
  );
}

/** Slå upp gruppens tabell ur den härledda listan (eller undefined). */
function tableOf(
  tablesByGroup: ReadonlyMap<GroupId, GroupTable>,
  group: GroupId
): GroupTable | undefined {
  return tablesByGroup.get(group);
}

/** Lag-id på en given 1-baserad rank i en grupp, eller null om den saknas. */
function teamAtRank(table: GroupTable | undefined, rank: number): string | null {
  return table?.standings.find((r) => r.rank === rank)?.teamId ?? null;
}

/* ------------------------------------------------------------------ *
 * Resolver per slot-källa.
 * ------------------------------------------------------------------ */

/**
 * Bygg lag-tillståndet för en GRUPP-källa (winner/runner-up) i ETT läge.
 *
 * Klart gruppspel -> resolved (rank 1/2, slutgiltigt).
 *
 * Pågående (T56, #100) -> PRELIMINÄRT: det lag som leder positionen JUST NU
 * (gruppens nuvarande rank-1/rank-2 ur tabellen, beräknat av compute-standings
 * med FIFA:s tiebreak) placeras i slot:en (teamId satt, resolution 'preliminary'),
 * och rör sig vid varje inmatat resultat. Slot:en bär ÄVEN candidateTeamIds (alla
 * lag i gruppen, vilket som helst kan teoretiskt ta platsen innan alla matcher
 * spelats), så "möjliga lag" finns kvar parallellt med det preliminära ledar-laget.
 * Saknas laget på rangen (en tom/ofullständig grupp utan en rad på just den rangen)
 * faller vi tillbaka till 'possible' (bara möjliga lag), aldrig en gissning.
 */
function resolveGroupSlot(
  table: GroupTable | undefined,
  rank: number,
  label: string,
  groupComplete: boolean
): Pick<BracketSlotState, 'resolution' | 'label' | 'teamId' | 'candidateTeamIds'> {
  if (groupComplete) {
    const teamId = teamAtRank(table, rank);
    return { resolution: 'resolved', label, teamId, candidateTeamIds: [] };
  }
  // Gruppspel pågår: alla lag i gruppen är möjliga (positionen är inte avgjord).
  const candidateTeamIds = table ? table.standings.map((r) => r.teamId) : [];
  // PRELIMINÄRT lag = det som leder rangen just nu (om gruppen har en rad där).
  const preliminaryTeamId = teamAtRank(table, rank);
  if (preliminaryTeamId !== null) {
    return { resolution: 'preliminary', label, teamId: preliminaryTeamId, candidateTeamIds };
  }
  // Ingen rad på rangen än (tom/ofullständig grupp): bara möjliga lag, ingen gissning.
  return { resolution: 'possible', label, teamId: null, candidateTeamIds };
}

/**
 * Bygg lag-tillståndet för en BÄSTA-TREA-källa.
 *
 * Klart gruppspel + skarp seedning löst -> resolved (det specifika lagets trea,
 * slutgiltigt via Annexe C).
 *
 * Pågående (T56, #100): om den PRELIMINÄRA Annexe C-seedningen gav en trea till
 * just denna match (preliminaryThirdTeamId satt) placeras den nuvarande trean
 * (resolution 'preliminary', teamId satt). Den rör sig vid varje inmatat resultat
 * och bär ÄVEN sina candidateTeamIds. Annars (treorna kan inte rangordnas ärligt
 * än, t.ex. en grupp saknar en nuvarande trea) -> possible: bara de nuvarande
 * treorna i de behöriga grupperna som kandidater. Aldrig en gissning om vem som
 * kvalificerar bortom vad Annexe C på nuvarande ställning entydigt ger.
 */
function resolveBestThirdSlot(
  eligibleGroups: readonly GroupId[],
  seededTeamId: string | null,
  preliminaryThirdTeamId: string | null,
  tablesByGroup: ReadonlyMap<GroupId, GroupTable>,
  groupComplete: boolean
): Pick<BracketSlotState, 'resolution' | 'label' | 'teamId' | 'candidateTeamIds'> {
  const label = bestThirdLabel(eligibleGroups);
  if (groupComplete && seededTeamId !== null) {
    return { resolution: 'resolved', label, teamId: seededTeamId, candidateTeamIds: [] };
  }
  // Pågående: de nuvarande treorna i de behöriga grupperna är alltid kandidater.
  const candidateTeamIds: string[] = [];
  for (const group of eligibleGroups) {
    const third = teamAtRank(tableOf(tablesByGroup, group), 3);
    if (third !== null) {
      candidateTeamIds.push(third);
    }
  }
  // Gav den preliminära Annexe C-seedningen ett konkret lag till denna match? Visa
  // det preliminärt (rör sig vid nästa resultat), annars bara möjliga lag.
  if (preliminaryThirdTeamId !== null) {
    return {
      resolution: 'preliminary',
      label,
      teamId: preliminaryThirdTeamId,
      candidateTeamIds,
    };
  }
  return { resolution: 'possible', label, teamId: null, candidateTeamIds };
}

/**
 * Bygg lag-tillståndet för en MATCH-PROGRESSIONS-källa (winner/loser av Mxx).
 * Matchen avgjord -> resolved (vinnaren/förloraren propagerad). Annars -> tbd,
 * men om BÅDA lagen i föregångar-matchen är kända (resolved) visar vi dem som
 * möjliga lag (de två som kan gå vidare), så trädet känns levande även framåt.
 */
function resolveMatchProgressionSlot(
  feederMatchId: string,
  wantWinner: boolean,
  outcomeByMatchId: ReadonlyMap<string, MatchOutcome>,
  slotStateById: ReadonlyMap<string, BracketSlotState>,
  label: string
): Pick<BracketSlotState, 'resolution' | 'label' | 'teamId' | 'candidateTeamIds'> {
  const outcome = outcomeByMatchId.get(feederMatchId);
  if (outcome) {
    const teamId = wantWinner ? outcome.winnerTeamId : outcome.loserTeamId;
    return { resolution: 'resolved', label, teamId, candidateTeamIds: [] };
  }
  // Inte avgjord: visa de två möjliga lagen om föregångar-matchens slots är lösta.
  const home = slotStateById.get(`${feederMatchId}-home`);
  const away = slotStateById.get(`${feederMatchId}-away`);
  const candidateTeamIds = [home?.teamId, away?.teamId].filter((id): id is string => id != null);
  return {
    resolution: candidateTeamIds.length > 0 ? 'possible' : 'tbd',
    label,
    teamId: null,
    candidateTeamIds,
  };
}

/* ------------------------------------------------------------------ *
 * Slutspelsmatchernas utfall (vinnare/förlorare), inkl. straffar.
 * ------------------------------------------------------------------ */

interface MatchOutcome {
  winnerTeamId: string;
  loserTeamId: string;
}

/**
 * Härled vinnare/förlorare för en FÄRDIG slutspelsmatch med KÄNDA lag. Lika
 * ordinarie ställning avgörs på straffar (FIFA Article 14); saknas en avgörande
 * straff-vinnare kan utfallet inte bestämmas (returnerar null, ingen gissning).
 * Returnerar null också om lagen ännu inte är kända (slot ej resolved).
 */
function outcomeOf(
  match: Match,
  homeTeamId: string | null,
  awayTeamId: string | null
): MatchOutcome | null {
  if (match.status !== 'finished' || homeTeamId === null || awayTeamId === null) {
    return null;
  }
  const { homeGoals, awayGoals, penalties } = match.result;
  if (homeGoals > awayGoals) {
    return { winnerTeamId: homeTeamId, loserTeamId: awayTeamId };
  }
  if (awayGoals > homeGoals) {
    return { winnerTeamId: awayTeamId, loserTeamId: homeTeamId };
  }
  // Lika ordinarie tid: straffar avgör (Art. 14). Utan avgörande straffar kan
  // vinnaren inte bestämmas (fail-safe: lämna oavgjort, propagera inte en gissning).
  if (penalties && penalties.homeGoals !== penalties.awayGoals) {
    return penalties.homeGoals > penalties.awayGoals
      ? { winnerTeamId: homeTeamId, loserTeamId: awayTeamId }
      : { winnerTeamId: awayTeamId, loserTeamId: homeTeamId };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Huvud-härledningen.
 * ------------------------------------------------------------------ */

/**
 * Härled slutspelsträdets levande tillstånd.
 *
 * @param tables   De härledda grupptabellerna (deriveGroupTables). Avgör låsning
 *                 + seedning när gruppspelet är klart, och driver "möjliga lag"
 *                 under gruppspelet.
 * @param matches  Alla matcher (den enda sanningen). Slutspelsmatchernas resultat
 *                 driver vinnar-propageringen.
 * @returns        Hela trädet i officiell match-ordning, med varje slots
 *                 lag-tillstånd (resolved/possible/tbd) + matchutfall.
 *
 * Slotarna byggs i match-ordning (M73 -> M104), och eftersom en match ALLTID
 * kommer efter sina föregångare i den ordningen (FIFA-numreringen), är en slots
 * föregångar-utfall redan beräknat när vi når den. Så en enda passering räcker
 * för att propagera vinnare genom hela trädet.
 */
export function deriveBracket(
  tables: readonly GroupTable[],
  matches: readonly Match[]
): BracketState {
  const nodes = buildBracket();
  const tablesByGroup = new Map<GroupId, GroupTable>(tables.map((t) => [t.groupId, t]));
  const matchById = new Map<string, Match>(matches.map((m) => [m.id, m]));
  const groupComplete = isGroupStageComplete(tables);

  // SKARP seedning av de 8 bästa treorna (bara när gruppspelet är klart): matchId
  // -> trean. qualifyingGroups är null tills rangordningen är komplett (en trea per
  // grupp, alla A-L representerade OCH färdigspelade), då seedar vi inte. En giltig
  // kombination ger en kollisionsfri Annexe C-seedning. OFÖRÄNDRAT av T56 (facit).
  const thirdByMatchId = new Map<string, string>();
  if (groupComplete) {
    const { qualifyingGroups } = computeThirdPlaceRanking(tables);
    if (qualifyingGroups) {
      for (const assignment of seedThirdPlaces(qualifyingGroups)) {
        const teamId = teamAtRank(tableOf(tablesByGroup, assignment.thirdPlaceGroup), 3);
        if (teamId !== null) {
          thirdByMatchId.set(assignment.matchId, teamId);
        }
      }
    }
  }

  // PRELIMINÄR seedning av de 8 NUVARANDE bästa treorna under gruppspelet (T56,
  // #100): matchId -> lag-id för den NUVARANDE trean i seedad grupp. Tom Map när
  // gruppspelet är klart (då gäller den skarpa thirdByMatchId ovan) eller när
  // treorna inte kan rangordnas ärligt än (preliminaryThirdSeeding returnerar tom
  // Map då). Samma källlåsta motorer (rankThirdPlaces + seedThirdPlaces/Annexe C),
  // bara på nuvarande ställning. Lag-id slås upp ur tabellens nuvarande rank-3-rad.
  const preliminaryThirdByMatchId = new Map<string, string>();
  if (!groupComplete) {
    for (const [matchId, group] of preliminaryThirdSeeding(tables)) {
      const teamId = teamAtRank(tableOf(tablesByGroup, group), 3);
      if (teamId !== null) {
        preliminaryThirdByMatchId.set(matchId, teamId);
      }
    }
  }

  // Bygg slot-tillstånden i match-ordning, så en match-progressions-slot kan slå
  // upp sin föregångares redan beräknade utfall + slot-tillstånd.
  const slotStateById = new Map<string, BracketSlotState>();
  const outcomeByMatchId = new Map<string, MatchOutcome>();
  const matchStates: BracketMatchState[] = [];

  // Gruppera noderna per match (home/away) i strukturens ordning.
  const nodesByMatch = new Map<string, { home?: BracketNode; away?: BracketNode }>();
  const matchOrder: string[] = [];
  for (const node of nodes) {
    let pair = nodesByMatch.get(node.matchId);
    if (!pair) {
      pair = {};
      nodesByMatch.set(node.matchId, pair);
      matchOrder.push(node.matchId);
    }
    pair[node.side] = node;
  }

  for (const matchId of matchOrder) {
    const pair = nodesByMatch.get(matchId)!;
    const homeNode = pair.home!;
    const awayNode = pair.away!;

    const homeState = buildSlotState(
      homeNode,
      thirdByMatchId,
      preliminaryThirdByMatchId,
      tablesByGroup,
      outcomeByMatchId,
      slotStateById,
      groupComplete
    );
    const awayState = buildSlotState(
      awayNode,
      thirdByMatchId,
      preliminaryThirdByMatchId,
      tablesByGroup,
      outcomeByMatchId,
      slotStateById,
      groupComplete
    );
    slotStateById.set(homeState.id, homeState);
    slotStateById.set(awayState.id, awayState);

    // Beräkna matchutfallet NU (efter att lagen lösts) så efterföljande matchers
    // progressions-slots kan slå upp det i samma passering.
    const match = matchById.get(matchId);
    let winnerSlotId: string | null = null;
    if (match) {
      const outcome = outcomeOf(match, homeState.teamId, awayState.teamId);
      if (outcome) {
        outcomeByMatchId.set(matchId, outcome);
        winnerSlotId = outcome.winnerTeamId === homeState.teamId ? homeState.id : awayState.id;
      }
    }

    matchStates.push({
      matchId,
      stage: homeNode.stage,
      home: homeState,
      away: awayState,
      winnerSlotId,
    });
  }

  // preliminary: gruppspelet pågår OCH minst en slot fick ett preliminärt lag
  // (nuvarande 1:a/2:a eller en preliminärt seedad trea). Driver UI:ts ärliga
  // "Nuvarande ställning, inte klart"-märkning. Ömsesidigt uteslutande med locked.
  const preliminary =
    !groupComplete &&
    matchStates.some(
      (m) => m.home.resolution === 'preliminary' || m.away.resolution === 'preliminary'
    );

  return { matches: matchStates, locked: groupComplete, preliminary };
}

/** Bygg en slots fulla tillstånd ur dess källa + det aktuella läget. */
function buildSlotState(
  node: BracketNode,
  thirdByMatchId: ReadonlyMap<string, string>,
  preliminaryThirdByMatchId: ReadonlyMap<string, string>,
  tablesByGroup: ReadonlyMap<GroupId, GroupTable>,
  outcomeByMatchId: ReadonlyMap<string, MatchOutcome>,
  slotStateById: ReadonlyMap<string, BracketSlotState>,
  groupComplete: boolean
): BracketSlotState {
  const base = {
    id: node.id,
    matchId: node.matchId,
    side: node.side,
    stage: node.stage,
    nextSlotId: node.nextSlotId,
  };

  const source = node.source;
  let resolved: Pick<BracketSlotState, 'resolution' | 'label' | 'teamId' | 'candidateTeamIds'>;

  switch (source.kind) {
    case 'group-winner':
      resolved = resolveGroupSlot(
        tableOf(tablesByGroup, source.group),
        1,
        winnerLabel(source.group),
        groupComplete
      );
      break;
    case 'group-runner-up':
      resolved = resolveGroupSlot(
        tableOf(tablesByGroup, source.group),
        2,
        runnerUpLabel(source.group),
        groupComplete
      );
      break;
    case 'best-third':
      resolved = resolveBestThirdSlot(
        source.eligibleGroups,
        thirdByMatchId.get(node.matchId) ?? null,
        preliminaryThirdByMatchId.get(node.matchId) ?? null,
        tablesByGroup,
        groupComplete
      );
      break;
    case 'match-winner':
      resolved = resolveMatchProgressionSlot(
        source.matchId,
        true,
        outcomeByMatchId,
        slotStateById,
        matchWinnerLabel(source.matchId)
      );
      break;
    case 'match-loser':
      resolved = resolveMatchProgressionSlot(
        source.matchId,
        false,
        outcomeByMatchId,
        slotStateById,
        matchLoserLabel(source.matchId)
      );
      break;
  }

  return { ...base, ...resolved };
}

/* ------------------------------------------------------------------ *
 * UI-hjälp: gruppera trädet i rundor (för en kolumn-per-runda-layout).
 * ------------------------------------------------------------------ */

/**
 * Rundornas ordning vänster -> höger i trädet (officiell progression).
 *
 * Bronsmatchen (third-place, M103) står FÖRE finalen (final, M104), eftersom den
 * SPELAS före finalen i FIFA:s schema: båda matas av semifinalerna (M101/M102),
 * bronsmatchen av förlorarna och finalen av vinnarna, och bronsmatchen ligger
 * tidigare i kalendern. KÄLLA (verifierad mot T4:s tablå, gissas inte): VM 2026:s
 * svenska TV-tablå (tv-schedule-source.txt) anger BRONSMATCH lör 18 juli (M103)
 * och FINAL sön 19 juli (M104), och matches.ts har kickoff M103
 * 2026-07-18T21:00:00Z < M104 2026-07-19T19:00:00Z. Strukturen (bracket-
 * structure.ts, FIFA Art. 12.10-12.11) bekräftar M103 = brons, M104 = final.
 */
export const ROUND_ORDER: ReadonlyArray<BracketNode['stage']> = [
  'round-of-32',
  'round-of-16',
  'quarter-final',
  'semi-final',
  'third-place',
  'final',
];

/** Svenska rubriker per runda (en sanning för UI:t). */
export const ROUND_LABELS: Readonly<Record<BracketNode['stage'], string>> = {
  'round-of-32': 'Sextondelsfinaler',
  'round-of-16': 'Åttondelsfinaler',
  'quarter-final': 'Kvartsfinaler',
  'semi-final': 'Semifinaler',
  'third-place': 'Bronsmatch',
  final: 'Final',
};

/** En runda med sina matcher (för kolumn-per-runda-rendering). */
export interface BracketRound {
  stage: BracketNode['stage'];
  label: string;
  matches: BracketMatchState[];
}

/**
 * Dela upp det härledda trädet i rundor i officiell progressions-ordning. Tom
 * runda hoppas över (ska inte hända för det fulla trädet, men robust).
 */
export function groupByRound(state: BracketState): BracketRound[] {
  const byStage = new Map<BracketNode['stage'], BracketMatchState[]>();
  for (const match of state.matches) {
    const bucket = byStage.get(match.stage);
    if (bucket) {
      bucket.push(match);
    } else {
      byStage.set(match.stage, [match]);
    }
  }
  const rounds: BracketRound[] = [];
  for (const stage of ROUND_ORDER) {
    const matches = byStage.get(stage);
    if (matches && matches.length > 0) {
      rounds.push({ stage, label: ROUND_LABELS[stage], matches });
    }
  }
  return rounds;
}
