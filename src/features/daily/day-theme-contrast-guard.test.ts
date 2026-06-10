// KONTRAST-VAKT, KÄLL-SCAN (T8, issue #8, review F2).
//
// Dags-temats arkitektur-invariant: den dynamiska hue:n (`--vm-day-hue`) får BARA
// VÄVA IN i hero:ns DEKOR-ytor, aldrig i något läsbarhets-bärande element. Är den
// invarianten sann kan dagstonen per konstruktion inte sänka text-kontrasten under
// WCAG AA (acceptanskriterium 2, decisions.md T8).
//
// VARFÖR DEN HÄR VAKTEN BEHÖVS (vad den vilar på, F2): den befintliga DOM-vakten i
// DailyMatchesView.test.tsx läser bara matchkortens INLINE-style och bekräftar att
// inget kort SÄTTER `--vm-day-hue` själv. Men "Dagens match"-kortet renderas INNE i
// `.vm-daily-hero`-diven, som sätter `--vm-day-hue` inline, och CSS-custom-properties
// ÄRVS nedåt. Skulle någon framtida kort-CSS-regel LÄSA `var(--vm-day-hue)` skulle
// kortet tyst ärva dagstonen i en text-/yt-färg och DOM-vakten skulle ändå vara grön
// (kortet sätter inte variabeln, det ärver den). Den luckan stänger den här käll-
// scannen: den läser KÄLLFILERNA (inte DOM:en) och failar om `var(--vm-day-hue)`
// KONSUMERAS någon annanstans än i en `.vm-daily-hero*`-scopad CSS-regel.
//
// Vad scannen tillåter (de tre legitima rollerna för variabeln):
//  - DEKLARATION: `--vm-day-hue: <default>;` i `:root` (tokens.css), bas-graden.
//  - SÄTTNING: seamen (use-day-theme.ts) sätter den inline på hero-ytan via React-
//    style. Det är en SÄTTNING (`'--vm-day-hue': ...`), inte en `var()`-läsning.
//  - KONSUMTION: `var(--vm-day-hue)` får bara förekomma i CSS-regler vars selektor
//    börjar med `.vm-daily-hero` (hero-dekoren). Allt annat = brott mot vakten.
//
// KÄLLÄSNING: via Vites `import.meta.glob({ query: '?raw', eager: true })` (samma
// bundler-läge som resten av repot, inga Node-typer / `@types/node` behövs, inget
// nytt beroende, PRINCIPLES §11). Glob:en plockar källfilernas RÅA text vid
// transform-tid; testfiler matchas inte (de citerar variabeln legitimt).

import { describe, it, expect } from 'vitest';

/**
 * De enda CSS-klasser som får KONSUMERA dagstonen (hero-dekoren). Matchas som
 * HELA klass-token, inte som prefix: `.includes('.vm-daily-hero')` skulle annars
 * släppa igenom `.vm-daily-heroX` (falskt grönt, en helt annan klass som råkar
 * börja likadant). En klass-token tar slut vid det FÖRSTA tecknet som inte är
 * `[\w-]` (whitespace, `[`, `:`, `.`, `,`, `>` osv.), så en negativ lookahead på
 * `[\w-]` fångar gränsen. `.vm-daily-hero-sheen` listas separat eftersom den ska
 * accepteras som egen klass , den matchar INTE `.vm-daily-hero(?![\w-])` (efter
 * `hero` kommer `-`, som ÄR `[\w-]`). En `.vm-daily-heroX`-regel matchar ingen av
 * dem och avvisas korrekt. */
const ALLOWED_SELECTOR_PART = /\.vm-daily-hero(?![\w-])|\.vm-daily-hero-sheen(?![\w-])/;

/** Den variabel-konsumtion vi vaktar (en `var()`-läsning, inte en sättning). */
const CONSUMPTION = 'var(--vm-day-hue)';

// Alla CSS/TS/TSX-källfiler i de mappar där dags-temat lever (theme + daily),
// som rå text. `tokens.css` ligger under theme/. Testfiler exkluderas explicit.
const RAW_SOURCES = import.meta.glob('../../{theme,features/daily}/**/*.{css,ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** tokens.css-nyckeln i glob-mappen (den enda fil som FÅR konsumera variabeln). */
const TOKENS_CSS_KEY = Object.keys(RAW_SOURCES).find((p) => p.endsWith('theme/tokens.css'));

/** Ta bort alla CSS-blockkommentarer så `var()` inuti kommentarer inte räknas. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** True om filnyckeln är en testfil (de citerar variabeln legitimt). */
function isTestFile(key: string): boolean {
  return /\.test\.(ts|tsx)$/.test(key);
}

/**
 * True om en (ev. komma-separerad) selektor i HELA sin längd är scopad till
 * hero-dekoren: VARJE komma-del måste innehålla en tillåten hero-klass som hel
 * klass-token (ALLOWED_SELECTOR_PART). Tom selektor avvisas. Detta är den ENDA
 * platsen vakt-regeln bor, så huvudtestet och negativ-kontrollen inte kan glida
 * isär (en bekräftar samma predikat som den andra bryter mot).
 */
function selectorIsHeroScoped(selector: string): boolean {
  const parts = selector
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return false;
  return parts.every((part) => ALLOWED_SELECTOR_PART.test(part));
}

/**
 * Dela kommentar-strippad CSS i { selector, body }-regler. Enkel brace-räknare:
 * vi läser selektor-segmentet före varje `{` och parar det med den INNERSTA
 * kroppen (utan nästlat `{`), så även regler inuti `@media` fångas med sin egen
 * selektor. Räcker för detta token-lager (inga djupare nästlingar).
 */
function cssRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  const stack: string[] = [];
  let segmentStart = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      stack.push(css.slice(segmentStart, i).trim());
      segmentStart = i + 1;
    } else if (ch === '}') {
      const selector = stack.pop() ?? '';
      const body = css.slice(segmentStart, i);
      if (!body.includes('{')) {
        rules.push({ selector, body });
      }
      segmentStart = i + 1;
    }
  }
  return rules;
}

describe('dags-tema kontrast-vakt: var(--vm-day-hue) lever bara i hero-dekoren (F2)', () => {
  it('käll-scannen hittar faktiskt tokens.css (annars vaktar den tomma luften)', () => {
    // Förutsättning: glob:en plockade upp källfilerna. Skulle sökvägen glida
    // (mapp-flytt) vill vi FAILA, inte tyst passera med 0 filer att vakta.
    expect(Object.keys(RAW_SOURCES).length).toBeGreaterThan(0);
    expect(TOKENS_CSS_KEY).toBeDefined();
  });

  it('varje var(--vm-day-hue) i tokens.css står under en .vm-daily-hero-selektor', () => {
    const css = stripCssComments(RAW_SOURCES[TOKENS_CSS_KEY as string]);
    const consumers = cssRules(css).filter((r) => r.body.includes(CONSUMPTION));

    // Förutsättning: det FINNS konsumenter (annars vore vakten meningslös, t.ex.
    // om variabeln döptes om och scannen tyst inte hittar något att vakta).
    expect(consumers.length).toBeGreaterThan(0);

    for (const { selector } of consumers) {
      // Selektorn (ev. komma-separerad lista) måste i HELA sin längd vara scopad
      // till hero-dekoren (varje del en .vm-daily-hero*-klass-token, inte bara ett
      // prefix , se selectorIsHeroScoped/ALLOWED_SELECTOR_PART).
      expect(
        selectorIsHeroScoped(selector),
        `var(--vm-day-hue) konsumeras under en selektor utanför hero-dekoren: "${selector}". ` +
          `Dagstonen får bara väva in i .vm-daily-hero*-ytor (kontrast-vakt, decisions.md T8).`
      ).toBe(true);
    }
  });

  it('NEGATIV KONTROLL: en .vm-daily-heroX-regel som läser var(--vm-day-hue) FAILAR vakten', () => {
    // En klass som BARA börjar som hero-klassen (`.vm-daily-heroX`) är en HELT
    // annan klass och får inte konsumera dagstonen. Den gamla prefix-matchen
    // (`.includes('.vm-daily-hero')`) släppte den igenom (falskt grönt); klass-
    // token-matchen ska avvisa den. Vi syntetiserar en sådan regel och kör den
    // genom EXAKT samma scan-väg (cssRules + selectorIsHeroScoped) som vakten,
    // så testet bevisar att gränsdragningen faktiskt smäller.
    const maliciousCss = `.vm-daily-heroX { color: hsl(${CONSUMPTION} 70% 50%); }`;
    const consumers = cssRules(stripCssComments(maliciousCss)).filter((r) =>
      r.body.includes(CONSUMPTION)
    );
    expect(consumers.length).toBe(1); // regeln plockades upp som konsument
    expect(selectorIsHeroScoped(consumers[0].selector)).toBe(false);

    // Och de legitima hero-selektorerna passerar (positiv motpol, så vi inte bara
    // bevisar att allt avvisas). Inkluderar descendant- och attribut-formerna som
    // faktiskt finns i tokens.css.
    expect(selectorIsHeroScoped(".vm-daily-hero[data-day-theme='active']")).toBe(true);
    expect(
      selectorIsHeroScoped(".vm-daily-hero[data-day-theme='active'] .vm-daily-hero-sheen")
    ).toBe(true);
    expect(selectorIsHeroScoped('.vm-daily-hero-sheen')).toBe(true);
  });

  it('ingen ANNAN källfil konsumerar var(--vm-day-hue) (bara tokens.css får det)', () => {
    // Endast tokens.css (hero-dekoren) får LÄSA variabeln. Seamen SÄTTER den
    // ('--vm-day-hue': ...), vilket inte är en var()-läsning och alltså inte fångas.
    const offenders: string[] = [];
    for (const [key, source] of Object.entries(RAW_SOURCES)) {
      if (key === TOKENS_CSS_KEY || isTestFile(key)) continue;
      if (stripCssComments(source).includes(CONSUMPTION)) {
        offenders.push(key);
      }
    }
    expect(
      offenders,
      `var(--vm-day-hue) konsumeras utanför tokens.css i: ${offenders.join(', ')}. ` +
        `Bara hero-dekoren (tokens.css) får läsa dagstonen.`
    ).toEqual([]);
  });
});
