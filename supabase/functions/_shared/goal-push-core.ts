// GENERERAD FIL , REDIGERA INTE FÖR HAND (T89, #182).
//
// Detta är den BUNDLADE, rena mål-push-grafen ur src/features/push/edge-entry.ts
// (parseEvents + extractGoals + goal-detection + push-preferences), emitterad av
// scripts/generate-goal-push-core.ts via esbuild så goal-push-dispatcher (Deno) kan
// köra EXAKT samma testade TS (samma måltolkning som skytteligan, SPEC §13.3).
//
// SYNK: ändras mål-detekterings-/preferens-/parse-koden i src, KÖR `npm run gen:goal-push-core`
// och committa om denna fil. Paritet vaktas i goal-push-core-mirror-parity.test.ts
// (bundlar om src och jämför diskriminerande in->ut mot denna fil , divergens rödnar i CI).
// @ts-nocheck , Deno-runtime, typas/lintas inte av app-grafen (eslint/tsc kör mot src/).

// src/data/livescore/parse-live.ts
function requireResponseArray(payload, what) {
  if (payload === null || typeof payload !== "object") {
    throw new Error(`${what}: svaret \xE4r inte ett objekt.`);
  }
  const { errors } = payload;
  if (Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0) {
    throw new Error(`${what}: API rapporterade fel: ${JSON.stringify(errors)}`);
  }
  if (!Array.isArray(payload.response)) {
    throw new Error(`${what}: response saknas eller \xE4r inte en array.`);
  }
  return payload.response;
}
function normalizeEventKind(rawType) {
  switch (rawType.toLowerCase()) {
    case "goal":
      return "goal";
    case "card":
      return "card";
    case "subst":
      return "subst";
    case "var":
      return "var";
    default:
      return "other";
  }
}
function readCardColor(kind, detail) {
  if (kind !== "card") {
    return null;
  }
  const d = detail.toLowerCase();
  if (d.includes("yellow-red") || d.includes("yellowred")) {
    return "red";
  }
  if (d.includes("yellow")) {
    return "yellow";
  }
  if (d.includes("red")) {
    return "red";
  }
  return null;
}
function cleanName(name) {
  if (name === null) {
    return null;
  }
  const collapsed = name.replace(/\s+/g, " ").trim();
  const stripped = collapsed.replace(/^\d+\s+(?=\S*[A-Za-zÀ-ÿ])/, "");
  return stripped.length > 0 ? stripped : null;
}
function toEvent(e) {
  if (typeof e.team?.id !== "number") {
    throw new Error("Event saknar numeriskt team.id.");
  }
  if (typeof e.time?.elapsed !== "number") {
    throw new Error(`Event f\xF6r lag ${e.team.id} saknar time.elapsed.`);
  }
  const kind = normalizeEventKind(e.type);
  return {
    minute: e.time.elapsed,
    extra: e.time.extra ?? null,
    kind,
    rawType: e.type,
    detail: e.detail,
    teamApiId: e.team.id,
    teamName: e.team.name,
    // Spelar-/assist-id bärs vidare (stabil nyckel för skytteligan, T87). Råsvaret kan ha
    // id null (t.ex. en assist som saknas), då blir det null , gissa aldrig ett id.
    playerId: e.player?.id ?? null,
    playerName: cleanName(e.player?.name ?? null),
    assistId: e.assist?.id ?? null,
    assistName: cleanName(e.assist?.name ?? null),
    cardColor: readCardColor(kind, e.detail),
    // Bär API:ts comments vidare oförändrat (null när saknat). Markören "Penalty Shootout"
    // läses senare i projektionen (match-stats) för att skilja straffserie från riktiga mål.
    comments: e.comments ?? null
  };
}
function parseEvents(payload) {
  return requireResponseArray(payload, "parseEvents").map(toEvent);
}

// src/data/match-stats/match-stats.ts
function isPenaltyGoal(detail) {
  return /penalty/i.test(detail);
}
function isShootoutKick(e) {
  return e.comments !== null && /penalty shootout/i.test(e.comments);
}
function isMissedPenalty(detail) {
  return /missed penalty/i.test(detail);
}
function isRealGoalEvent(e) {
  return e.kind === "goal" && !isShootoutKick(e) && !isMissedPenalty(e.detail);
}
function isOwnGoalDetail(detail) {
  return /own goal/i.test(detail);
}
function extractGoals(events) {
  return events.filter(isRealGoalEvent).map(
    (e) => ({
      minute: e.minute,
      extra: e.extra,
      teamApiId: e.teamApiId,
      teamName: e.teamName,
      scorerId: e.playerId,
      scorerName: e.playerName,
      assistId: e.assistId,
      assistName: e.assistName,
      isPenalty: isPenaltyGoal(e.detail),
      isOwnGoal: isOwnGoalDetail(e.detail)
    })
  ).sort(byTime);
}
function byTime(a, b) {
  if (a.minute !== b.minute) {
    return a.minute - b.minute;
  }
  return (a.extra ?? 0) - (b.extra ?? 0);
}

// src/features/push/goal-detection.ts
function goalSignature(goal, matchId) {
  return [
    matchId,
    goal.minute,
    goal.extra ?? "",
    goal.teamApiId,
    goal.scorerId ?? "",
    goal.scorerName ?? "",
    goal.isPenalty ? "p" : "",
    goal.isOwnGoal ? "o" : ""
  ].join("|");
}
function diffNewGoals(oldEvents, newEvents, matchId) {
  const oldSignatures = new Set(extractGoals(oldEvents).map((g) => goalSignature(g, matchId)));
  const detected = [];
  for (const goal of extractGoals(newEvents)) {
    const signature = goalSignature(goal, matchId);
    if (!oldSignatures.has(signature)) {
      detected.push({ signature, goal });
    }
  }
  return detected;
}
function scoringSideFromScoreDelta(oldScore, newScore) {
  if (newScore.home === null || newScore.away === null) {
    return null;
  }
  const oldHome = oldScore.home ?? 0;
  const oldAway = oldScore.away ?? 0;
  const homeDelta = newScore.home - oldHome;
  const awayDelta = newScore.away - oldAway;
  if (homeDelta > 0 && awayDelta <= 0) {
    return "home";
  }
  if (awayDelta > 0 && homeDelta <= 0) {
    return "away";
  }
  return null;
}
function formatGoalNotification(side, score, teamName, url = "/") {
  if (score.home === null || score.away === null) {
    return { title: "M\xC5L!", body: "M\xE5l i matchen!", url };
  }
  if (side !== null && teamName !== null) {
    const ledande = side === "home" ? score.home : score.away;
    const andra = side === "home" ? score.away : score.home;
    return { title: "M\xC5L!", body: `${teamName} ${ledande}-${andra}`, url };
  }
  return { title: "M\xC5L!", body: `M\xE5l! ${score.home}-${score.away}`, url };
}
function resolveCelebratedTeamName(detected, allEvents) {
  const { goal } = detected;
  if (!goal.isOwnGoal) {
    return goal.teamName;
  }
  const other = allEvents.find((e) => e.teamApiId !== goal.teamApiId);
  return other ? other.teamName : null;
}

// src/features/push/push-preferences.ts
var QUIET_HOURS_START_HOUR = 23;
var QUIET_HOURS_END_HOUR = 8;
var QUIET_HOURS_TZ = "Europe/Stockholm";
function isQuietHoursStockholm(now) {
  const localHour = stockholmHour(now);
  return localHour >= QUIET_HOURS_START_HOUR || localHour < QUIET_HOURS_END_HOUR;
}
function stockholmHour(now) {
  if (Number.isNaN(now.getTime())) {
    throw new Error("[VM2026] isQuietHoursStockholm: ogiltig Date.");
  }
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: QUIET_HOURS_TZ,
    hour: "2-digit",
    hour12: false
  }).format(now);
  const hour = Number.parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}
function matchesScope(prefs, match) {
  if (prefs.scope === "all") {
    return true;
  }
  if (prefs.favoriteTeamId === null) {
    return true;
  }
  return match.homeTeamId === prefs.favoriteTeamId || match.awayTeamId === prefs.favoriteTeamId;
}
function shouldNotifyUser(prefs, match, now) {
  if (!prefs.notifyEnabled) {
    return { notify: false, reason: "disabled" };
  }
  if (prefs.quietHoursEnabled && isQuietHoursStockholm(now)) {
    return { notify: false, reason: "quiet-hours" };
  }
  if (!matchesScope(prefs, match)) {
    return { notify: false, reason: "out-of-scope" };
  }
  return { notify: true };
}
export {
  QUIET_HOURS_END_HOUR,
  QUIET_HOURS_START_HOUR,
  QUIET_HOURS_TZ,
  diffNewGoals,
  extractGoals,
  formatGoalNotification,
  goalSignature,
  isQuietHoursStockholm,
  matchesScope,
  parseEvents,
  resolveCelebratedTeamName,
  scoringSideFromScoreDelta,
  shouldNotifyUser,
  stockholmHour
};
