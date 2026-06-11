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
// DESIGN-FINISH (design-frontend): stabila roller + data-attribut bevaras.

import { useMemo } from 'react';
import { useGroupPredictionsStore } from './group-predictions-context';
import { useGroupPredictableData } from './use-group-predictable-data';
import { selectPredictableGroups } from './group-predictable-data';
import { GroupPredictionForm } from './GroupPredictionForm';
import { useDeadlineTick } from '../predictions/use-deadline-tick';

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

      {/* UTAN aktivt rum: grupp-tips är per rum, peka mot rums-flödet. */}
      {!store.enabled ? (
        <div
          data-group-predictions-no-room=""
          className="mt-4 flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_6%,var(--color-surface))] p-4 sm:p-5"
        >
          <div className="min-w-0">
            <p className="m-0 font-display text-sm font-semibold text-fg">
              Gå med i ett rum för att tippa grupperna
            </p>
            <p className="m-0 mt-1 text-sm text-fg-muted">
              Grupp-tipsen är per rum, du och kompisarna gissar gruppvinnare och tvåor före
              gruppspelet och jämför sen. Skapa eller gå med i ett rum ovanför.
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
          className="mt-5 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2"
        >
          {predictableGroups.map(({ groupId, teams: groupTeams, locked }) => {
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
                  onSubmit={async (gid, winnerCode, runnerUpCode) => {
                    await store.saveGroupPrediction({
                      groupId: gid,
                      winnerTeamId: winnerCode,
                      runnerUpTeamId: runnerUpCode,
                    });
                  }}
                />
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
