// Bygg-stämpel: REN logik (inga Node-imports, inga sido-effekter) för att härleda
// den korta commit-SHA:n + byggtiden som stämplas in i appen, så appen kan visa
// exakt vilken version som är live. Detta löser "är det live?"-förvirringen:
// version-raden i appen jämförs mot develop-HEAD (debug-agentens förbättring, #74).
//
// VARFÖR ren (Node-läsningarna sker i vite.config): de FAKTISKA sido-effekterna
// (git rev-parse, process.env) bor i vite.config (Node-sidan, tsconfig.node), och
// denna modul tar bara redan-lästa primitiver. Då kan regeln (prioritetsordning +
// fallback) enhetstestas i app-projektet utan Node-typer och utan att köra git.
//
// KÄLLA för Cloudflare-variabeln: Cloudflare Pages sätter `CF_PAGES_COMMIT_SHA`
// i byggmiljön (Cloudflare Docs, "Pages > Build configuration > Environment
// variables > System environment variables"). Vi föredrar den i Cloudflare-bygget
// (git-mappen kan vara grund/saknas där) och faller tillbaka på `git rev-parse`
// lokalt. Se docs/decisions.md (T43).

/** Längden på den korta SHA:n som visas i appen (git-standard kort-hash). */
export const SHORT_SHA_LENGTH = 7;

/** Värdet som visas när ingen SHA kunde härledas (fail-soft, inte krasch). */
export const UNKNOWN_SHA = 'unknown';

/** Indata till SHA-upplösningen (rena värden, lätt att testa varje gren). */
export interface CommitShaContext {
  /** Cloudflare Pages systemvariabel (CF_PAGES_COMMIT_SHA), om satt i bygget. */
  cloudflareSha: string | undefined;
  /** Resultatet av git rev-parse HEAD (full SHA), eller null om git saknas/fel. */
  gitSha: string | null;
}

/**
 * Härled den korta commit-SHA:n som ska stämplas in i appen.
 *
 * Prioritetsordning (medvetet):
 *   1. CF_PAGES_COMMIT_SHA (Cloudflare-bygget) , den auktoritativa källan i
 *      produktion, satt av plattformen oavsett git-mappens skick.
 *   2. git rev-parse HEAD (lokalt bygge / CI med full historik).
 *   3. UNKNOWN , inget gick att härleda; vi GISSAR aldrig en SHA, en ärlig
 *      "unknown" är bättre än en påhittad version.
 *
 * Full SHA klipps till de första SHORT_SHA_LENGTH tecknen (git short hash). En
 * tom/whitespace-sträng räknas som FRÅNVARO (inte en giltig SHA), så en satt-men-
 * tom env-variabel inte ger en tom version-rad.
 */
export function resolveCommitSha(ctx: CommitShaContext): string {
  const raw = ctx.cloudflareSha?.trim() || ctx.gitSha?.trim() || '';
  if (raw === '') {
    return UNKNOWN_SHA;
  }
  return raw.slice(0, SHORT_SHA_LENGTH);
}

/** Den lösta bygg-stämpeln som injiceras i bundeln (via Vite define). */
export interface BuildInfo {
  /** Kort commit-SHA (7 tecken) eller "unknown". */
  sha: string;
  /** Byggtid som ISO 8601-sträng (UTC). */
  builtAt: string;
}

/**
 * Sätt ihop bygg-stämpeln ur redan-lästa värden. Anropas i vite.config (Node-
 * sidan) som matar in env-SHA, git-SHA och byggtiden.
 *
 * @param cloudflareSha CF_PAGES_COMMIT_SHA (eller undefined).
 * @param gitSha        git rev-parse HEAD-resultat (eller null vid fel/saknad git).
 * @param builtAtIso    byggtiden som ISO-sträng (default = now, UTC).
 */
export function resolveBuildInfo(
  cloudflareSha: string | undefined,
  gitSha: string | null,
  builtAtIso: string = new Date().toISOString()
): BuildInfo {
  return {
    sha: resolveCommitSha({ cloudflareSha, gitSha }),
    builtAt: builtAtIso,
  };
}
