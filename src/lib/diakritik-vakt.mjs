// Diakritik-vakt: enda sanningen for scan-logiken.
//
// Roten till problemet: pa Windows forvranger PowerShell UTF-8 i commit-
// meddelanden (diakriterna strippas inline om man inte skriver via en fil), och
// manuella slarv smyger ibland in svensk text med ASCII-substitut (a/o for a/a/o,
// t.ex. "pa", "fran", "slutlaaget"). Repots konvention ar korrekta diakriter i all
// svensk text (kommentarer, strangar, docs, commit-meddelanden), men den regeln
// efterlevs inte utan en maskinell grind. Den grinden ar denna modul: bade git-
// hookarna (.githooks/) OCH Vitest-testet importerar HÄR, sa testet bevisar exakt
// det som korningen kor (ingen duplicerad regex).
//
// OBS om denna fil: dess egna kommentarer anvander OVERVAGANDE och medvetet ASCII.
// Anledning: en regel som forbjuder ASCII-substitut maste sjalv kunna namna och
// resonera om dessa substitut ("pa", "fran") som exempel-ord, sa tat att korrekt
// diakritik och ASCII-citat skulle bli rorigt om vartannat. Darfor halls denna
// modul (och bara den) overvagande i ASCII-svenska -- inte religiost 100% ren
// ASCII: enstaka diakriter kan sta kvar for betoning dar de inte krockar med ett
// citat. Vakten undantar sig sjalv + sitt test fran scan (se IGNORERADE_FILER
// nedan + docs/decisions.md) sa de inte blockerar sin egen commit. Skillnaden mot
// testet: dar ar PROSAN korrekt svensk (a/a/o) och bara test-DATAN ASCII. All
// ANNAN svensk text i repot ska ha a/a/o.
//
// Design (KISS): .mjs (inte .ts) sa runnern i git-hooken kan importera exakt
// samma fil utan ett TS->JS-kompileringssteg. En hook maste kora utan byggsteg,
// och "samma fil i hook och test" ar starkare an "samma logik i tva filer".

/**
 * Kurerad denylist: starkt indikativa SVENSKA ord skrivna utan diakrit.
 *
 * KRITISKT (hela risken med vakten): listan MÅSTE ha lag falsk-positiv. Den far
 * INTE sla pa legitim engelsk kod/kommentar ("for", "format", "path", "patterns",
 * "char", "are", "har") eller pa korrekt svenska. Darfor:
 *  - bara ord som pa svenska nastan alltid stavas med a/a/o,
 *  - och dar ASCII-formen sallan ar ett legitimt engelskt/kod-ord.
 *
 * Mangtydiga ord ar MEDVETET uteslutna (engelska "for"/"are"/"har"/"man"/"vara"/
 * "bra"/"hand"/"sang" m.fl. kolliderar med engelsk kod eller andra sprak; "manga"
 * ar dessutom ett internationellt lanord (serieteckning) som kan sta i copy), aven
 * om de pa svenska borde haft diakrit. Hellre slappa nagra an larma falskt: en
 * vakt som stoppar "for"-loopar vore varre friktion an problemet den loser.
 *
 * Varje monster ordgransas vid sammanfogning nedan (diakrit-medvetna lookarounds,
 * se byggRegex) sa det matchar hela ord, inte delstrangar ("path" triggar ej pa "pa").
 *
 * Dar en stam tar bojningar (genus/numerus/tempus) anvands `\p{L}*`-svans MEDVETET
 * och bara nar stammen ar entydigt svensk, sa varianter fangas (lardom: en
 * compliance-grind som matchar exakt ordform missar bojningsvarianter).
 *
 * Listan ar kurerad mot vm-2026:s FAKTISKA innehall (kord mot hela tradet,
 * 0 falska positiver). Fotbolls-/engelska termer, lagnamn och kod-identifierare
 * som kan krocka ar medvetet uteslutna (se inline-OBS dar det galler).
 */
const DENYLISTA = [
  // --- Hog-frekventa funktionsord (vanligaste felkallan i commits/docs) ---
  // Korta funktionsord (pa/fran/nar/sa...) ar de allra vanligaste i commits, men
  // ocksa de mest falsk-positiv-kansliga. De ingar BARA dar ASCII-formen i princip
  // aldrig ar ett legitimt engelskt/kod-ord. "sa" och "ga" UTESLOTS medvetet: de
  // ar for korta/generella och kolliderar (engelska "sa", kod-identifierare), aven
  // om de pa svenska borde haft diakrit.
  'pa', // pa  (engelska "pa" finns ej som vanligt kod-ord)
  'fran', // fran
  'nar', // nar
  'maste', // maste

  // --- Pronomen / kvantifierare (starkt indikativa, lag kollision) ---
  // OBS utesluten: "manga" -- ar ocksa ett legitimt internationellt lanord
  // (japansk serieteckning) som kan dyka upp i copy, tvetydigt -> hellre slappa
  // (samma princip som "sa"/"ga"/"andra" ovan). Stammen nag* nedan ar daremot
  // entydigt svensk.
  'nagot', // nagot
  'nagra', // nagra
  'nagon', // nagon
  'nagonting', // nagonting

  // --- Adjektiv / adverb som nastan alltid bar diakrit pa svenska ---
  'battre', // battre
  'lange', // lange

  // --- Verb / verb-stammar (entydigt svenska) ---
  // OBS uteslutna: "andr*" (andra/andring) -- "andra" = annan/nasta ar korrekt
  // svenska (inte substitut for "andra"), tvetydigt -> for hog falsk-positiv.
  // Hellre slappa.
  'valjer', // valjer
  'forklar\\p{L}*', // forklara, forklarar, forklaring, forklaras
  'forvrang\\p{L}*', // forvranger, forvrangd (encoding-rotens eget ord)

  // --- Substantiv-stammar (bojas, darfor unicode-bokstavssvans) ---
  'atgard\\p{L}*', // atgard, atgarder, atgarda...
  'skarmlasar\\p{L}*', // skarmlasare, skarmlasar-...
  'lasbar\\p{L}*', // lasbar, lasbarhet
  'mojlig\\p{L}*', // mojlig, mojligt, mojlighet, mojliggor...
  'tillganglig\\p{L}*', // tillganglig, tillganglighet
  'sakerhet\\p{L}*', // sakerhet, sakerhets-
  'anvand\\p{L}*', // anvanda, anvandare, anvands, anvandning
  'omdop\\p{L}*', // omdop, omdopt, omdopning
  'atkomst\\p{L}*', // atkomst, atkomlig

  // --- Uppenbara dubbel-vokal-fel (ASCII-substitut dar nan dubblade vokalen
  //     i stallet for att skriva a/a/o). Dessa ar ALDRIG legitima ord, sa de
  //     ar sakra aven som korta monster. \p{L}* fangar sammansattningar
  //     (slutlaaget, dellaaget) utan att lista varje forled. ---
  '\\p{L}*laaget', // laaget, slutlaaget, dellaaget -> ...laget
  '\\p{L}*laage', // laage -> lage
  'maaste', // maaste -> maste
  'fraan', // fraan -> fran
];

// Ordgrans-tecken: en "bokstav" i ordgrans-mening ar valfri unicode-bokstav
// ELLER siffra/understreck/BINDESTRECK. KRITISKT att \p{L} anvands i stallet for \b:
// JavaScripts \b bygger pa \w = [A-Za-z0-9_], sa de svenska bokstaverna a/a/o
// raknas som ORDGRANS av \b. Det gjorde att "\bsa\b" traffade mitt i "lasa"
// (gransen mellan 'a' och 's') och "\bga\b" mitt i "fraga" -> massor av
// falsklarm pa korrekt svenska. Med \p{L} (kraver u-flaggan) raknas a/a/o som
// bokstaver, sa ett denylist-ord matchar bara nar det INTE sitter ihop med en
// annan bokstav/siffra. Bevisat empiriskt mot repots filer.
//
// BINDESTRECK (-) ingar i GRANS MED FLIT: vm-2026:s docs och kod-kommentarer
// refererar pervasivt till kebab-case-IDENTIFIERARE (lardoms-id och monster-
// namn, t.ex. "delad-rums-data-med-rls-pa-auth-uid", "aa-kontrast-pastad-pa-
// genererad-farg", "...-nar-komponenten-seedar-async"). Dessa ar stabila kors-
// referens-nycklar, INTE svensk prosa, men de bar svensk-LIKA segment ("pa",
// "nar") mellan bindestreck. Genom att rakna "-" som grans-tecken matchar ett
// denylist-ord aldrig nar det sitter klamt mellan bindestreck (`-pa-`), bara nar
// det star som ett fristaende ord (omgivet av mellanslag/skiljetecken). Akta
// prosa-substitut ("stale rootMargin pa mobil-bandet") fangas anda, eftersom
// ordet dar omges av mellanslag. Bevisat mot hela vm-2026-tradet (0 falska
// positiver pa slug-identifierare).
const GRANS = '[\\p{L}\\p{N}_-]';

/**
 * Bygg EN regex ur denylistan med diakrit-medvetna ordgranser.
 *
 * Lookbehind `(?<!GRANS)` + lookahead `(?!GRANS)` ringar in ett helt ord utan
 * att konsumera grans-tecknen, sa intilliggande traffar inte ater pa varandra.
 * Flaggor: g (alla forekomster), i (Pa/PA ocksa), u (Unicode, kravs av \p{L}).
 *
 * Lag falsk-positiv: "path" -> ingen traff ("pa" foljs av 't', en bokstav),
 * "pa natet" -> traff ("pa" omgivet av mellanslag).
 */
function byggRegex() {
  const monster = DENYLISTA.filter(Boolean);
  return new RegExp(`(?<!${GRANS})(?:${monster.join('|')})(?!${GRANS})`, 'giu');
}

const REGEX = byggRegex();

/**
 * Filer som vakten UNDANTAR fran scan: vaktens egen modul OCH dess test. De ar de
 * enda stallena i repot dar ASCII-substitut ar avsiktliga -- modulen maste namna
 * dem i sina kommentarer ("pa", "fran"), och testet anvander dem som test-DATA
 * (positiva fall). Utan undantaget skulle vakten blockera commit av sin egen
 * implementation. Matchas pa sokvags-slut sa det funkar oavsett separator (/ vs \).
 *
 * OBS: undantaget galler bara att INTE blockera commit. Svensk PROSA i dessa filer
 * (kommentarer, test-namn) skrivs anda med korrekta a/a/o -- bara de literala
 * substitut-orden (denylist-data + citat) ar ASCII, med flit.
 */
const IGNORERADE_FILER = ['src/lib/diakritik-vakt.mjs', 'src/lib/diakritik-vakt.test.ts'];

/**
 * Ska en fil scannas? Bara de typer dar svensk prosa/text bor i vm-2026
 * (md/ts/tsx/mjs/sql/js), och inte den sjalv-undantagna vakt-modulen.
 *
 * .sql ar med MED FLIT: migrationerna i supabase/migrations/ har svenska
 * kommentarer OCH `comment on`-strangar som persisteras live i DB:n, en kand
 * fälla dar ASCII-substitut har fastnat. .tsx for React-komponenternas svenska
 * UI-text. .js for service-worker-/config-filer med svensk prosa.
 * @param {string} sokvag - relativ eller absolut sokvag.
 * @returns {boolean}
 */
export function skaScannas(sokvag) {
  const normaliserad = sokvag.replaceAll('\\', '/');
  if (IGNORERADE_FILER.some((ignorerad) => normaliserad.endsWith(ignorerad))) {
    return false;
  }
  return /\.(md|ts|tsx|mjs|sql|js)$/i.test(normaliserad);
}

/**
 * En traff: vilket ord och var (1-baserat radnummer for begripligt felmeddelande).
 * @typedef {{ ord: string, rad: number }} Traff
 */

/**
 * Inline-undantag (ventil for AVSIKTLIga exempel). En rad som innehaller denna
 * markor hoppas over. Behovs dar text MÅSTE namna ett substitut for att lara ut
 * om sjalva regeln (t.ex. en docs-rad: 'ASCII-substitut ("fran") ska inte
 * anvandas'). Utan ventilen skulle vaktens egen dokumentation blockera varje
 * framtida edit av den filen, vilket vore varre friktion an problemet. Markoren
 * ar synlig + sparbar (till skillnad fran ett tyst --no-verify), sa en lasare ser
 * VARFOR raden undantas. Spegelt ESLint-disable: en grind maste kunna undantas
 * lokalt och medvetet.
 */
const UNDANTAGS_MARKOR = 'diakritik-vakt:exempel';

/**
 * Scanna en text efter ASCII-substitut ur denylistan.
 *
 * Returnerar EN traff per unik (ord, rad)-kombination sa felutskriften blir
 * laslig (ingen dubbelrapportering av samma ord pa samma rad). Rader med
 * UNDANTAGS_MARKOR hoppas over (avsiktliga exempel).
 *
 * @param {string} text - texten att scanna (commit-meddelande eller fil-innehall).
 * @returns {Traff[]} traffar (tom array = rent).
 */
export function scanText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const traffar = [];
  const sedda = new Set();
  const rader = text.split(/\r?\n/);

  rader.forEach((radtext, index) => {
    // Avsiktligt exempel pa denna rad? Hoppa over (se UNDANTAGS_MARKOR).
    if (radtext.includes(UNDANTAGS_MARKOR)) {
      return;
    }
    // En frisk regex-instans (lastIndex nollstalld) per rad: en delad /g-regex
    // bar med sig lastIndex mellan anrop och skulle hoppa over traffar.
    const radRegex = new RegExp(REGEX.source, REGEX.flags);
    let m;
    while ((m = radRegex.exec(radtext)) !== null) {
      const ord = m[0];
      const radnummer = index + 1;
      const nyckel = `${radnummer}:${ord.toLowerCase()}`;
      if (!sedda.has(nyckel)) {
        sedda.add(nyckel);
        traffar.push({ ord, rad: radnummer });
      }
      // Skydd mot oandlig loop pa en nollbredd-match (ska ej kunna handa har).
      if (m.index === radRegex.lastIndex) {
        radRegex.lastIndex++;
      }
    }
  });

  return traffar;
}

/** Exporterad for test/introspektion: den kompilerade denylist-regexen. */
export const DENYLIST_REGEX = REGEX;

/** Exporterad for test + docs: inline-markoren som undantar en rad (avsiktligt exempel). */
export const EXEMPEL_MARKOR = UNDANTAGS_MARKOR;
