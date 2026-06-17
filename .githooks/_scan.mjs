// Node-runner för diakritik-vakten. Anropas av git-hookarna
// (.githooks/commit-msg + .githooks/pre-commit) som tunna shims.
//
// Varför Node och inte ett shell-skript: grundorsaken till hela vakten är att
// PowerShell förvränger UTF-8. Node läser filer som UTF-8 rätt OBEROENDE av vilket
// skal som startade hooken (Git for Windows sh, bash, zsh), så scanningen blir
// stabil cross-platform. Hook-shimsen behöver bara starta `node` , ingen
// skal-specifik sträng-hantering.
//
// All scan-LOGIK bor i src/lib/diakritik-vakt.mjs (EN sanning, samma fil som
// Vitest-testet importerar). Denna runner är bara I/O + git-glue + felutskrift.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanText, skaScannas } from '../src/lib/diakritik-vakt.mjs';

const HÄR = dirname(fileURLToPath(import.meta.url));
const REPO_ROT = join(HÄR, '..');

// ANSI-färger för tydlig terminal-utskrift (faller tillbaka till tomt om
// strömmen inte är en TTY, så loggar/CI inte fylls med kontrolltecken). Kollar
// stderr, inte stdout: ALL utskrift här går via console.error (stderr), så det
// är stderr-strömmens TTY-status som avgör om färgkoderna faktiskt syns.
const färg = process.stderr.isTTY
  ? {
      röd: '\x1b[31m',
      gul: '\x1b[33m',
      grå: '\x1b[90m',
      fet: '\x1b[1m',
      noll: '\x1b[0m',
    }
  : { röd: '', gul: '', grå: '', fet: '', noll: '' };

/** Skriv ut ett blockerings-meddelande med träffar + hur man går vidare. */
function rapporteraOchBlockera(rubrik, träffarPerKälla) {
  console.error(`\n${färg.röd}${färg.fet}✗ Diakritik-vakten blockerade commit.${färg.noll}`);
  console.error(`${färg.grå}${rubrik}${färg.noll}\n`);

  for (const { källa, träffar } of träffarPerKälla) {
    console.error(`  ${färg.fet}${källa}${färg.noll}`);
    for (const t of träffar) {
      console.error(
        `    ${färg.gul}rad ${t.rad}${färg.noll}: "${t.ord}" ser ut som ett ASCII-substitut för ett svenskt ord med å/ä/ö`
      );
    }
  }

  console.error(
    `\n${färg.grå}Rätta orden till korrekt diakritik (å/ä/ö). Filerna är UTF-8.${färg.noll}`
  );
  console.error(
    `${färg.grå}Är det ett ÄKTA undantag (t.ex. ett medvetet exempel eller ett namn):${färg.noll}`
  );
  console.error(`${färg.grå}  - lägg "diakritik-vakt:exempel" på raden, eller${färg.noll}`);
  console.error(
    `${färg.grå}  - kör "git commit --no-verify" för att hoppa över vakten denna gång.${färg.noll}\n`
  );

  process.exit(1);
}

/** Läge 1: scanna commit-MEDDELANDET. Arg = sökväg till commit-msg-filen (git ger den). */
function körCommitMsg(meddelandeFil) {
  if (!meddelandeFil) {
    console.error('diakritik-vakt: commit-msg-läget kräver en sökväg till meddelande-filen.');
    process.exit(1);
  }
  const meddelande = readFileSync(meddelandeFil, 'utf8');
  const träffar = scanText(meddelande);
  if (träffar.length > 0) {
    rapporteraOchBlockera('Commit-meddelandet innehåller ASCII-substitut:', [
      { källa: 'commit-meddelande', träffar },
    ]);
  }
}

/** Läge 2: scanna STAGADE filer (de som är på väg in i committen). */
function körPreCommit() {
  // Bara stagade tillägg/ändringar (A=added, C=copied, M=modified, R=renamed),
  // inte raderingar (D) , en borttagen fil kan inte bära felaktig text.
  const ut = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: REPO_ROT,
    encoding: 'utf8',
  });
  const stagade = ut.split(/\r?\n/).filter(Boolean);

  const träffarPerKälla = [];
  for (const fil of stagade) {
    if (!skaScannas(fil)) {
      continue;
    }
    let innehåll;
    try {
      // Läs den STAGADE versionen (:fil) ur indexet, inte arbetskopian, så vakten
      // bedömer exakt det som committas även om arbetskopian hunnit ändras.
      innehåll = execFileSync('git', ['show', `:${fil}`], {
        cwd: REPO_ROT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch {
      // Kan inte läsa stagad version (t.ex. delvis stage) -> fall tillbaka till
      // arbetskopian så vi hellre scannar något än tyst hoppar över.
      innehåll = readFileSync(join(REPO_ROT, fil), 'utf8');
    }
    const träffar = scanText(innehåll);
    if (träffar.length > 0) {
      träffarPerKälla.push({ källa: fil, träffar });
    }
  }

  if (träffarPerKälla.length > 0) {
    rapporteraOchBlockera('Stagade filer innehåller ASCII-substitut:', träffarPerKälla);
  }
}

// --- Entry: första argumentet väljer läge ---
const läge = process.argv[2];
if (läge === 'commit-msg') {
  körCommitMsg(process.argv[3]);
} else if (läge === 'pre-commit') {
  körPreCommit();
} else {
  console.error(
    `diakritik-vakt: okänt läge "${läge}". Använd "commit-msg <fil>" eller "pre-commit".`
  );
  process.exit(1);
}
