// Web app manifest för VM 2026, som ett TYPAT, REN datavärde i stället för ett
// inline-objekt i vite.config.ts. Skälet: manifestet är GISSNINGSKÄNSLIG data
// (det styr om Chrome lyckas MINTA en riktig WebAPK vid Android-installation,
// se T30/#50 och decisions.md). Genom att lägga det i en egen modul kan en
// källankrad test (app-manifest.test.ts) verifiera mintnings-kraven direkt mot
// källan, utan att bygga och läsa dist/manifest.webmanifest.
//
// vite-plugin-pwa accepterar exakt ett W3C-manifest-objekt här; vi typar bara
// de fält vi faktiskt sätter (en smal, intention-avslöjande typ) i stället för
// att dra in pluginets fulla Manifest-typ.

/** Ett ikon-objekt i manifestet (W3C App Manifest `icons`-medlemmen). */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  /**
   * `purpose` utelämnas för en vanlig ("any") ikon och sätts till 'maskable'
   * för den adaptiva Android-ikonen. Den KOMBINERADE 'any maskable' undviks
   * medvetet, se app-manifest.test.ts + decisions.md (T30).
   */
  purpose?: 'maskable';
}

/** De manifest-fält VM 2026 sätter (delmängd av W3C App Manifest). */
export interface AppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  theme_color: string;
  background_color: string;
  display: 'standalone';
  start_url: string;
  scope: string;
  icons: ManifestIcon[];
}

/**
 * VM 2026:s manifest.
 *
 * WebAPK-MINTNINGSKRAV (källhänvisade, T30/#50): När en användare installerar
 * PWA:n i Chrome på Android skickas manifestet till en WebAPK-mintningsserver
 * som paketerar en riktig Android-app. Misslyckas mintningen (eller saknas ett
 * krav) faller Chrome tillbaka på en LEGACY genvägs-APK, som Play Protect
 * flaggar hårdare. För att maximera chansen till en riktig WebAPK uppfyller
 * manifestet web.dev:s installerbarhets- och WebAPK-krav:
 *   - `id`: stabil app-identitet, frikopplad från `start_url`, så en framtida
 *     ändring av start_url inte räknas som en NY app (rekommenderad av web.dev
 *     "Add a web app manifest"). Vi sätter den explicit till '/' (samma som
 *     start_url/scope idag) i stället för att låta den DEFAULTA till start_url,
 *     så identiteten är låst och spårbar.
 *   - minst en 192x192- OCH en 512x512-ikon (Chromium-kravet för installerbarhet).
 *   - en SEPARAT `maskable`-ikon (purpose: 'maskable'), SKILD från "any"-ikonerna.
 *     Den kombinerade `purpose: 'any maskable'` undviks: en maskable-ikon har
 *     säkerhetszon-padding och ser fel ut (för inzoomad) när den även används
 *     som "any"-ikon. Källor i decisions.md (T30).
 *
 * VIKTIGT (ärlighet, T30): Play Protect-varningen "byggd för en äldre version av
 * Android ... inte det senaste integritetsskyddet" styrs av WebAPK:ns
 * targetSdkVersion, som sätts av webbläsarens mintningsserver (Chrome/Google
 * eller Samsung Internet), INTE av detta manifest. Den delen ligger utanför vår
 * kontroll, se decisions.md (T30) och install-flödets info-rad.
 */
export const VM_2026_MANIFEST: AppManifest = {
  // Stabil app-identitet (se WebAPK-mintningskrav ovan). Lika med start_url/scope
  // idag, men explicit satt så den inte tyst följer med en framtida start_url-ändring.
  id: '/',
  name: 'VM 2026',
  short_name: 'VM 2026',
  description: 'Följ fotbolls-VM 2026 tillsammans: matcher, tabeller, slutspelsträd och tips.',
  lang: 'sv',
  theme_color: '#091310',
  background_color: '#091310',
  display: 'standalone',
  start_url: '/',
  scope: '/',
  icons: [
    {
      src: 'pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: 'pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
