// Tolerant installer för diakritik-vakten. Pekar gits hook-sökväg på .githooks/
// så commit-msg + pre-commit-hookarna aktiveras automatiskt vid `npm install`
// (via "prepare"-scriptet, se package.json).
//
// Varför ett Node-script i stället för att köra `git config ...` rakt i "prepare":
// "prepare" körs vid VARJE `npm install`, även i miljöer som saknar git eller
// inte är ett git-repo (käll-tarball, vissa CI-/Docker-bygg-lägen). Ett rått
// git-kommando failar då och kan fälla hela `npm install`. Detta script sväljer
// alla fel TYST , att vakten inte kunde installeras får aldrig blockera en
// beroende-installation. Cross-platform: ren Node, ingen sh/PowerShell-skillnad
// (npm kör scripts olika per plattform, så `|| true` vore inte pålitligt).
//
// hooks:install i package.json kör SAMMA logik men i strikt läge (kastar vidare),
// så att köra den med flit visar felet om något är fel med git-konfigurationen.

import { execFileSync } from 'node:child_process';

const HOOK_SÖKVÄG = '.githooks';

/**
 * Försök peka gits core.hooksPath på .githooks. I strikt läge kastas felet
 * vidare (synligt vid explicit `npm run hooks:install`), annars sväljs det så
 * att `npm install` aldrig kraschar på en miljö utan git/.git.
 * @param {{ strikt?: boolean }} [opts]
 */
export function installeraHooks({ strikt = false } = {}) {
  try {
    // stdio: "ignore" -> ingen brus-utskrift vid normal install. Lyckas detta
    // är vakten aktiv för repot; annars faller vi tyst igenom (se nedan).
    execFileSync('git', ['config', 'core.hooksPath', HOOK_SÖKVÄG], {
      stdio: 'ignore',
    });
    return true;
  } catch (fel) {
    if (strikt) {
      // Explicit anrop (hooks:install): låt felet bubbla så användaren ser det.
      throw fel;
    }
    // Auto-läge (prepare): git saknas eller mappen är inte ett git-repo.
    // Tyst no-op , diakritik-vakten är en bekvämlighet, inte ett install-krav.
    return false;
  }
}

// Kör direkt: argv innehåller "--strict" bara när hooks:install anropar oss.
const strikt = process.argv.includes('--strict');
installeraHooks({ strikt });
