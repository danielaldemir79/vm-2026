// @vitest-environment node
// Tester för diakritik-vakten. Testar EXAKT samma modul som git-hookarna
// importerar (src/lib/diakritik-vakt.mjs), inte en kopia, så grinden som bevisas
// grön här är den som faktiskt körs vid commit.
//
// Två risk-poler styr testerna:
//  1. Vakten MÅSTE fånga de kända ASCII-substituten (annars är den meningslös).
//  2. Vakten får ABSOLUT INTE ge falsklarm på engelsk kod eller korrekt svenska
//     (annars blir den värre friktion än problemet). Negativ-testerna är därför
//     minst lika viktiga som positiv-testerna, plus ett regressionstest mot
//     repots egna befintliga filer (de ska alla passera).
//
// Node-miljö (@vitest-environment node) + narrow ambient-typer: regressions-testet
// listar spårade filer (git) och läser dem (fs). vm-2026 drar MED FLIT INTE in hela
// @types/node (det läcker NodeJS.Timeout in i app-grafen och bryter browser-
// setTimeout-typningen, se build-env.d.ts), så de exakta Node-ytor testet rör
// deklareras smalt i diakritik-vakt.test-env.d.ts , samma teknik som build-env.d.ts.
// process.cwd() = repots rot under Vitest (bekräftat), så ingen __dirname-härledning
// behövs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
// Importerar .mjs-modulen direkt (samma fil hooken kör) -> EN sanning för logiken.
// Typerna deklareras smalt i test-env.d.ts (TS typkollar inte .mjs:ens JSDoc här
// utan @types/node, men hookens runner OCH detta test importerar samma fil).
import { scanText, skaScannas, EXEMPEL_MARKOR } from './diakritik-vakt.mjs';

const REPO_ROT = process.cwd();

describe('scanText - fångar kända ASCII-substitut (positiva fall)', () => {
  // Varje ord är ett substitut för korrekt svensk stavning som vakten ska stoppa.
  // Strängarna nedan är med flit ASCII (de ÄR substituten under test).
  const skaFångas = [
    'pa', // på
    'fran', // från
    'nar', // när
    'maste', // måste
    'nagot', // något
    'nagra', // några
    'nagon', // någon
    'battre', // bättre
    'lange', // länge
    'valjer', // väljer
    'forklara', // förklara
    'atgard', // åtgärd
    'skarmlasare', // skärmläsare
    'mojlig', // möjlig
    'tillganglig', // tillgänglig
    'anvandare', // användare
    'forvranger', // förvränger
  ];

  it.each(skaFångas)('blockerar %j (känt substitut)', (ord) => {
    const träffar = scanText(ord);
    expect(träffar.length).toBeGreaterThan(0);
    expect(träffar[0].ord.toLowerCase()).toBe(ord);
  });

  it("fångar dubbel-vokal-felet 'slutlaaget' (sett i tidigare commit-historik)", () => {
    const träffar = scanText('uppdatera till slutlaaget efter review');
    expect(träffar.map((t: { ord: string }) => t.ord)).toContain('slutlaaget');
  });

  it("är skiftlägesokänslig: fångar 'Pa' och 'PA' likaväl som 'pa'", () => {
    expect(scanText('Pa torsdag').length).toBeGreaterThan(0);
    expect(scanText('PA TORSDAG').length).toBeGreaterThan(0);
  });

  it('rapporterar rätt 1-baserat radnummer', () => {
    const text = 'rad ett ok\nrad tva har pa sig\nrad tre ok';
    const träffar = scanText(text);
    expect(träffar).toHaveLength(1);
    expect(träffar[0].rad).toBe(2);
  });

  it('fångar flera olika substitut i samma text', () => {
    const träffar = scanText('pa torsdag nar vi kom fran byn');
    const ord = träffar.map((t: { ord: string }) => t.ord.toLowerCase());
    expect(ord).toContain('pa');
    expect(ord).toContain('nar');
    expect(ord).toContain('fran');
  });

  it('fångar ett substitut omgivet av interpunktion (komma, parentes, punkt)', () => {
    // Akta prosa-substitut sitter ofta intill skiljetecken, inte bara mellanslag.
    expect(scanText('ja, pa torsdag.').length).toBeGreaterThan(0);
    expect(scanText('(nar vi kom)').length).toBeGreaterThan(0);
  });
});

describe('scanText - släpper igenom legitim text (negativa fall, HELA risken)', () => {
  // Engelska kod-/kommentar-ord som ALDRIG får ge falsklarm.
  const engelskaKodord = [
    'for', // for-loop, klassisk tvetydighet mot svenska "för"
    'format',
    'path',
    'patterns',
    'char',
    'are',
    'har',
    'man',
    'standard',
    'parameter',
    'nav',
    'data',
    'pages',
    'span',
    'class',
    'start',
    'language', // får INTE matcha på "lage" inuti ordet
  ];

  it.each(engelskaKodord)('släpper igenom engelskt kod-ord %j', (ord) => {
    expect(scanText(ord)).toHaveLength(0);
  });

  it('släpper igenom korrekt svenska med diakriter', () => {
    const korrekt = 'på torsdag kom många från byn och vi måste förklara åtgärden';
    expect(scanText(korrekt)).toHaveLength(0);
  });

  it('släpper igenom korrekta svenska ord vars ASCII-form är tvetydig (andra, andrum, laget)', () => {
    // "andra" = annan/nästa, "andrum" = paus, "laget" = sport-laget. Alla korrekt
    // svenska UTAN diakrit, därför medvetet UTANFÖR denylistan (låg falsk-positiv).
    expect(scanText('vi tar andra vägen')).toHaveLength(0);
    expect(scanText('ge oss lite andrum')).toHaveLength(0);
    expect(scanText('laget lägger sina tips')).toHaveLength(0);
  });

  it("släpper igenom 'manga' (legitimt lånord, serieteckning, inte substitut för 'många')", () => {
    // "manga" är ett internationellt lånord som kan stå i copy, därför medvetet
    // UTANFÖR denylistan (tvetydigt -> hellre släppa).
    expect(scanText('manga')).toHaveLength(0);
    expect(scanText('vi säljer manga och serietidningar')).toHaveLength(0);
  });

  it('matchar ordgränsat: substitut inuti ett större ord triggar inte', () => {
    // "pa" finns i "path"/"compare", "nar" i "scenario" - inget får matcha.
    expect(scanText('path compare scenario')).toHaveLength(0);
    // Diakrit-medveten gräns: 'pa' intill svensk bokstav (läsa, fråga) triggar ej.
    expect(scanText('vi ska läsa och fråga')).toHaveLength(0);
  });
});

describe('scanText - bindestreck-gräns: kebab-case-identifierare ger inte falsklarm (vm-2026-seam)', () => {
  // vm-2026:s docs och kod-kommentarer refererar pervasivt till kebab-case-
  // IDENTIFIERARE (lärdoms-id + mönster-namn) som bär svensk-LIKA segment ("pa",
  // "nar", "fran") mellan bindestreck. De är stabila kors-referens-nycklar, INTE
  // prosa. GRANS innehåller därför "-", så ett segment klämt mellan bindestreck
  // aldrig matchar. Detta var den enda källan till falsklarm när DR-webbs
  // denylista kördes mot vm-2026:s träd , den måste förbli vaktad.
  it("släpper igenom 'pa' klämt mellan bindestreck i ett slug", () => {
    expect(scanText('delad-rums-data-med-rls-pa-auth-uid')).toHaveLength(0);
    expect(scanText('aa-kontrast-pastad-pa-genererad-farg')).toHaveLength(0);
  });

  it("släpper igenom 'nar'/'fran' klämda i slug-identifierare", () => {
    expect(scanText('fejka-bara-Date-med-toFake-Date-nar-komponenten-seedar-async')).toHaveLength(
      0
    );
    expect(scanText('oeppnar-en-delad-modal-overlay-fran-var-som-helst')).toHaveLength(0);
  });

  it('fångar ändå ett ÄKTA prosa-substitut intill ett bindestrecks-ord', () => {
    // Bindestreck-gränsen får inte göra vakten blind för verklig prosa: här står
    // "pa" som fristående ord (omgivet av mellanslag), bara grann-ordet har streck.
    const träffar = scanText('stale rootMargin pa mobil-bandet');
    expect(träffar.map((t: { ord: string }) => t.ord.toLowerCase())).toContain('pa');
  });
});

describe('scanText - fel-vägar och edge-fall', () => {
  it('returnerar tom array för tom sträng', () => {
    expect(scanText('')).toEqual([]);
  });

  it('returnerar tom array för icke-sträng-input (defensivt)', () => {
    // Hooken matar in fil-/meddelande-innehåll; en trasig läsning kan ge undefined.
    expect(scanText(undefined as unknown as string)).toEqual([]);
    expect(scanText(null as unknown as string)).toEqual([]);
    expect(scanText(42 as unknown as string)).toEqual([]);
  });

  it('avduplicerar samma ord på samma rad (en träff, inte flera)', () => {
    const träffar = scanText('pa och pa igen pa rad ett');
    const påTräffar = träffar.filter((t: { ord: string }) => t.ord.toLowerCase() === 'pa');
    expect(påTräffar).toHaveLength(1);
  });

  it('hanterar både \\n och \\r\\n radslut (cross-platform)', () => {
    const crlf = scanText('ok rad\r\nrad med pa\r\nok igen');
    expect(crlf).toHaveLength(1);
    expect(crlf[0].rad).toBe(2);
  });
});

describe('scanText - inline-undantag för avsiktliga exempel', () => {
  it('hoppar över en rad som bär undantags-markören', () => {
    const utan = scanText('ASCII-substitut som pa ska blockeras');
    const med = scanText(`ASCII-substitut som pa ${EXEMPEL_MARKOR} citeras som exempel`);
    expect(utan.length).toBeGreaterThan(0);
    expect(med).toHaveLength(0);
  });
});

describe('skaScannas - filurval', () => {
  it.each([
    ['docs/SPEC.md', true],
    ['src/lib/safe-storage.ts', true],
    ['src/features/rooms/RoomSection.tsx', true],
    ['scripts/generate-icons.mjs', true],
    ['supabase/migrations/20260616120000_t85_push_subscriptions.sql', true],
    ['public/custom-push-sw.js', true],
  ])('scannar %s', (sökväg, förväntat) => {
    expect(skaScannas(sökväg)).toBe(förväntat);
  });

  it.each([
    ['package.json', false],
    ['public/logos/foo.svg', false],
    ['src/styles/theme.css', false],
    ['docs/screenshots/idag.png', false],
  ])('hoppar över %s (fel filtyp)', (sökväg, förväntat) => {
    expect(skaScannas(sökväg)).toBe(förväntat);
  });

  it('undantar vaktens egen modul OCH test (enda ställena med avsiktliga substitut)', () => {
    // Modulen måste nämna substituten i kommentarer, testet använder dem som data.
    expect(skaScannas('src/lib/diakritik-vakt.mjs')).toBe(false);
    expect(skaScannas('src/lib/diakritik-vakt.test.ts')).toBe(false);
    // Även med Windows-separator (backslash).
    expect(skaScannas('src\\lib\\diakritik-vakt.mjs')).toBe(false);
    expect(skaScannas('src\\lib\\diakritik-vakt.test.ts')).toBe(false);
  });

  it('normaliserar Windows-sökvägar (backslash) korrekt', () => {
    expect(skaScannas('src\\lib\\safe-storage.ts')).toBe(true);
  });
});

describe('regression: repots egna spårade filer ger noll falsklarm', () => {
  // Det starkaste falsk-positiv-skyddet: kör den FAKTISKA scannern över ALLA
  // spårade .md/.ts/.tsx/.mjs/.sql/.js i repot. Slår någon av dem larm är det
  // antingen (a) en äkta diakritik-bugg som ska rättas, eller (b) ett nytt
  // falsklarm som betyder att denylistan blev för bred. Båda ska faila testet, så
  // vi upptäcker det INNAN vakten börjar blockera commits på befintliga filer.
  it('alla spårade källfiler passerar vakten', () => {
    const filer = execSync('git ls-files "*.md" "*.ts" "*.tsx" "*.mjs" "*.sql" "*.js"', {
      cwd: REPO_ROT,
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);

    const falsklarm: string[] = [];
    for (const fil of filer) {
      if (!skaScannas(fil)) {
        continue;
      }
      const innehåll = readFileSync(join(REPO_ROT, fil), 'utf8');
      const träffar = scanText(innehåll);
      if (träffar.length > 0) {
        falsklarm.push(
          `${fil}: ${träffar.map((t: { ord: string; rad: number }) => `${t.ord}@${t.rad}`).join(', ')}`
        );
      }
    }

    expect(falsklarm).toEqual([]);
  });
});
