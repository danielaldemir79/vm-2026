// Dela-rum-hjälpare (REN text-byggare + tunna webb-API-omslag), T14 visuellt lager.
//
// ANSVAR (presentation, INGEN datalogik): bygga den INBJUDANDE text/länk man
// skickar till kompisarna, och slå mot webbläsarens dela-/urklipps-API:er. Rör
// ALDRIG rums-storen eller Supabase, det här är bara "skicka koden till en vän".
//
// SCOPE-NOT (KISS + YAGNI): vi lägger INTE till auto-join-routing (en `?rum=`-länk
// som loggar in mottagaren direkt). Det är en data-/routing-ändring (senior-devs
// lager), utanför detta visuella pass. Länken pekar på appen + koden står i texten,
// så mottagaren öppnar appen och klistrar in koden i "Gå med via kod". Affordansen
// är ärlig: vi lovar bara det flödet som faktiskt finns.

/** Var appen bor, för dela-texten. Tom/SSR -> faller till en tom bas (bara koden). */
function appUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  // origin + pathname (utan ev. query/hash) = en ren länk till appen.
  return window.location.origin + window.location.pathname;
}

/**
 * Den vänliga inbjudnings-texten (för Web Share API + urklipps-fallback). Bär
 * rummets namn + koden tydligt, och länken till appen om vi har en. Koden är det
 * som mottagaren matar in i "Gå med via kod".
 */
export function buildInviteText(roomName: string, code: string): string {
  const url = appUrl();
  const lines = [`Häng med i "${roomName}" på VM 2026-tipset!`, `Rumskod: ${code}`];
  if (url) {
    lines.push(`Öppna appen: ${url}`);
  }
  return lines.join('\n');
}

/**
 * Skriv en text till urklipp. Returnerar true vid lyckat, false annars (inget
 * Clipboard-API, eller nekad behörighet). VARFÖR boolean och inte kast: anroparen
 * (kopiera-knappen) vill bara veta om den ska visa "Kopierad!" eller en mjuk
 * fallback, inte hantera ett undantag, ett misslyckat urklipp är inget app-fel.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Nekad behörighet / osäker kontext: faller till false (anroparen visar då
    // den manuella fallbacken "markera koden själv").
  }
  return false;
}

/**
 * Försök dela via webbläsarens Web Share API (mobilens systemdelnings-ark:
 * SMS, WhatsApp, ...). Returnerar 'shared' vid lyckat, 'unsupported' om API:t
 * saknas (desktop-Chrome m.fl.), och 'failed' om användaren avbröt eller annat
 * fel uppstod. Anroparen faller då tillbaka på att kopiera inbjudnings-texten.
 */
export async function shareInvite(
  roomName: string,
  text: string
): Promise<'shared' | 'unsupported' | 'failed'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }
  try {
    await navigator.share({ title: `VM 2026: ${roomName}`, text });
    return 'shared';
  } catch {
    // AbortError (användaren stängde arket) ELLER ett genuint fel: båda faller
    // till 'failed', anroparen erbjuder då kopiering i stället.
    return 'failed';
  }
}
