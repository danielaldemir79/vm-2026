// Admin-facit-inmatning (T42, #72): arrangören (Daniel) matar in de OFFICIELLA
// matchresultaten, GLOBALT (gäller alla rum/användare).
//
// Den FUNKTIONELLA + tillgängliga basen: välj en match, ange mål (+ status, +
// straffar för avgjort slutspel), spara till global facit. Återanvänder T6:s rena
// validering (validateResultEntry) så samma regler gäller som den lokala
// inmatningen (icke-negativa heltal, status<->resultat, FIFA Art. 14-straffar).
// Skrivningen går via OfficialResultsProvider.saveOfficialResult, och RLS
// (is_app_admin) är det RIKTIGA skyddet (denna vy visas bara för admins, men en
// kringgången klient nekas ändå av servern).
//
// Premium-design (arena-estetiken, en rikare match-lista) lämnas till T42b, samma
// arbetsdelning som T15/T16. Detta är arrangörens verktyg, inte en deltagar-yta.

import { useId, useMemo, useState, type FormEvent } from 'react';
import type { Match, MatchStatus } from '../../domain/types';
import { validateResultEntry, type ResultEntry } from '../results';
import { formatKickoffTime, formatDayShort, localDateKey, stageLabel } from '../daily';
import { useOfficialResultsStore } from '../official-results';
import { useAdminMatches } from './use-admin-matches';
import { AdminStats } from './AdminStats';

/**
 * Svenska etiketter för matchens status (T80, #169). EN SANNING: både status-väljaren
 * i formuläret (<select data-admin-entry-status>) OCH stödinfo-texten på varje match-rad
 * läser härifrån, så etiketterna aldrig glider isär (en match heter "Pågår" på exakt ett
 * sätt i hela vyn). Etiketterna är arrangörens svenska för de tre MatchStatus-värdena.
 */
const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: 'Ej spelad',
  live: 'Pågår',
  finished: 'Färdigspelad',
};

/** Etiketten för en matchs status (slår upp i MATCH_STATUS_LABEL, en sanning). */
function matchStatusLabel(status: MatchStatus): string {
  return MATCH_STATUS_LABEL[status];
}

/** Tolka ett inmatningsfält till number | null (tomt -> null, så validering kan se "tomt"). */
function toGoal(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * KLAR-texten för en rad med ett sparat officiellt resultat (T80, #169). Bär
 * resultatet när matchen är 'finished' (t.ex. "Klar 2-1"), annars bara "Klar"
 * (ett officiellt resultat kan sparas med status live/scheduled, då finns inget
 * mål-resultat att visa). Den TEXTUELLA delen av den färg-oberoende klar-markeringen
 * (WCAG 1.4.1): grön + bock-ikon räcker inte ensamt, texten bär samma information.
 */
function enteredLabel(match: Match): string {
  if (match.status === 'finished') {
    return `Klar ${match.result.homeGoals}-${match.result.awayGoals}`;
  }
  return 'Klar';
}

interface AdminMatchRowProps {
  match: Match;
  teamName: (id: string | null) => string;
  selected: boolean;
  /** Har matchen ett SPARAT officiellt resultat? (auktoritativ signal, se use-admin-matches.) */
  entered: boolean;
  onSelect: (id: string) => void;
}

/**
 * En rad i den synliga match-listan (T80, #169): en riktig <button> (tangentbords-
 * navigerbar) som väljer matchen. `aria-pressed` markerar den valda raden (toggle-
 * knapp-mönstret, hjälpmedel läser upp vald/ej vald). En rad med sparat officiellt
 * resultat bär en grön KLAR-markering MED bock-ikon + text (aldrig färg ensam,
 * WCAG 1.4.1). Stabila data-attribut (data-admin-match-row, data-selected,
 * data-entered) så design-frontend poler utseendet via .vm-admin-match-row i
 * tokens.css (§23, fyra entydiga lägen + AA-mätta tinter) utan att röra strukturen.
 *
 * VISUELL FINISH (T80b): de fyra lägena (vald x klar) lever i SKILDA kanaler så de
 * aldrig förväxlas: accent-RING = vald (den jag redigerar nu), grön vänster-list +
 * grön KLAR-seal = klar (facit sparat). En rad kan vara båda, då ligger ringen
 * utanpå den gröna tinten. Färg-, tint- och seal-recepten + alla uppmätta kontrast-
 * tal bor i tokens.css §23 (en sanning per värde). Fokus-ringen är appens etablerade
 * focus-visible-accent-ring (samma recept som övriga interaktiva ytor).
 */
function AdminMatchRow({ match, teamName, selected, entered, onSelect }: AdminMatchRowProps) {
  const day = formatDayShort(localDateKey(match.kickoff));
  const time = formatKickoffTime(match.kickoff);
  // Matchens status (scheduled/live/finished) som svensk etikett. SKILD dimension
  // från klar-sealen nedan: en match kan vara "Pågår" OCH ha ett inmatat live-resultat
  // (då både "Pågår" här och grön KLAR-seal). Stödinfo på raden, så Daniel ser vilka
  // matcher som rullar nu i den långa listan (C2, #169). Samma etikett som formulärets
  // status-väljare (matchStatusLabel, en sanning).
  const status = matchStatusLabel(match.status);
  const isLive = match.status === 'live';
  // SJÄLV-beskrivande tillgängligt namn per rad (T80, Copilot C1): listans
  // aria-labelledby ("Match") namnger BARA <ul>, så när man tabbar mellan rad-
  // knapparna kan ett hjälpmedel tappa kontrollkontexten. Ett explicit aria-label
  // per knapp gör varje rad ensamt begriplig: "Match: <hemma> mot <borta>" +
  // status-etiketten (Pågår/Ej spelad/Färdigspelad) + klar-status (resultatet om
  // sparat, annars "ej inmatad"). De synliga lagnamnen ingår i namnet, så aria-label
  // och synlig text inte motsäger varandra (WCAG 2.5.3 label-in-name); status och
  // klar-statusen läses upp (1.4.1, betydelsen bärs av text, inte färg).
  const home = teamName(match.homeTeamId);
  const away = teamName(match.awayTeamId);
  const enteredText = entered ? enteredLabel(match) : 'ej inmatad';
  return (
    <button
      type="button"
      data-admin-match-row=""
      data-match-id={match.id}
      data-selected={selected ? '' : undefined}
      data-entered={entered ? '' : undefined}
      aria-pressed={selected}
      aria-label={`Match: ${home} mot ${away}, ${status}, ${enteredText}`}
      onClick={() => onSelect(match.id)}
      className="vm-admin-match-row flex w-full items-center justify-between gap-3 rounded-input px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {/* SAMMA härledda lagnamn som aria-label läser (home/away ovan), inte ett
              nytt teamName-anrop: en sanning, så synlig text och tillgängligt namn
              garanterat aldrig glider isär (WCAG 2.5.3 label-in-name) (C3, #169). */}
          {home} - {away}
        </span>
        <span className="text-xs text-fg-muted">
          {stageLabel(match)} · {day} {time} ·{' '}
          {/* Matchens status som lugn stödinfo (samma stödinfo-stil som stage/dag).
              "Pågår"/live görs urskiljbart UTAN att luta på färg ensam (WCAG 1.4.1):
              ORDET "Pågår" bär betydelsen och får extra vikt (font-semibold) + en lugn
              accent-ton som FÖRSTÄRKNING, aldrig den enda signalen. Skild från klar-
              sealen (en match kan vara Pågår + Klar samtidigt). */}
          <span
            data-admin-match-status=""
            data-status={match.status}
            className={isLive ? 'font-semibold text-accent' : undefined}
          >
            {status}
          </span>
        </span>
      </span>
      {entered ? (
        // Grön KLAR-seal: bock-ikon (dekorativ, aria-hidden) + text på en SOLID
        // success-yta med mätt ink (.vm-admin-match-entered, §23). Texten bär
        // informationen, så markeringen aldrig vilar på färg ensam (WCAG 1.4.1),
        // och ink-på-solid håller AA oavsett radens tint bakom (opak bricka).
        <span
          data-admin-match-entered=""
          className="vm-admin-match-entered inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
          {enteredLabel(match)}
        </span>
      ) : null}
    </button>
  );
}

export function AdminResultEntry() {
  const store = useOfficialResultsStore();
  const data = useAdminMatches();

  const [selectedId, setSelectedId] = useState<string>('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [status, setStatus] = useState<MatchStatus>('finished');
  const [penHome, setPenHome] = useState('');
  const [penAway, setPenAway] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const listLabelId = useId();
  const homeId = useId();
  const awayId = useId();
  const statusId = useId();
  const errorId = useId();

  // Bara matcher där BÅDA lag är kända kan få ett resultat inmatat (gissa aldrig
  // laget; ett slutspel innan seedningen har TBD-lag och kan inte avgöras).
  const entriable = useMemo(
    () => data.matches.filter((m) => m.homeTeamId !== null && m.awayTeamId !== null),
    [data.matches]
  );

  const selected: Match | undefined = useMemo(
    () => entriable.find((m) => m.id === selectedId),
    [entriable, selectedId]
  );

  const isKnockout = selected ? selected.stage !== 'group' : false;
  // Lika-ställning räknas på PARSADE heltal, inte strängar (Copilot R1): "1" och "01"
  // är samma mål men olika strängar, och en sträng-jämförelse skulle då dölja straff-
  // fälten samtidigt som validateResultEntry KRÄVER straffar vid lika i slutspel, ett
  // läge där spara aldrig går igenom. toGoal ger samma parsning som submit använder.
  const homeGoal = toGoal(home);
  const awayGoal = toGoal(away);
  const isTie =
    homeGoal !== null &&
    awayGoal !== null &&
    Number.isInteger(homeGoal) &&
    Number.isInteger(awayGoal) &&
    homeGoal === awayGoal;
  const showPenalties = isKnockout && status === 'finished' && isTie;

  // Välj en match ur listan. Samma state-effekt som dropdownens onChange hade
  // (sätt selectedId + rensa fel/bekräftelse), så formuläret nedanför speglar valet.
  const selectMatch = (id: string) => {
    setSelectedId(id);
    setErrors([]);
    setSavedMsg(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSavedMsg(null);
    if (!selected) {
      setErrors(['Välj en match först.']);
      return;
    }
    const entry: ResultEntry = {
      homeGoals: toGoal(home),
      awayGoals: toGoal(away),
      status,
      penalties: showPenalties ? { homeGoals: toGoal(penHome), awayGoals: toGoal(penAway) } : null,
    };
    // Samma rena validering som den lokala inmatningen (T6), med matchens stage.
    const result = validateResultEntry(selected.status, entry, selected.stage);
    if (!result.ok) {
      setErrors(result.errors.map((err) => err.message));
      return;
    }
    setErrors([]);
    // Skriv till GLOBAL facit. RLS (is_app_admin) skyddar; ett avslag fail-loud:ar.
    void store
      .saveOfficialResult({
        matchId: selected.id,
        homeGoals: entry.homeGoals ?? 0,
        awayGoals: entry.awayGoals ?? 0,
        penalties:
          entry.penalties &&
          entry.penalties.homeGoals !== null &&
          entry.penalties.awayGoals !== null
            ? { homeGoals: entry.penalties.homeGoals, awayGoals: entry.penalties.awayGoals }
            : null,
        status,
      })
      .then(() => {
        setSavedMsg('Officiellt resultat sparat. Det gäller nu för alla rum.');
      })
      .catch((err: unknown) => {
        setErrors([err instanceof Error ? err.message : 'Kunde inte spara resultatet.']);
      });
  };

  if (data.status === 'loading') {
    return (
      <p role="status" data-admin-entry-loading="">
        Laddar matchplanen…
      </p>
    );
  }
  if (data.status === 'error') {
    return (
      <p role="alert" data-admin-entry-error="">
        {data.error}
      </p>
    );
  }

  return (
    // Arrangörs-ytan: facit-inmatningen + ligastatistiken (T45, #76). Båda bakom
    // samma admin-gate (AdminSection renderar bara detta för official.isAdmin), och
    // AdminStats datakälla är dessutom server-gatad (is_app_admin-RPC:er).
    <div data-admin-tools="" className="flex flex-col gap-8">
      <div data-admin-entry="" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-semibold">Mata in officiella resultat</h3>
          <p className="text-sm text-fg-muted">
            Du är inloggad som arrangör. Resultaten du sparar här blir det officiella facit för alla
            rum och alla deltagare.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          {/* SYNLIG, scrollbar match-lista (T80, #169): Daniels uttryckliga val (inte
              en dropdown), så han ser var i den långa listan (104 matcher) han är.
              Varje rad är en riktig <button> som väljer matchen (tangentbords-navigerbar,
              vald rad markerad med aria-pressed). En rad med ett SPARAT officiellt resultat
              får en grön KLAR-markering MED bock-ikon + text (resultatet), aldrig färg
              ensam (WCAG 1.4.1). Markeringen är HÄRLEDD ur data.officialResultIds (samma
              sanning som vävs in), så den uppdateras direkt när ett resultat sparas. */}
          <div className="flex flex-col gap-1">
            <span id={listLabelId} className="text-sm font-medium">
              Match
            </span>
            <ul
              data-admin-entry-match-list=""
              aria-labelledby={listLabelId}
              className="vm-admin-match-list flex max-h-80 flex-col gap-1 overflow-y-auto rounded-input border border-border bg-surface p-1"
            >
              {entriable.map((m) => (
                <li key={m.id}>
                  <AdminMatchRow
                    match={m}
                    teamName={data.teamName}
                    selected={m.id === selectedId}
                    entered={data.officialResultIds.has(m.id)}
                    onSelect={selectMatch}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={homeId} className="text-sm font-medium">
                Mål hemma
              </label>
              <input
                id={homeId}
                type="number"
                min={0}
                inputMode="numeric"
                value={home}
                data-admin-entry-home=""
                onChange={(e) => setHome(e.target.value)}
                className="rounded-input border border-border bg-surface px-3 py-2"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={awayId} className="text-sm font-medium">
                Mål borta
              </label>
              <input
                id={awayId}
                type="number"
                min={0}
                inputMode="numeric"
                value={away}
                data-admin-entry-away=""
                onChange={(e) => setAway(e.target.value)}
                className="rounded-input border border-border bg-surface px-3 py-2"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={statusId} className="text-sm font-medium">
              Status
            </label>
            <select
              id={statusId}
              value={status}
              data-admin-entry-status=""
              onChange={(e) => setStatus(e.target.value as MatchStatus)}
              className="rounded-input border border-border bg-surface px-3 py-2"
            >
              {/* Etiketterna kommer från MATCH_STATUS_LABEL (en sanning), så väljaren
                  och stödinfo-texten på match-raderna aldrig glider isär (C2, #169). */}
              <option value="scheduled">{matchStatusLabel('scheduled')}</option>
              <option value="live">{matchStatusLabel('live')}</option>
              <option value="finished">{matchStatusLabel('finished')}</option>
            </select>
          </div>

          {showPenalties ? (
            <div className="flex gap-3" data-admin-entry-penalties="">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-sm font-medium">
                  Straffar hemma
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={penHome}
                    onChange={(e) => setPenHome(e.target.value)}
                    className="mt-1 w-full rounded-input border border-border bg-surface px-3 py-2"
                  />
                </label>
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-sm font-medium">
                  Straffar borta
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={penAway}
                    onChange={(e) => setPenAway(e.target.value)}
                    className="mt-1 w-full rounded-input border border-border bg-surface px-3 py-2"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {errors.length > 0 ? (
            <ul
              id={errorId}
              role="alert"
              data-admin-entry-errors=""
              className="text-sm text-danger"
            >
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}

          {savedMsg ? (
            <p role="status" data-admin-entry-saved="" className="text-sm text-success">
              {savedMsg}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={selectedId === ''}
            data-admin-entry-save=""
            className="self-start rounded-pill bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            Spara officiellt resultat
          </button>
        </form>
      </div>

      {/* Ligastatistiken (T45, #76): alla rum + medlemmar + vem tippar bäst. */}
      <AdminStats />
    </div>
  );
}
