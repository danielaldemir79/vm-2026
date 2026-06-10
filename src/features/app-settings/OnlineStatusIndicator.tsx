// Online/offline-indikator (PRESENTATION, T13): visar användaren om appen har nät.
//
// DESIGNVAL: i ONLINE-läge är indikatorn medvetet DISKRET (en liten, lugn prick +
// "Online"), den ska inte skrika när allt är normalt. I OFFLINE-läge blir den
// tydligare (varnings-ton + en ärlig förklaring att appen funkar ändå, eftersom
// datan ligger lokalt). role="status" + aria-live="polite" så en skärmläsare hör
// när läget växlar, utan att flytta fokus.
//
// ÄRLIGHET (T13): texten lovar ingen synk-mekanik som inte finns. Appen är
// fixtures-driven, så den fungerar offline; "synk" blir relevant först med T14.

import { useOnlineStatus } from './use-online-status';

export function OnlineStatusIndicator() {
  const online = useOnlineStatus();

  return (
    <div
      role="status"
      aria-live="polite"
      data-online-status={online ? 'online' : 'offline'}
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
      {online ? <span>Online</span> : <span>Offline, appen fungerar ändå</span>}
    </div>
  );
}
