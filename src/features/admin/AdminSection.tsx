// Admin-sektionen (T42, #72): arrangörens facit-yta.
//
// GATAD på live-läge (rooms.enabled, samma som de andra live-sektionerna): i
// fixtures-läge renderar den inget. I live-läge:
//   - ADMIN (Daniel): admin-facit-inmatningen (AdminResultEntry).
//   - ICKE-ADMIN (vanlig deltagare): en diskret READ-ONLY-not ("resultaten matas
//     in av arrangören") + en lågmäld arrangörs-inloggning (AdminLogin) för den
//     som FAKTISKT är arrangör men ännu inte loggat in.
//
// Admin-STATUS bor i OfficialResultsProvider (en sanning för "är jag admin?",
// samma helper RLS använder). Premium-design lämnas till T42b.

import type { ReactNode } from 'react';
import { useRoomsStore } from '../rooms';
import { useOfficialResultsStore } from '../official-results';
import { AdminLogin } from './AdminLogin';
import { AdminResultEntry } from './AdminResultEntry';

export function AdminSection({ surface }: { surface: (children: ReactNode) => ReactNode }) {
  const rooms = useRoomsStore();
  const official = useOfficialResultsStore();

  // Bara i live-läge (samma gate som tips-/topplistesektionerna).
  if (!rooms.enabled) {
    return null;
  }

  // ADMIN: facit-inmatningen.
  if (official.isAdmin === true) {
    return surface(<AdminResultEntry />);
  }

  // ICKE-ADMIN: read-only-not + en DISKRET arrangörs-ingång (T48, #81).
  //
  // VARFÖR diskret (Daniels pre-share-blockerare): den prominenta "logga in som
  // arrangör"-rutan fick vanliga vänner att tro att vem som helst kunde bli admin
  // (de kan INTE, RLS skyddar facit, men UX:t oroade). Vi tuckar därför inloggningen
  // bakom en lågmäld <details>-utfällning ("Är du arrangör?"), så en vanlig vän bara
  // möts av den lugna read-only-noten och inte en inloggnings-ruta. Den EXISTERANDE
  // e-post-mekaniken (AdminLogin, updateUser/verifyOtp) är OFÖRÄNDRAD, bara gömd. En
  // riktig recoverable sign-in är en separat kommande task (T48b).
  //
  // <details>/<summary> = inbyggd, tillgänglig disclosure (tangentbord + skärmläsare
  // utan extra JS/aria-plumbing). AdminLogin delar facit-storens klient (samma
  // session) så en lyckad uppgradering syns direkt; onUpgraded laddar om admin-status
  // så vyn växlar till inmatningen utan reload.
  return surface(
    <div data-admin-readonly="" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">Officiella resultat</h3>
        <p className="text-sm text-fg-muted">
          Matchresultaten matas in av arrangören och gäller automatiskt för alla rum. Du behöver
          inte fylla i något, poängen räknas ut åt dig när matcherna spelats.
        </p>
      </div>
      <details data-admin-organizer-disclosure="" className="group">
        {/* Diskret ingång: en lågmäld rad, inte en inloggnings-ruta. list-none döljer
            den inbyggda disclosure-triangeln så vi kan ge en egen, dämpad affordans. */}
        <summary
          data-admin-organizer-toggle=""
          className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm text-fg-muted underline-offset-2 hover:underline focus-visible:underline [&::-webkit-details-marker]:hidden"
        >
          Är du arrangör? Logga in
        </summary>
        <div className="mt-3">
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
      </details>
    </div>
  );
}
