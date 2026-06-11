// Admin-sektionen (T42, #72): arrangörens facit-yta.
//
// GATAD på live-läge (rooms.enabled, samma som de andra live-sektionerna): i
// fixtures-läge renderar den inget. I live-läge:
//   - ADMIN (Daniel): admin-facit-inmatningen (AdminResultEntry).
//   - ICKE-ADMIN (vanlig deltagare): BARA en lugn READ-ONLY-not ("resultaten matas
//     in av arrangören"). Ingen synlig inloggning, se den dolda ingången nedan.
//
// Admin-STATUS bor i OfficialResultsProvider (en sanning för "är jag admin?",
// samma helper RLS använder). Premium-design lämnas till T42b.

import type { ReactNode } from 'react';
import { useRoomsStore } from '../rooms';
import { useOfficialResultsStore } from '../official-results';
import { AdminLogin } from './AdminLogin';
import { AdminResultEntry } from './AdminResultEntry';
import { useOrganizerEntry } from './use-organizer-entry';

export function AdminSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const rooms = useRoomsStore();
  const official = useOfficialResultsStore();
  // Hemlig URL-fragment-ingång (`#arrangor`): styr ENBART om inloggnings-ytan visas
  // för en icke-admin, inte om man får bli admin (det avgör RLS). Se VARFÖR nedan.
  const organizerEntry = useOrganizerEntry();

  // Bara i live-läge (samma gate som tips-/topplistesektionerna).
  if (!rooms.enabled) {
    return null;
  }

  // ADMIN: facit-inmatningen.
  if (official.isAdmin === true) {
    return surface(<AdminResultEntry />);
  }

  // ICKE-ADMIN: BARA den lugna read-only-noten. Arrangörs-inloggningen är DOLD bakom
  // ett hemligt URL-fragment (T48, #81) och visas bara när det är aktivt.
  //
  // VARFÖR dold (Daniels uttryckliga krav inför delning, "inloggningen ska de inte
  // se"): den tidigare synliga <details>-ingången ("Är du arrangör? Logga in") fick
  // vanliga vänner att tro att vem som helst kunde bli admin (de kan INTE, RLS skyddar
  // facit, men ytan oroade). Nu möts en vanlig vän BARA av read-only-noten. Daniel når
  // inloggningen genom att lägga `#arrangor` på URL:en; useOrganizerEntry följer
  // hashchange så han kan skriva in det utan reload.
  //
  // SÄKERHET: detta är REN UX-diskretion, INGEN säkerhetsgräns. Skyddet ligger i
  // RLS/app_admins (T42, RLS-bevisat): den som hittar fragmentet kan ändå inte bli
  // admin utan att finnas i app_admins. Vi gömmer alltså bara ytan, fragmentet behöver
  // inte vara en hemlighet för säkerheten. En riktig recoverable sign-in är en separat
  // kommande task (T48b).
  //
  // AdminLogin-MEKANIKEN är OFÖRÄNDRAD (updateUser/verifyOtp, onUpgraded->refresh),
  // bara dess synlighets-villkor (organizerEntry) är nytt. AdminLogin delar facit-
  // storens klient (samma session) så en lyckad uppgradering syns direkt; onUpgraded
  // laddar om admin-status så vyn växlar till inmatningen utan reload.
  return surface(
    <div data-admin-readonly="" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">Officiella resultat</h3>
        <p className="text-sm text-fg-muted">
          Matchresultaten matas in av arrangören och gäller automatiskt för alla rum. Du behöver
          inte fylla i något, poängen räknas ut åt dig när matcherna spelats.
        </p>
      </div>
      {organizerEntry ? (
        <div data-admin-organizer-entry="" className="mt-1">
          <AdminLogin
            client={official.client}
            onUpgraded={() => {
              // refresh() kastar vid fel (R3-kontraktet); en login-triggad refresh som
              // missar (flyktigt nät-/RPC-fel) ska inte ge en o-hanterad Promise-rejection
              // (console-brus/krasch i test). Svälj här, AdminLogin:s 'done'-läge ger ändå
              // feedback och nästa fokus/online-refetch försöker igen. (Copilot R4)
              void official.refresh().catch(() => {});
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
