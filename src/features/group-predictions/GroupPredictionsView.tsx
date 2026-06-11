// GRUPP-TIPS-VYN (FUNKTIONELLT + a11y-lager, T16, #16). Systerfil till
// PredictionsView.tsx (T15).
//
// FOKUS (senior-devs lager): rätt grupper, rätt lägen, tillgänglig struktur. Visar
// ett grupp-tips-formulär (1:a + 2:a) per grupp A..L i RUM-läge, ett tydligt LÅST-
// läge efter gruppens första match, och mitt tips synligt. UTAN ett aktivt rum visas
// "gå med i ett rum för att tippa" (grupp-tips är per rum).
//
// DEADLINE: per grupp (gruppens första match), inte ett globalt lås, så grupp L kan
// tippas efter att grupp A börjat. Härlett för VISNING; servern (RLS) är det riktiga
// låset. Minut-tick (useDeadlineTick) så ett lås flippar utan omladdning (en grupp
// startar mitt på dagen, useTodayKey vore för grov, T15 C1-lärdomen).
//
// VISUELL DESIGN (design-frontend, T16): VM-poolens samlade kupong-vy. Rubriken bär
// pool-identiteten (guld-eyebrow + motiverande öppen-räknare), grupp-korten är en
// responsiv kupong-grid (1 kolumn på smal mobil -> 2 -> 3 på bred skärm), och
// "gå med i ett rum"-läget är en INBJUDANDE guld-tonad port (kupong-ikon + tydlig
// väg framåt), inte en grå rad. Stabila roller + data-attribut bevaras.

import { useMemo } from 'react';
import { useGroupPredictionsStore } from './group-predictions-context';
import { useGroupPredictableData } from './use-group-predictable-data';
import { selectPredictableGroups } from './group-predictable-data';
import { GroupPredictionForm } from './GroupPredictionForm';
import { useDeadlineTick } from '../predictions/use-deadline-tick';
import { teamCode } from '../../domain/team-code';
// SIMULERAD slutspelsbild ur tipsen (T51, #88): direkt under kupongerna ser man
// hur sextondelen (+ vägen mot finalen) blir UR de tippade ettorna/tvåorna.
// Ligger inuti GroupPredictionsProvider (samma store), så den läser mina tips.
import { TipsBracketView } from '../simulation';

export interface GroupPredictionsViewProps {
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbart "nu" (testbarhet) för låst-härledningen, default = nuet. */
  now?: Date;
}

export function GroupPredictionsView({
  env = import.meta.env,
  now = new Date(),
}: GroupPredictionsViewProps) {
  const store = useGroupPredictionsStore();
  const { status, groups, teams, matches, error } = useGroupPredictableData(env);

  // Deadline-medveten re-render (samma minut-tick som T15:s tipsvy): låst-statusen
  // (now >= gruppens första match) räknas om utan manuell omladdning.
  const evalNow = useDeadlineTick(now);

  // evalNow ingår i deps (det är poängen): räkna om när tiden passerar en gruppstart.
  const predictableGroups = useMemo(
    () => selectPredictableGroups(groups, teams, matches, evalNow),
    [groups, teams, matches, evalNow]
  );

  // Hur många grupper är ÄNNU öppna att tippa? Motiverande räknare (samma anda som T15).
  const openCount = useMemo(
    () => predictableGroups.filter((g) => !g.locked).length,
    [predictableGroups]
  );

  const ready = store.enabled && status === 'ready' && store.status === 'ready';

  return (
    <section aria-labelledby="group-predictions-heading" data-group-predictions-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          VM-poolen
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            id="group-predictions-heading"
            className="font-display text-xl font-semibold sm:text-2xl"
          >
            Tippa grupperna
          </h2>
          {ready && openCount > 0 ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_8%,transparent)] px-2.5 py-0.5 font-display text-xs font-semibold text-fg-muted"
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-pill"
                style={{ backgroundColor: 'var(--vm-gold)' }}
              />
              {openCount} {openCount === 1 ? 'grupp öppen' : 'grupper öppna'} att tippa
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Gissa vem som vinner gruppen och vem som blir tvåa, före gruppspelet. Rätt vinnare ger 3
          poäng, rätt tvåa 2 poäng. Du och kompisarna tippar blint, sen jämför ni.
        </p>
      </header>

      {/* UTAN aktivt rum (taskens punkt 3): grupp-tips är per rum. En INBJUDANDE
          guld-tonad port med en kupong-ikon + tydlig väg framåt, inte en grå rad,
          den ska kännas som en inbjudan att vara med och tippa, inte ett fel. */}
      {!store.enabled ? (
        <div
          data-group-predictions-no-room=""
          className="mt-4 flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_6%,var(--color-surface))] p-4 sm:p-5"
        >
          {/* Guld-tonad kupong-ikon i en rund bricka. Ikon-färgen är --color-warning
              (AA-säker guld-text-ton), tinten är dekor. aria-hidden, rubriken bär text. */}
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-[color-mix(in_srgb,var(--vm-gold)_14%,transparent)] text-warning"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 5.5A1 1 0 0 1 3 4.5h10a1 1 0 0 1 1 1v1a1.5 1.5 0 0 0 0 3v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1.5 1.5 0 0 0 0-3z" />
              <path d="M10 4.75v6.5" strokeDasharray="1.4 1.4" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="m-0 font-display text-sm font-semibold text-fg">
              Gå med i ett rum för att tippa grupperna
            </p>
            <p className="m-0 mt-1 text-sm text-fg-muted">
              Grupp-tipsen är per rum, du och kompisarna gissar gruppvinnare och tvåor före
              gruppspelet och jämför sen. Skapa eller gå med i ett rum ovanför, så öppnar kupongerna
              här.
            </p>
          </div>
        </div>
      ) : null}

      {/* Fel-väg (fail loud). */}
      {store.enabled && (status === 'error' || store.status === 'error') ? (
        <p
          role="alert"
          data-group-predictions-error=""
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {error ?? store.error ?? 'Något gick fel när grupperna skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning. */}
      {store.enabled && (status === 'loading' || store.status === 'loading') ? (
        <p role="status" data-group-predictions-loading="" className="mt-4 text-sm text-fg-muted">
          Laddar grupper att tippa…
        </p>
      ) : null}

      {/* Grupp-listan: ett kort per grupp A..L, öppna + låsta synliga (med låst-etikett). */}
      {ready ? (
        <ol
          data-group-predictions-list=""
          className="mt-5 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
        >
          {predictableGroups.map(({ groupId, teams: groupTeams, locked, deadlineIso }) => {
            const mine = store.myGroupPredictions.get(groupId) ?? null;
            return (
              <li key={groupId}>
                <GroupPredictionForm
                  groupId={groupId}
                  teams={groupTeams}
                  current={
                    mine
                      ? { winnerCode: mine.winnerTeamId, runnerUpCode: mine.runnerUpTeamId }
                      : null
                  }
                  locked={locked}
                  deadlineIso={deadlineIso}
                  now={evalNow}
                  onSubmit={async (gid, winnerCode, runnerUpCode) => {
                    // Brandning vid UI-gränsen: formulärets värden kommer från
                    // <option value={t.code}> (versal FIFA-code). teamCode() validerar
                    // och låser identiteten, så API:t garanterat får en code (C1+C2).
                    await store.saveGroupPrediction({
                      groupId: gid,
                      winnerTeamId: teamCode(winnerCode),
                      runnerUpTeamId: teamCode(runnerUpCode),
                    });
                  }}
                />
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* SIMULERAD slutspelsbild ur tipsen (T51, #88, Daniels live-feedback): så
          snart grupp-tipsen är laddade ritar vi upp hur slutspelet skulle kunna se
          ut ur tippade ettor/tvåor (vilka som möts i sextondelen + vägen vidare).
          En ren härledd vy: den läser mina tips ur SAMMA store och skriver aldrig,
          så de riktiga resultaten/facit rörs inte. Tydligt märkt SIMULERING; de
          åtta bästa treorna lämnas öppna (gissas aldrig, FIFA-seedning ur riktiga
          resultat). Visar en uppmaning tills minst en grupp är tippad. */}
      {ready ? (
        <div data-tips-bracket-section="" className="mt-8">
          <TipsBracketView env={env} />
        </div>
      ) : null}
    </section>
  );
}
