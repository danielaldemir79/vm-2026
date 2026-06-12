// E2E A11y-audit med axe-core (T25, #25, WCAG AA).
//
// Kör axe på HUVUDVYN i BÅDA teman (ljust + mörkt) i fixtures-läge. Vi mäter mot
// WCAG 2.0/2.1 A + AA (de tag-grupperna), det är appens uttalade nivå.
//
// MEDVETNA AVVISNINGAR (dokumenteras per regel-id med motivering nedan, inte tyst
// avstängda): axe kan ge FALSKA positiver på color-contrast när ytan målas med
// `color-mix(...)`/halvtransparenta token-lager, axe ser då inte den FAKTISKA
// komposit-färgen utan gissar mot en transparent bakgrund. Appens kontrast är redan
// AA-MÄTT med riktig canvas-komposit i scripts/contrast-*.mjs (källskannat av
// dedikerade *-aa-guard-tester per vy). Att låta axe "rätta" de redan-mätta värdena
// vore att jaga ett spöke. Vi avvisar därför 'color-contrast' EXPLICIT (med denna
// motivering) och låter axe vakta ALLA ANDRA regler skarpt, så en ÄKTA a11y-skuld
// (saknad etikett, fel roll, trasig fokus-ordning, dubbla id) failar rött.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers';

// WCAG-nivån vi auditerar mot. 2.2 är inte med (axe-core 4.11 taggar 2.2-reglerna
// separat och appens uttalade mål är 2.1 AA), men A + AA för 2.0 + 2.1 täcker
// fokus, namn/roll/värde, kontrast-regeln (avvisad nedan), reduced-motion m.m.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// REGLER VI MEDVETET AVVISAR (med motivering, spårbart per id):
//   - 'color-contrast': axe läser inte color-mix()-komposit korrekt och ger falska
//     positiver mot halvtransparenta token-lager. Appens kontrast är AA-mätt separat
//     med canvas-komposit (scripts/contrast-*.mjs + *-aa-guard-tester). Se decisions.md
//     (T25) för full motivering.
const DELIBERATELY_DISABLED_RULES = ['color-contrast'];

for (const theme of ['dark', 'light'] as const) {
  test(`a11y: huvudvyn har inga WCAG AA-violations (${theme})`, async ({ page }) => {
    await openApp(page, { theme });

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .disableRules(DELIBERATELY_DISABLED_RULES)
      .analyze();

    // Ärlig diagnostik om något failar: lista regel-id:n + hur många noder, så ett
    // rött test pekar direkt på regeln i stället för en ogenomtränglig dump.
    const summary = results.violations.map((v) => `${v.id} (${v.nodes.length} noder): ${v.help}`);
    expect(summary, summary.join('\n')).toEqual([]);
  });
}
