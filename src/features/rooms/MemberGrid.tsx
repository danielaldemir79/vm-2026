// MEDLEMSLISTAN i ett rum (T94, #187): komprimerad default + LINJERAT rutnät.
//
// PROBLEMET (Daniels skärmdump 2026-06-16): den tidigare medlemsvyn var ett
// `flex-wrap` av namn-chips med OLIKA bredd, som radbröt raggat och inte låg i linje
// , rörigt och oproffsigt när rummet växer (43 medlemmar). Två krav löses här:
//   1. KOMPRIMERAD DEFAULT: rubriken "Medlemmar (N)" är alltid synlig och själva
//      rutnätet är höjd-klippt bakom EN expandera-kontroll (den delade CollapsibleBody-
//      primitiven, samma sticky komprimera-mönster som appens övriga grid-sektioner
//      , GroupStage/Bracket/Admin). EN kontroll, aldrig nästlad (north-star §2-3).
//   2. LINJERAT RUTNÄT: medlemmarna i ett ENHETLIGT CSS grid med FAST responsivt
//      kolumnantal (2/3/4 kol per brytpunkt) och `minmax(0, 1fr)`-celler, så ALLA
//      chips blir exakt lika breda och raderna ligger i linje. Långa namn klipps med
//      ellipsis (`truncate`) i stället för att spränga cellen. Grid-receptet bor i
//      rooms.css (.vm-rooms-member-grid).
//
// "DITT DIREKT" (north-star §5, DRY): den egna raden ("du") pinnas ÖVERST och bär den
// BEFINTLIGA "DU"-markeringen (MemberChip data-self + "(du)" + accent-kant i rooms.css),
// så man hittar sig själv direkt i varje lista. Sorteringen sker HÄR (stabil: self
// först, övriga i inkommande ordning), inte i datalagret, så presentationen äger sin
// egen ordning utan att röra rums-/medlems-logiken (out of scope).
//
// VARFÖR HÖJD-KLIPP (CollapsibleBody) och inte CollapsibleList:s render-subset: rutnätet
// är RESPONSIVT (2/3/4 kol per skärmbredd), och en render-subset kan inte veta brytpunkten
// vid render-tid. Höjd-klipp till ~2 rader + den egna raden pinnad överst ger den ÄRLIGA
// "ett par medlemmar synliga"-teasern oavsett skärmbredd (samma val som GroupStage/Bracket,
// dokumenterat i decisions.md T68). CollapsibleBody mäter själv om innehållet FAKTISKT
// klipps och döljer kontrollen annars (ingen falsk "mer"-affordans).
//
// A11Y: rutnätet är en <ul role="list"> (Safari nollar list-semantik när list-style tas
// bort, role återställer den) med aria-label som bär antalet, varje rad <li> med
// aria-setsize/-posinset så skärmläsaren vet hela storleken. "(du)" är riktig text (inte
// bara färg). Expandera-kontrollen + reduced-motion + fokus-flytt vid komprimering ärvs
// av CollapsibleBody/ExpandToggle. Avatar-färgen är dekor (aria-hidden); initialer + namn
// bär identiteten.

import { CollapsibleBody } from '../../components/CollapsibleSection';
import { MemberChip } from './MemberChip';
import type { RoomMember } from './rooms-context';

/**
 * Under detta antal medlemmar komprimeras INTE (1-3 ryms bekvämt, ingen vägg att fälla):
 * vi visar rutnätet direkt utan en expandera-kontroll, så en liten lista inte får en
 * onödig "Visa alla"-knapp. Vid 4+ medlemmar fälls rutnätet ihop bakom kontrollen.
 * (CollapsibleBody mäter dessutom själv om innehållet faktiskt klipps i en riktig
 * webbläsare och döljer kontrollen om allt redan ryms , dubbel ärlighet.)
 */
const COLLAPSE_THRESHOLD = 3;

/** Höjden rutnätet klipps till i komprimerat läge: ~2 rader (rad ~2.5rem + gap). */
const COLLAPSED_MAX_HEIGHT = '6rem';

/**
 * Den egna raden pinnas FÖRST, övriga behåller sin inkommande ordning (stabil sort).
 * Ren funktion, exporterad för test. Muterar inte indata (skapar en ny array).
 *
 * `selfUserId` kan vara null (anonym auth inte etablerad än): då matchar ingen rad, så
 * inget pinnas/markeras , listan visas i sin inkommande ordning utan "du"-rad (korrekt,
 * vi vet inte vem användaren är då). Intern helper (beteendet bevisas via komponent-
 * testerna: pinnad-överst, order-bevarad, ingen-egen-rad), så den hålls oexporterad
 * och MemberGrid förblir filens enda export (ren fast-refresh-gräns).
 */
function sortSelfFirst(members: readonly RoomMember[], selfUserId: string | null): RoomMember[] {
  const self = members.filter((m) => m.userId === selfUserId);
  const rest = members.filter((m) => m.userId !== selfUserId);
  return [...self, ...rest];
}

/** Själva det linjerade rutnätet (en <ul> grid). Delas av komprimerat + direkt läge. */
function MemberList({ members, selfUserId }: { members: RoomMember[]; selfUserId: string | null }) {
  return (
    <ul
      // role="list" återställer list-semantiken som Safari nollar när list-style tas bort
      // (a11y), och aria-label bär hela rummets storlek åt skärmläsaren.
      role="list"
      aria-label={`Alla medlemmar (${members.length})`}
      data-rooms-members
      className="vm-rooms-member-grid"
    >
      {members.map((m, i) => (
        <MemberChip
          key={m.userId}
          userId={m.userId}
          displayName={m.displayName}
          isSelf={m.userId === selfUserId}
          posInSet={i + 1}
          setSize={members.length}
        />
      ))}
    </ul>
  );
}

/**
 * Medlemslistan: rubrik "Medlemmar (N)" alltid synlig, rutnätet komprimerat default
 * (höjd-klippt bakom EN expandera-kontroll) vid 4+ medlemmar, annars direkt. Egen rad
 * pinnad överst + markerad. Ren presentation, ingen store/provider (tar medlemmar +
 * egen user-id som props), så den kan testas isolerat och återanvändas där rummet visas.
 */
export function MemberGrid({
  members,
  selfUserId,
}: {
  members: readonly RoomMember[];
  selfUserId: string | null;
}) {
  const ordered = sortSelfFirst(members, selfUserId);

  return (
    <div data-rooms-members-section="" className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted">
        Medlemmar ({members.length})
      </h4>

      {members.length === 0 ? (
        // Edge: ett rum utan medlemmar (övergående tillstånd). En lugn rad, ingen tom
        // platta och inget rutnät att rendera (fail-soft, inte en trasig tom <ul>).
        <p data-rooms-members-empty="" className="text-sm text-fg-muted">
          Inga medlemmar än.
        </p>
      ) : members.length > COLLAPSE_THRESHOLD ? (
        // 4+ medlemmar: komprimera rutnätet bakom den delade kontrollen (height-clip +
        // gradient-fade + fokus-flytt vid komprimering ärvs av CollapsibleBody).
        <CollapsibleBody
          name="rooms-members"
          toggleLabels={{
            expand: `Visa alla ${members.length} medlemmar`,
            collapse: 'Visa färre',
          }}
          collapsedMaxHeight={COLLAPSED_MAX_HEIGHT}
        >
          <MemberList members={ordered} selfUserId={selfUserId} />
        </CollapsibleBody>
      ) : (
        // 1-3 medlemmar: visa rutnätet direkt (ingen vägg, ingen onödig kontroll).
        <MemberList members={ordered} selfUserId={selfUserId} />
      )}
    </div>
  );
}
