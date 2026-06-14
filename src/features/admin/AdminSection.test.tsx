import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AdminSection } from './AdminSection';
import { ORGANIZER_HASH } from './use-organizer-entry';
import { RoomsStoreContext, type RoomsStore } from '../rooms/rooms-context';
import {
  OfficialResultsStoreContext,
  type OfficialResultsStore,
} from '../official-results/official-results-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { Match } from '../../domain/types';

// Mocka matchplan-laddningen så admin-inmatningen har matcher utan att slå mot
// getDataSource (vi testar UI-logiken: validering, save, gating, listans markeringar).
//
// officialResultIds är den AUKTORITATIVA "inmatad"-signalen (T80, #169): match-id:n
// med ett SPARAT officiellt resultat. Vi styr den per test för att bevisa skarven
// (en match MED resultat blir grön/klar-markerad, en UTAN inte), HÄRLEDD ur samma
// officialResults som vävs in, inte ur m.status === 'finished'.
const adminMatchesState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  matches: [] as Match[],
  officialResultIds: new Set<string>(),
  error: null as string | null,
}));
vi.mock('./use-admin-matches', () => ({
  useAdminMatches: () => ({
    ...adminMatchesState,
    teamName: (id: string | null) => id ?? 'TBD',
  }),
}));

// Mocka admin-auth så login-flödet inte slår mot Supabase.
const authState = vi.hoisted(() => ({ requestError: null as Error | null }));
vi.mock('../../data/rooms', () => ({
  requestAdminEmailUpgrade: vi.fn(async () => {
    if (authState.requestError) {
      throw authState.requestError;
    }
  }),
  confirmAdminEmailUpgrade: vi.fn(async () => 'anon-1'),
}));

const FINISHED_GROUP: Match = {
  id: 'g-A-1',
  stage: 'group',
  groupId: 'A',
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-06-11T18:00:00Z',
  venue: 'X',
  status: 'scheduled',
  result: null,
};

const KNOCKOUT: Match = {
  id: 'M73',
  stage: 'round-of-32',
  groupId: null,
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-07-04T18:00:00Z',
  venue: 'X',
  status: 'scheduled',
  result: null,
};

// En andra gruppmatch, så T80-listans markeringar kan bevisas DISKRIMINERANDE
// (en rad grön, en annan inte) i stället för "alla ser likadana ut".
const GROUP_B: Match = {
  id: 'g-B-1',
  stage: 'group',
  groupId: 'B',
  homeTeamId: 'esp',
  awayTeamId: 'ger',
  kickoff: '2026-06-12T18:00:00Z',
  venue: 'Y',
  status: 'scheduled',
  result: null,
};

// En match med ett invävt FINISHED-resultat (efter applyRoomResults), så klar-
// etiketten kan bevisas bära resultatet ("Klar 2-1").
const FINISHED_WITH_RESULT: Match = {
  id: 'g-A-1',
  stage: 'group',
  groupId: 'A',
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-06-11T18:00:00Z',
  venue: 'X',
  status: 'finished',
  result: { homeGoals: 2, awayGoals: 1 },
};

// En slutspelsmatch utan kända lag (TBD): parity med dropdownen, ska INTE dyka upp
// i listan (bara entriable matcher där båda lag är kända kan väljas).
const TBD_KNOCKOUT: Match = {
  id: 'M999',
  stage: 'round-of-16',
  groupId: null,
  homeTeamId: null,
  awayTeamId: null,
  kickoff: '2026-07-10T18:00:00Z',
  venue: 'Z',
  status: 'scheduled',
  result: null,
};

function roomsStore(): RoomsStore {
  return { enabled: true } as unknown as RoomsStore;
}

function officialStore(over: Partial<OfficialResultsStore>): OfficialResultsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    results: [],
    isAdmin: false,
    client: {} as VmSupabaseClient,
    saveOfficialResult: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    ...over,
  };
}

function renderSection(official: OfficialResultsStore) {
  return render(
    <RoomsStoreContext.Provider value={roomsStore()}>
      <OfficialResultsStoreContext.Provider value={official}>
        <AdminSection surface={(children) => <div>{children}</div>} />
      </OfficialResultsStoreContext.Provider>
    </RoomsStoreContext.Provider>
  );
}

// T80 (#169): matchen väljs nu genom att klicka dess rad i den synliga listan
// (inte en dropdown). Klicka raden med givet match-id, fail-loud om den saknas.
function selectMatchRow(matchId: string) {
  const row = document.querySelector(`[data-admin-match-row][data-match-id="${matchId}"]`);
  if (!row) {
    throw new Error(`selectMatchRow: ingen rad med match-id "${matchId}" i listan.`);
  }
  fireEvent.click(row);
}

// T48 (#81): den dolda arrangörs-ingången styrs av URL-fragmentet `#arrangor`.
// Helpers för att slå PÅ/AV det i jsdom (location.hash) så test driver synligheten.
function setOrganizerHash() {
  window.location.hash = `#${ORGANIZER_HASH}`;
}
function clearOrganizerHash() {
  window.location.hash = '';
}

beforeEach(() => {
  adminMatchesState.status = 'ready';
  adminMatchesState.matches = [FINISHED_GROUP];
  adminMatchesState.officialResultIds = new Set<string>();
  adminMatchesState.error = null;
  authState.requestError = null;
  clearOrganizerHash();
  vi.clearAllMocks();
});

afterEach(() => {
  clearOrganizerHash();
});

describe('AdminSection, gating', () => {
  it('renderar inget i lokalt läge (rooms.enabled false)', () => {
    const { container } = render(
      <RoomsStoreContext.Provider value={{ enabled: false } as unknown as RoomsStore}>
        <OfficialResultsStoreContext.Provider value={officialStore({})}>
          <AdminSection surface={(c) => <div>{c}</div>} />
        </OfficialResultsStoreContext.Provider>
      </RoomsStoreContext.Provider>
    );
    expect(container.querySelector('[data-admin-entry]')).toBeNull();
    expect(container.querySelector('[data-admin-readonly]')).toBeNull();
  });

  // T48 (#81): UTAN det hemliga fragmentet ser en vanlig vän BARA read-only-noten,
  // INGEN inloggnings-affordans alls (Daniels krav: "inloggningen ska de inte se").
  it('icke-admin UTAN hemligt fragment: bara read-only-noten, INGEN login-affordans', () => {
    renderSection(officialStore({ isAdmin: false }));
    // Read-only-containern + den lugna noten finns.
    expect(document.querySelector('[data-admin-readonly]')).not.toBeNull();
    expect(screen.getByText(/poängen räknas ut åt dig/i)).toBeInTheDocument();
    // INGEN login-form, INGEN dold-ingångs-container, och ingen "arrangör? logga in"-text.
    expect(document.querySelector('[data-admin-login]')).toBeNull();
    expect(document.querySelector('[data-admin-organizer-entry]')).toBeNull();
    expect(screen.queryByText(/arrangör\?\s*logga in/i)).toBeNull();
    expect(screen.queryByText(/logga in/i)).toBeNull();
    // Och INTE admin-inmatningen.
    expect(document.querySelector('[data-admin-entry]')).toBeNull();
  });

  // T48 (#81): MED det hemliga fragmentet (`#arrangor`) fälls AdminLogin fram, så
  // Daniel når inloggningen. Mekaniken är oförändrad, bara synlighets-villkoret är nytt.
  it('icke-admin MED hemligt fragment (#arrangor): AdminLogin visas', () => {
    setOrganizerHash();
    renderSection(officialStore({ isAdmin: false }));
    expect(document.querySelector('[data-admin-readonly]')).not.toBeNull();
    expect(document.querySelector('[data-admin-organizer-entry]')).not.toBeNull();
    expect(document.querySelector('[data-admin-login]')).not.toBeNull();
    // Fortfarande inte admin-inmatningen (man är inte admin förrän RLS säger det).
    expect(document.querySelector('[data-admin-entry]')).toBeNull();
  });

  // T48 (#81): hashchange utan reload fäller fram ingången (Daniel skriver in
  // `#arrangor` i adressfältet). useOrganizerEntry följer hashchange.
  it('icke-admin: AdminLogin dyker upp när fragmentet sätts via hashchange (utan reload)', async () => {
    renderSection(officialStore({ isAdmin: false }));
    expect(document.querySelector('[data-admin-organizer-entry]')).toBeNull();

    await act(async () => {
      window.location.hash = `#${ORGANIZER_HASH}`;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(document.querySelector('[data-admin-organizer-entry]')).not.toBeNull();
    expect(document.querySelector('[data-admin-login]')).not.toBeNull();
  });

  it('admin ser facit-inmatningen, INTE read-only-noten (oberoende av fragmentet)', () => {
    renderSection(officialStore({ isAdmin: true }));
    expect(document.querySelector('[data-admin-entry]')).not.toBeNull();
    expect(document.querySelector('[data-admin-readonly]')).toBeNull();
    // Den dolda ingången är irrelevant för en redan-admin (ingen login-yta visas).
    expect(document.querySelector('[data-admin-login]')).toBeNull();
  });
});

describe('AdminResultEntry, save mot global facit', () => {
  it('sparar ett giltigt resultat via saveOfficialResult och visar bekräftelse', async () => {
    const save = vi.fn(async () => {});
    renderSection(officialStore({ isAdmin: true, saveOfficialResult: save }));

    selectMatchRow('g-A-1');
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '1' } });
    // status default 'finished'
    await act(async () => {
      fireEvent.click(screen.getByText('Spara officiellt resultat'));
    });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 'g-A-1', homeGoals: 2, awayGoals: 1, status: 'finished' })
    );
    expect(await screen.findByText(/gäller nu för alla rum/i)).toBeInTheDocument();
  });

  // Copilot R1: straff-fälten ska visas på lika-ställning i slutspel även när målen
  // skrivs med olika strängformat ("01" vs "1"), eftersom valideringen kräver straffar
  // vid lika. Lika räknas på parsade heltal, inte strängjämförelse.
  it('visar straff-fälten vid lika slutspelsställning med ledande nolla ("01" mot "1")', () => {
    adminMatchesState.matches = [KNOCKOUT];
    renderSection(officialStore({ isAdmin: true }));

    selectMatchRow('M73');
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '01' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '1' } });

    // status default 'finished'; "01" === "1" som tal -> lika -> straff-fälten visas.
    expect(document.querySelector('[data-admin-entry-penalties]')).not.toBeNull();
  });

  it('avvisar ogiltig inmatning (negativt mål) utan att anropa save', async () => {
    const save = vi.fn(async () => {});
    renderSection(officialStore({ isAdmin: true, saveOfficialResult: save }));

    selectMatchRow('g-A-1');
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Spara officiellt resultat'));
    });

    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('[data-admin-entry-errors]')).not.toBeNull();
  });

  it('visar fel-meddelandet om save fail-loud:ar (RLS-avslag)', async () => {
    const save = vi.fn(async () => {
      throw new Error('icke-admin nekas');
    });
    renderSection(officialStore({ isAdmin: true, saveOfficialResult: save }));

    selectMatchRow('g-A-1');
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Spara officiellt resultat'));
    });

    expect(await screen.findByText(/icke-admin nekas/i)).toBeInTheDocument();
  });
});

// T80 (#169): den synliga match-listan ersätter dropdownen. Daniel ser raderna och
// vilka han matat in (grön + bock + text), och kan välja en rad med tangentbordet.
describe('AdminResultEntry, synlig match-lista (T80)', () => {
  function rows() {
    return Array.from(document.querySelectorAll('[data-admin-match-row]'));
  }
  function rowFor(matchId: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(
      `[data-admin-match-row][data-match-id="${matchId}"]`
    );
    if (!el) {
      throw new Error(`rowFor: ingen rad med match-id "${matchId}".`);
    }
    return el;
  }

  it('renderar en rad per entriable match (en riktig button, tangentbords-navigerbar)', () => {
    adminMatchesState.matches = [FINISHED_GROUP, GROUP_B];
    renderSection(officialStore({ isAdmin: true }));

    const buttons = rows();
    expect(buttons).toHaveLength(2);
    // Riktiga <button>-element (inte div:ar): fokuserbara/aktiverbara via tangentbord.
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
    }
  });

  it('döljer en TBD-match (okända lag), parity med dropdownen (bara entriable)', () => {
    adminMatchesState.matches = [FINISHED_GROUP, TBD_KNOCKOUT];
    renderSection(officialStore({ isAdmin: true }));

    expect(rows()).toHaveLength(1);
    expect(document.querySelector('[data-admin-match-row][data-match-id="M999"]')).toBeNull();
  });

  // BEVISA SKARVEN (befordrad topp-regel): markeringen styrs av officialResults-
  // MEDLEMSKAP, inte m.status. En match MED resultat blir grön/klar, en UTAN inte.
  it('grön/klar bara på raden med sparat officiellt resultat (skarven, BÅDA fallen)', () => {
    adminMatchesState.matches = [FINISHED_WITH_RESULT, GROUP_B];
    // Bara g-A-1 har ett sparat officiellt resultat.
    adminMatchesState.officialResultIds = new Set(['g-A-1']);
    renderSection(officialStore({ isAdmin: true }));

    // MED resultat: grön klar-markering (data-attribut), bock-ikon + text som bär
    // resultatet (färg-oberoende, WCAG 1.4.1), och raden bär data-entered.
    const entered = rowFor('g-A-1');
    expect(entered.querySelector('[data-admin-match-entered]')).not.toBeNull();
    expect(entered.hasAttribute('data-entered')).toBe(true);
    expect(entered.textContent).toMatch(/Klar 2-1/);

    // UTAN resultat: ingen klar-markering, ingen data-entered (negativ kontroll i UI:t).
    const plain = rowFor('g-B-1');
    expect(plain.querySelector('[data-admin-match-entered]')).toBeNull();
    expect(plain.hasAttribute('data-entered')).toBe(false);
  });

  // Skarvens edge: ett officiellt resultat sparat med status 'live' gör INTE matchens
  // status 'finished' (applyRoomResults nollar målen), men matchen ÄR inmatad. Bara
  // officialResults-medlemskap fångar det. Detta är just felet m.status-signalen gör.
  it('grön/klar även när matchen inte är finished men har officiellt resultat (live)', () => {
    const liveEntered: Match = { ...GROUP_B, status: 'live', result: null };
    adminMatchesState.matches = [liveEntered];
    adminMatchesState.officialResultIds = new Set(['g-B-1']);
    renderSection(officialStore({ isAdmin: true }));

    const row = rowFor('g-B-1');
    // Medlem i officialResults -> klar-markerad, trots status 'live' (inte 'finished').
    expect(row.querySelector('[data-admin-match-entered]')).not.toBeNull();
    expect(row.hasAttribute('data-entered')).toBe(true);
    // Ingen finished-result att visa, så bara "Klar" (utan siffror).
    expect(row.textContent).toMatch(/Klar(?!\s*\d)/);
  });

  it('klick på en rad väljer matchen (formuläret speglar den, save får rätt matchId)', async () => {
    const save = vi.fn(async () => {});
    adminMatchesState.matches = [FINISHED_GROUP, GROUP_B];
    renderSection(officialStore({ isAdmin: true, saveOfficialResult: save }));

    fireEvent.click(rowFor('g-B-1'));
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Spara officiellt resultat'));
    });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'g-B-1' }));
  });

  it('vald rad är markerad med aria-pressed (de andra inte)', () => {
    adminMatchesState.matches = [FINISHED_GROUP, GROUP_B];
    renderSection(officialStore({ isAdmin: true }));

    fireEvent.click(rowFor('g-B-1'));
    expect(rowFor('g-B-1').getAttribute('aria-pressed')).toBe('true');
    expect(rowFor('g-B-1').hasAttribute('data-selected')).toBe(true);
    // Den ovalda raden är inte markerad.
    expect(rowFor('g-A-1').getAttribute('aria-pressed')).toBe('false');
    expect(rowFor('g-A-1').hasAttribute('data-selected')).toBe(false);
  });

  // Copilot C1 (a11y): varje rad-knapp har ett SJÄLV-beskrivande tillgängligt namn
  // (aria-label), så ett hjälpmedel ger kontrollkontexten ("Match" + lagen + matchens
  // status + klar-status) när man tabbar mellan rader, utan att förlita sig på listans
  // aria-labelledby. Vi hittar knapparna VIA deras roll+namn (det skärmläsaren hör),
  // inte via data-attribut. teamName-mocken ger raw id:n (mex/kor, esp/ger).
  it('varje rad-knapp har ett självbeskrivande namn (Match + lagen + status + klar-status)', () => {
    adminMatchesState.matches = [FINISHED_WITH_RESULT, GROUP_B];
    // Bara g-A-1 har ett sparat officiellt resultat (2-1).
    adminMatchesState.officialResultIds = new Set(['g-A-1']);
    renderSection(officialStore({ isAdmin: true }));

    // Formen "Match: <hemma> mot <borta>, <status>, <klar-status>", så raden är ensamt
    // begriplig. FINISHED_WITH_RESULT är 'finished' -> "Färdigspelad".
    const entered = screen.getByRole('button', { name: /Match: mex mot kor/ });
    // Inmatad rad bär status + resultatet (klar-status), färg-oberoende i namnet (1.4.1).
    expect(entered).toHaveAttribute('aria-label', 'Match: mex mot kor, Färdigspelad, Klar 2-1');

    // Ej-inmatad rad säger status + uttryckligen "ej inmatad". GROUP_B är 'scheduled'
    // -> "Ej spelad" (skild från den klara raden).
    const plain = screen.getByRole('button', { name: /Match: esp mot ger/ });
    expect(plain).toHaveAttribute('aria-label', 'Match: esp mot ger, Ej spelad, ej inmatad');
  });

  // C2 (#169, PR-spec): varje rad visar matchens status (scheduled/live/finished) som
  // lugn stödinfo med EXAKT samma svenska etiketter som formulärets status-väljare
  // (en sanning, MATCH_STATUS_LABEL). Särskilt viktigt: "Pågår"-matcher ska gå att
  // hitta i den långa listan. Status är en SKILD dimension från klar-sealen.
  it('varje rad visar matchens status-etikett (Pågår/Ej spelad/Färdigspelad)', () => {
    // Tre matcher med olika status och ENTYDIGA id:n, så vi kan slå upp varje rad.
    // En 'finished'-match KRÄVER ett resultat (Match är en diskriminerad union på
    // status), därför inget naivt spread från en scheduled fixture.
    const liveMatch: Match = { ...GROUP_B, status: 'live' }; // g-B-1
    const finishedMatch: Match = {
      ...KNOCKOUT,
      status: 'finished',
      result: { homeGoals: 1, awayGoals: 0 },
    }; // M73
    adminMatchesState.matches = [FINISHED_GROUP, liveMatch, finishedMatch];
    renderSection(officialStore({ isAdmin: true }));

    // scheduled -> "Ej spelad" (FINISHED_GROUP har status 'scheduled').
    const scheduled = rowFor('g-A-1').querySelector('[data-admin-match-status]');
    expect(scheduled).not.toBeNull();
    expect(scheduled).toHaveTextContent('Ej spelad');
    expect(scheduled).toHaveAttribute('data-status', 'scheduled');

    // live -> "Pågår" (poängen: hitta pågående match i den långa listan).
    const live = rowFor('g-B-1').querySelector('[data-admin-match-status]');
    expect(live).toHaveTextContent('Pågår');
    expect(live).toHaveAttribute('data-status', 'live');

    // finished -> "Färdigspelad".
    const finished = rowFor('M73').querySelector('[data-admin-match-status]');
    expect(finished).toHaveTextContent('Färdigspelad');
    expect(finished).toHaveAttribute('data-status', 'finished');
  });

  // C2: status-etiketten på raden är EXAKT densamma som formulärets status-väljare
  // (en sanning). Bevisar att de inte är dubbel-hårdkodade var för sig.
  it('rad-status och formulärets status-väljare delar samma etiketter (en sanning)', () => {
    const liveMatch: Match = { ...GROUP_B, status: 'live' };
    adminMatchesState.matches = [liveMatch];
    renderSection(officialStore({ isAdmin: true }));

    // Radens "Pågår".
    const rowStatus = rowFor('g-B-1').querySelector('[data-admin-match-status]');
    expect(rowStatus).toHaveTextContent('Pågår');

    // Väljarens option-etiketter (samma källa). Alla tre ska matcha exakt.
    const select = document.querySelector('[data-admin-entry-status]');
    expect(select).not.toBeNull();
    const optionTexts = Array.from(select!.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionTexts).toEqual(['Ej spelad', 'Pågår', 'Färdigspelad']);
  });

  // C2 NEGATIV-KONTROLL (befordrad topp-regel): tas status-renderingen bort ska detta
  // test rödna. Vi asserterar att status-elementet FINNS och bär etiketten; försvinner
  // renderingen faller assertionen. (Dubbleras avsiktligt skilt från happy-testet så
  // grinden är entydig: ingen status på raden -> rött.)
  it('NEGATIV-KONTROLL: status-elementet finns på raden och bär live-etiketten "Pågår"', () => {
    const liveMatch: Match = { ...GROUP_B, status: 'live' };
    adminMatchesState.matches = [liveMatch];
    renderSection(officialStore({ isAdmin: true }));

    const statusEl = rowFor('g-B-1').querySelector('[data-admin-match-status]');
    expect(statusEl).not.toBeNull();
    expect(statusEl).toHaveTextContent('Pågår');
  });

  // LIVE-uppdatering (härledd state, ingen stale): när officialResultIds växer (vad
  // saveOfficialResult -> store.results -> useOfficialResultsSync ger) blir raden grön
  // utan extra synk. Vi simulerar storens uppdatering via en re-render av mocken.
  it('raden blir grön när officialResultIds uppdateras (live, härledd ur storen)', () => {
    adminMatchesState.matches = [GROUP_B];
    adminMatchesState.officialResultIds = new Set<string>();
    const store = officialStore({ isAdmin: true });
    const { rerender } = renderSection(store);

    // Före: inget sparat resultat -> ingen markering.
    expect(rowFor('g-B-1').querySelector('[data-admin-match-entered]')).toBeNull();

    // Storen uppdateras (resultat sparat): officialResultIds innehåller nu matchen.
    adminMatchesState.officialResultIds = new Set(['g-B-1']);
    rerender(
      <RoomsStoreContext.Provider value={roomsStore()}>
        <OfficialResultsStoreContext.Provider value={store}>
          <AdminSection surface={(children) => <div>{children}</div>} />
        </OfficialResultsStoreContext.Provider>
      </RoomsStoreContext.Provider>
    );

    // Efter: samma rad är nu grön/klar-markerad (härledd, ingen stale state).
    expect(rowFor('g-B-1').querySelector('[data-admin-match-entered]')).not.toBeNull();
    expect(rowFor('g-B-1').hasAttribute('data-entered')).toBe(true);
  });
});

describe('AdminLogin, e-post-flöde (icke-admin)', () => {
  // T48 (#81): login-flödet bor bakom det hemliga fragmentet. Slå på det för dessa
  // tester så AdminLogin renderas (synlighets-villkoret är nytt, mekaniken oförändrad).
  beforeEach(() => {
    setOrganizerHash();
  });

  it('steg 1 -> steg 2: skickar koden och visar kod-fältet', async () => {
    renderSection(officialStore({ isAdmin: false }));
    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    expect(await screen.findByLabelText('Inloggningskod')).toBeInTheDocument();
  });

  it('fail loud: ett fel i steg 1 visas (role=alert), stannar på e-post-steget', async () => {
    authState.requestError = new Error('rate limit');
    renderSection(officialStore({ isAdmin: false }));
    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    expect(await screen.findByText(/rate limit/i)).toBeInTheDocument();
    // Stannar på e-post-steget (ingen kod-input).
    expect(screen.queryByLabelText('Inloggningskod')).toBeNull();
  });

  // Reviewer F1: onUpgraded får signaleras EXAKT en gång per uppgradering, även när
  // sessionen INTE blir admin (då unmountar AdminLogin aldrig och låg tidigare och
  // loopade refresh() vid varje förälder-render eftersom onUpgraded är en ny closure).
  it('signalerar uppgradering exakt en gång, ingen refresh-loop när isAdmin förblir false', async () => {
    const refresh = vi.fn(async () => {});
    const store = officialStore({ isAdmin: false, refresh });
    const { rerender } = renderSection(store);

    // Driv flödet hela vägen till 'done'.
    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    fireEvent.change(await screen.findByLabelText('Inloggningskod'), {
      target: { value: '123456' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Logga in'));
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // Tvinga om-renderingar av föräldern: AdminSection skapar en NY onUpgraded-closure
    // varje render. Utan vakten skulle effekten re-fyra och loopa refresh().
    const tree = (
      <RoomsStoreContext.Provider value={roomsStore()}>
        <OfficialResultsStoreContext.Provider value={store}>
          <AdminSection surface={(children) => <div>{children}</div>} />
        </OfficialResultsStoreContext.Provider>
      </RoomsStoreContext.Provider>
    );
    rerender(tree);
    rerender(tree);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Copilot R2: vid 'done' (uppgraderad men inte admin) ska vyn ge återkoppling, inte
  // vara tom. Bekräftelse + "logga in med en annan e-post" i stället för ett dött läge.
  it('vid done utan admin-behörighet visas bekräftelse + börja-om, inte ett tomt läge', async () => {
    renderSection(officialStore({ isAdmin: false }));

    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    fireEvent.change(await screen.findByLabelText('Inloggningskod'), {
      target: { value: '123456' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Logga in'));
    });

    expect(document.querySelector('[data-admin-login-done]')).not.toBeNull();
    expect(screen.getByText(/Inloggningen lyckades/i)).toBeInTheDocument();
    expect(document.querySelector('[data-admin-login-restart]')).not.toBeNull();
  });
});
