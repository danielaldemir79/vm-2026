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
import { useOfficialResultsStore } from '../official-results';
import { useAdminMatches } from './use-admin-matches';
import { AdminStats } from './AdminStats';

/** Tolka ett inmatningsfält till number | null (tomt -> null, så validering kan se "tomt"). */
function toGoal(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
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

  const selectId = useId();
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
          <div className="flex flex-col gap-1">
            <label htmlFor={selectId} className="text-sm font-medium">
              Match
            </label>
            <select
              id={selectId}
              value={selectedId}
              data-admin-entry-match=""
              onChange={(e) => {
                setSelectedId(e.target.value);
                setErrors([]);
                setSavedMsg(null);
              }}
              className="rounded-input border border-border bg-surface px-3 py-2"
            >
              <option value="">Välj en match…</option>
              {entriable.map((m) => (
                <option key={m.id} value={m.id}>
                  {data.teamName(m.homeTeamId)} - {data.teamName(m.awayTeamId)}
                  {m.status === 'finished' ? ' (inmatad)' : ''}
                </option>
              ))}
            </select>
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
              <option value="scheduled">Ej spelad</option>
              <option value="live">Pågår</option>
              <option value="finished">Färdigspelad</option>
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
