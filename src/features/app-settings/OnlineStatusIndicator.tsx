// Online/offline-indikator (PRESENTATION, T13 + synk-status T14): visar nät-läget.
//
// DESIGNVAL: i ONLINE-läge är indikatorn medvetet DISKRET (en liten, lugn prick +
// "Online"), den ska inte skrika när allt är normalt. I OFFLINE-läge blir den
// tydligare (varnings-ton + en ärlig förklaring). role="status" + aria-live="polite"
// så en skärmläsare hör när läget växlar, utan att flytta fokus.
//
// SYNK-STATUS (T14): innan T14 var "synk" en lögn (appen var ren fixtures, ingen
// server-data fanns). NU finns delad rums-data i Supabase som faktiskt hämtas om
// vid återuppkoppling (RoomsProvider lyssnar på online-event). Indikatorn kan
// därför ÄRLIGT spegla synk-läget NÄR ett live-rum är aktivt (`live`-proppen):
//   - online + live  -> "Online, synkad" (delad data är aktuell)
//   - offline + live -> "Offline, ändringarna synkas när du är online igen"
// Utan ett aktivt rum (live=false, t.ex. lokalt läge eller inget valt rum) faller
// vi tillbaka på T13:s ärliga "appen fungerar ändå", eftersom det då inte finns
// någon delad data att synka, vi lovar aldrig en mekanik som inte gäller.

import { useOnlineStatus } from './use-online-status';

export interface OnlineStatusIndicatorProps {
  /**
   * Är ett live-rum aktivt (det finns delad server-data att synka)? När true
   * speglar indikatorn synk-läget ärligt; när false (lokalt/inget rum) visas
   * T13:s "fungerar ändå"-besked. Default false (bakåtkompatibelt).
   */
  live?: boolean;
}

export function OnlineStatusIndicator({ live = false }: OnlineStatusIndicatorProps) {
  const online = useOnlineStatus();

  // Texten beror på BÅDE nät-läget och om det finns delad data att synka.
  const label = online
    ? live
      ? 'Online, synkad'
      : 'Online'
    : live
      ? 'Offline, ändringarna synkas när du är online igen'
      : 'Offline, appen fungerar ändå';

  return (
    <div
      role="status"
      aria-live="polite"
      data-online-status={online ? 'online' : 'offline'}
      data-sync-live={live ? 'true' : 'false'}
      className="inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs font-medium"
      style={
        online
          ? {
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-fg-muted)',
            }
          : {
              borderColor: 'color-mix(in srgb, var(--vm-gold) 55%, var(--color-border))',
              backgroundColor: 'color-mix(in srgb, var(--vm-gold) 12%, var(--color-surface))',
              color: 'var(--color-fg)',
            }
      }
    >
      {/* Status-pricken: grön (online) / guld (offline). Färgen är FÖRSTÄRKNING,
          texten bär betydelsen (färg-oberoende, samma princip som sim-badgen). */}
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-pill"
        style={{ backgroundColor: online ? 'var(--color-accent)' : 'var(--vm-gold)' }}
      />
      <span>{label}</span>
    </div>
  );
}
