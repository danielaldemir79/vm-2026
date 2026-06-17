import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemberGrid } from './MemberGrid';
import type { RoomMember } from './rooms-context';

// MemberGrid är en REN presentationskomponent (T94, #187): den får medlemmarna +
// den egna user-id:n och äger HUR listan visas , komprimerad default (höjd-klippt
// rutnät bakom EN expandera-kontroll, den delade CollapsibleBody-primitiven som
// resten av appens grid-sektioner) -> linjerat rutnät vid expandering, med den egna
// raden pinnad överst. Ingen store/provider behövs, så testet stannar på
// presentation + a11y (krav-ytan, lessons "wira in ytan där användaren ser den").
//
// VARFÖR jsdom-anpassade assertions: CollapsibleBody KLIPPER innehållet på HÖJD
// (det stannar i DOM:en, bara visuellt klippt), så alla medlemmar är monterade även
// komprimerat. Komprimerat-vs-utfällt avläses på toggelns aria-expanded +
// data-collapsed, inte på om raderna finns i DOM:en.

function members(...names: Array<[string, string]>): RoomMember[] {
  return names.map(([userId, displayName]) => ({ userId, displayName }));
}

/** Det utfällbara rutnätet (role=list, aria-label "Alla medlemmar ..."). */
function memberList(): HTMLElement {
  return screen.getByRole('list', { name: /Alla medlemmar/ });
}

describe('MemberGrid', () => {
  it('visar rubriken "Medlemmar (N)" med rätt antal', () => {
    render(
      <MemberGrid
        members={members(['me', 'Daniel'], ['u2', 'Bob'], ['u3', 'Cilla'])}
        selfUserId="me"
      />
    );
    expect(screen.getByRole('heading', { name: /Medlemmar \(3\)/ })).toBeInTheDocument();
  });

  it('är KOMPRIMERAD som default (toggle aria-expanded=false, kroppen data-collapsed=true)', () => {
    render(
      <MemberGrid
        members={members(['me', 'Daniel'], ['u2', 'Bob'], ['u3', 'Cilla'], ['u4', 'Dora'])}
        selfUserId="me"
      />
    );
    const toggle = screen.getByRole('button', { name: /Visa alla 4 medlemmar/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Kroppen är höjd-klippt (komprimerad) tills man fäller ut den (CollapsibleBody-haken).
    const body = document.querySelector('[data-collapsible-body][data-collapsed="true"]');
    expect(body).not.toBeNull();
  });

  it('expanderar på tap: aria-expanded=true, kroppen data-collapsed=false', () => {
    render(
      <MemberGrid
        members={members(['me', 'Daniel'], ['u2', 'Bob'], ['u3', 'Cilla'], ['u4', 'Dora'])}
        selfUserId="me"
      />
    );
    const toggle = screen.getByRole('button', { name: /Visa alla 4 medlemmar/i });
    fireEvent.click(toggle);
    // Utfällt läge dubblerar kontrollen (övre + nedre, så man når den utan att skrolla);
    // båda bär aria-expanded=true.
    const collapseToggles = screen.getAllByRole('button', { name: /Visa färre/i });
    expect(collapseToggles.length).toBeGreaterThanOrEqual(1);
    for (const t of collapseToggles) {
      expect(t).toHaveAttribute('aria-expanded', 'true');
    }
    const body = document.querySelector('[data-collapsible-body][data-collapsed="false"]');
    expect(body).not.toBeNull();
  });

  it('rutnätet innehåller ALLA medlemmar (inget tappas)', () => {
    render(
      <MemberGrid
        members={members(['me', 'Daniel'], ['u2', 'Bob'], ['u3', 'Cilla'], ['u4', 'Dora'])}
        selfUserId="me"
      />
    );
    const grid = memberList();
    for (const name of ['Daniel', 'Bob', 'Cilla', 'Dora']) {
      expect(within(grid).getByText(new RegExp(name))).toBeInTheDocument();
    }
    expect(within(grid).getAllByRole('listitem')).toHaveLength(4);
  });

  it('pinnar den egna raden ("Du") ÖVERST oavsett inkommande ordning', () => {
    render(
      <MemberGrid
        members={members(['u2', 'Bob'], ['u3', 'Cilla'], ['me', 'Daniel'])}
        selfUserId="me"
      />
    );
    const items = within(memberList()).getAllByRole('listitem');
    // Trots att "Daniel" kom SIST i datan ligger den egna raden först (pinnad).
    expect(items[0]).toHaveTextContent(/Daniel/);
    expect(items[0]).toHaveAttribute('data-rooms-member-self', 'true');
  });

  it('markerar den egna raden med "(du)" + self-attribut (återanvänd DU-markering)', () => {
    render(<MemberGrid members={members(['me', 'Daniel'], ['u2', 'Bob'])} selfUserId="me" />);
    const selfItem = within(memberList())
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('data-rooms-member-self') === 'true');
    expect(selfItem).toBeDefined();
    // Den egna raden är annonserad för skärmläsaren, inte bara visuell färg.
    expect(selfItem).toHaveTextContent(/\(du\)/);
  });

  it('rutnätets namn-etikett bär truncate (ellipsis) så långa namn klipps i linje', () => {
    render(
      <MemberGrid
        members={members(
          ['me', 'Daniel'],
          ['u2', 'Ett otroligt långt visningsnamn som annars skulle spränga cellen']
        )}
        selfUserId="me"
      />
    );
    const longLabel = within(memberList()).getByText(/Ett otroligt långt visningsnamn/);
    // truncate-klassen bär ellipsis + nowrap, så cellerna håller samma bredd och
    // raderna ligger i linje i stället för att radbryta raggat (taskens kärna).
    expect(longLabel.className).toMatch(/\btruncate\b/);
  });

  it('rutnätet bär grid-klassen (linjerat, inte flex-wrap)', () => {
    render(
      <MemberGrid
        members={members(['me', 'Daniel'], ['u2', 'Bob'], ['u3', 'Cilla'])}
        selfUserId="me"
      />
    );
    expect(memberList().className).toMatch(/vm-rooms-member-grid/);
  });

  it('edge: ETT medlem , ingen expandera-kontroll, raden visas direkt (ingen vägg)', () => {
    render(<MemberGrid members={members(['me', 'Daniel'])} selfUserId="me" />);
    expect(screen.getByRole('heading', { name: /Medlemmar \(1\)/ })).toBeInTheDocument();
    // Med så få medlemmar finns inget att komprimera , ingen toggle, ingen klippt kropp.
    expect(screen.queryByRole('button', { name: /Visa alla/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-collapsible-body]')).toBeNull();
    const self = within(memberList())
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('data-rooms-member-self') === 'true');
    expect(self).toHaveTextContent(/Daniel/);
    expect(self).toHaveTextContent(/\(du\)/);
  });

  it('edge: tomt visningsnamn ger en "?"-platshållare (ingen trasig tom bricka)', () => {
    render(<MemberGrid members={members(['me', 'Daniel'], ['u2', '   '])} selfUserId="me" />);
    // initialsFromName('   ') -> '?', avatar-brickan blir aldrig tom.
    expect(within(memberList()).getAllByText('?').length).toBeGreaterThan(0);
  });

  it('edge: MÅNGA medlemmar (43) , alla renderas i rutnätet, ARIA bär full storlek', () => {
    const many: Array<[string, string]> = Array.from({ length: 43 }, (_, i) =>
      i === 0 ? ['me', 'Daniel'] : [`u${i}`, `Spelare ${i}`]
    );
    render(<MemberGrid members={members(...many)} selfUserId="me" />);
    expect(screen.getByRole('button', { name: /Visa alla 43 medlemmar/i })).toBeInTheDocument();
    const grid = memberList();
    const items = within(grid).getAllByRole('listitem');
    expect(items).toHaveLength(43);
    // ARIA bär hela rummets storlek (setsize) på varje rad.
    expect(items[0]).toHaveAttribute('aria-setsize', '43');
  });

  it('edge: ingen egen rad i datan (jag är inte medlem) , ingen krasch, ingen self-markering', () => {
    render(<MemberGrid members={members(['u2', 'Bob'], ['u3', 'Cilla'])} selfUserId="ghost" />);
    const items = within(memberList()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items.every((li) => li.getAttribute('data-rooms-member-self') === 'false')).toBe(true);
    expect(within(memberList()).queryByText(/\(du\)/)).not.toBeInTheDocument();
    // Ordningen bevaras (Bob före Cilla) när det inte finns någon egen rad att pinna.
    expect(items[0]).toHaveTextContent(/Bob/);
    expect(items[1]).toHaveTextContent(/Cilla/);
  });

  it('edge: noll medlemmar , lugn rad, ingen tom platta', () => {
    render(<MemberGrid members={[]} selfUserId="me" />);
    expect(screen.getByRole('heading', { name: /Medlemmar \(0\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Visa alla/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /Alla medlemmar/ })).not.toBeInTheDocument();
  });
});
