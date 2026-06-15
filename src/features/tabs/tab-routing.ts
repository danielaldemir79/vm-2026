// Ren routnings-logik för flik-IA:n (T83, #175): hash <-> aktiv flik.
//
// VARFÖR ingen router-dependency (YAGNI, PRINCIPLES §11, motiverat i decisions.md):
// appen har EN navigerings-axel (vilken av fem flikar), inga nästlade rutter, inga
// route-parametrar, ingen kod-splitting per rutt (alla paneler är ändå monterade
// för att bevara state). En hash + history.pushState räcker exakt för kraven
// (bakåt-knapp, delbar länk, djuplänk vid kall-laddning), så ett router-paket vore
// vikt vi inte behöver bära. Hash (`#/idag`) framför path (`/idag`) eftersom appen
// är en statiskt hostad SPA (Cloudflare Pages, vm-2026.pages.dev) utan en server-
// rewrite , en path-rutt skulle ge 404 vid direkt-laddning av `/tips`, medan en
// hash alltid serveras av index.html. Samma skäl som de flesta GitHub-Pages-/Pages-
// hostade SPA:er väljer hash-routning.
//
// Denna fil är REN (ingen window-access, inga React-hooks), så hash<->flik-
// mappningen kan enhetstestas fristående. window/history-IO bor i use-tab-routing.ts.

import { DEFAULT_TAB, tabBySlug, tabById, type TabId } from './tab-config';

/** Hash-prefixet för flik-rutter (`#/idag`). Samlat så det inte stavas fel på flera ställen. */
const HASH_PREFIX = '#/';

/**
 * Tolka en location.hash till en flik-id. Okänd/tom/ogiltig hash -> DEFAULT_TAB
 * (fail-safe: en trasig eller gammal länk landar på hemmet, aldrig en tom vy).
 *
 * Toleranta former: `#/idag`, `#idag`, `idag` (med eller utan prefix/slash), så en
 * handskriven länk inte måste träffa exakt formatet.
 */
export function tabFromHash(hash: string): TabId {
  const raw = hash.replace(/^#\/?/, '').trim();
  if (raw === '') {
    return DEFAULT_TAB;
  }
  const bySlug = tabBySlug(raw);
  if (bySlug) {
    return bySlug.id;
  }
  // En länk kan bära id:t direkt (om en framtida flik får slug != id). Fail-safe.
  const byId = tabById(raw);
  return byId ? byId.id : DEFAULT_TAB;
}

/** Bygg hashen för en flik (`#/idag`). Den kanoniska, delbara formen. */
export function hashForTab(id: TabId): string {
  const tab = tabById(id);
  // tabById är total över TabId (typad union), men fail-safe till default-sluggen.
  return `${HASH_PREFIX}${tab ? tab.slug : DEFAULT_TAB}`;
}
