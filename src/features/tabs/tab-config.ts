// Flik-katalogen (T83, #175) , EN sanning för appens fem flikar.
//
// Ersätter sektions-navet (T78/T79): i stället för EN lång sida med en sticky
// chip-rad delas appen i fem fokuserade flikar (Idag/Tips/Topplista/Turnering/
// Mer), med en flik-rad längst ner på mobil (sport-app-mönster) och en top-/sido-
// nav på större skärm. Katalogen säger HUR varje flik visas (id, etikett, ordning,
// URL-slug); VAD den innehåller bestäms av App.tsx (vilka vyer som monteras i
// fliken). En sanning per flik betyder att flik-raden, routningen (URL-slug) och
// tabpanelernas a11y-koppling aldrig kan drifta isär.
//
// VARFÖR en katalog (inte spridda strängar): flik-raden, useTabRouting (URL <->
// aktiv flik) och App.tsx (vilken panel som renderas) läser ALLA samma lista, så
// en ny/ändrad flik ändras på ETT ställe. Samma "en sanning"-mönster som SECTIONS
// bar för chip-navet, men för den nya flik-IA:n.

/** En fliks stabila identitet: intern id, synlig etikett, URL-slug, ordning, ikon-namn. */
export interface TabDescriptor {
  /** Intern, stabil nyckel (data-attribut, aria-controls-bas, test-krok). */
  readonly id: TabId;
  /** Kort svensk etikett i flik-raden (håller raden smal på mobil). */
  readonly label: string;
  /**
   * URL-slug i hashen (`#/idag`). Stabil + delbar; en djuplänk till en flik
   * fungerar vid kall-laddning. Hålls ASCII-ren (ä/ö i etiketten, inte i sluggen)
   * så länken är lätt att säga/skriva av, samma anda som den synliga app-adressen.
   */
  readonly slug: string;
  /** Stabil ordning i flik-raden (vänster->höger på desktop, vänster->höger nere på mobil). */
  readonly order: number;
}

/** De fem flik-id:na (typad union, så App.tsx + routningen aldrig stavar fel). */
export type TabId = 'idag' | 'tips' | 'topplista' | 'turnering' | 'mer';

/**
 * Katalogen, EN post per flik, i flik-rads-ordning. Ordningen är medvetet den
 * Daniel angav (Idag/Tips/Topplista/Turnering/Mer): Idag är hemmet (default), och
 * "Mer" sist som en lugn samlingsplats för hjälp-/arrangörsytor.
 */
export const TABS = [
  { id: 'idag', label: 'Idag', slug: 'idag', order: 10 },
  { id: 'tips', label: 'Tips', slug: 'tips', order: 20 },
  { id: 'topplista', label: 'Topplista', slug: 'topplista', order: 30 },
  { id: 'turnering', label: 'Turnering', slug: 'turnering', order: 40 },
  { id: 'mer', label: 'Mer', slug: 'mer', order: 50 },
] as const satisfies readonly TabDescriptor[];

/** Default-fliken vid kall-laddning utan en giltig hash (hemmet). */
export const DEFAULT_TAB: TabId = 'idag';

/** Slå upp en flik på dess id (fail-safe: en okänd id ger undefined, anroparen faller till default). */
export function tabById(id: string): TabDescriptor | undefined {
  return TABS.find((tab) => tab.id === id);
}

/** Slå upp en flik på dess URL-slug (för hash -> aktiv flik). */
export function tabBySlug(slug: string): TabDescriptor | undefined {
  return TABS.find((tab) => tab.slug === slug);
}

/**
 * Id för en flik-KNAPP (aria-labelledby-mål från tabpanelen). Bor här (en ren modul)
 * och inte i TabBar.tsx, så TabBar.tsx bara exporterar komponenter (react-refresh hålls
 * ren, samma konvention som results-context.ts).
 */
export function tabButtonId(tabId: TabId): string {
  return `vm-tab-${tabId}`;
}

/** Id för en flik-PANEL (aria-controls-mål från fliken; aria-labelledby-koppling). */
export function tabPanelId(panelIdBase: string, tabId: TabId): string {
  return `${panelIdBase}-${tabId}`;
}
