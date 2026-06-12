// FAVORITLAGS-VÄLJAREN (T23, #23). FUNKTIONELL + a11y-korrekt presentations-komponent
// (senior-dev-lager); PREMIUM-FINISH (design-frontend) ovanpå data-attribut-seamen.
//
// VARFÖR ett <select> (inte 48 radio-knappar): 48 lag är en lång lista där ett
// inbyggt <select> ger inhemsk tangentbords-/skärmläsar-/mobil-hjul-navigering utan
// egen ARIA-mekanik (KISS + a11y, samma val som grupp-/bracket-tipsens lagväljare).
// Komponenten är KONTROLLERAD (favoriteTeamId + onSelect/onClear injiceras), så den är
// data-OBEROENDE och testbar; favoritlags-storen + lag-listan wiras in av call-sitet.
//
// GENERISKT (acceptanskriterium): inget hårdkodat Sverige. Listan är lag-listan som
// skickas in (de 48 lagen), sorterad alfabetiskt på svenskt visningsnamn för snabb
// avsökning. Tomt val = avpinna (rensa favoritlaget).

import { useId, useMemo } from 'react';
import type { Team } from '../../domain/types';
import { teamShortName } from '../../domain/team-name';
import { TeamFlag } from '../daily/TeamFlag';

export interface FavoriteTeamControlProps {
  /** Lag-listan (de 48 lagen) att välja bland. Sorteras alfabetiskt för visning. */
  teams: readonly Team[];
  /** Det pinnade favoritlagets id (Team.id), eller null (inget pinnat). */
  favoriteTeamId: string | null;
  /** Pinna (eller byta) favoritlag. */
  onSelect: (teamId: string) => void;
  /** Avpinna favoritlaget (rensa). */
  onClear: () => void;
}

/** Tomt sentinel-värde i <select> = "inget favoritlag" (mappar till onClear). */
const NONE_VALUE = '';

export function FavoriteTeamControl({
  teams,
  favoriteTeamId,
  onSelect,
  onClear,
}: FavoriteTeamControlProps) {
  const selectId = useId();

  // Alfabetisk ordning på svenskt visningsnamn (stabil, svensk locale) så listan är
  // snabb att skanna. En kopia (teams är readonly), sorteras inte in-place.
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [teams]
  );

  // Det aktuellt valda laget (för flagg-/namn-förhandsvisningen bredvid väljaren).
  const selected = useMemo(
    () => (favoriteTeamId === null ? null : (teams.find((t) => t.id === favoriteTeamId) ?? null)),
    [teams, favoriteTeamId]
  );

  function handleChange(value: string) {
    if (value === NONE_VALUE) {
      onClear();
      return;
    }
    onSelect(value);
  }

  return (
    <div data-favorite-team-control="" className="flex flex-col gap-2">
      <label htmlFor={selectId} className="font-display text-sm font-semibold">
        Ditt favoritlag
      </label>
      <p className="text-xs text-fg-muted">
        Pinna ett lag så lyfts dess matcher fram i listan. Helt valfritt, och bara på den här
        enheten.
      </p>

      <div className="flex min-w-0 items-center gap-2.5">
        {/* Förhandsvisning: laget-emblemet för det pinnade laget (dekor, aria-hidden),
            eller en neutral platshållar-disc när inget är pinnat. Namnet bär identiteten
            i select:en + dess label, så discen behöver inte läsas upp. */}
        {selected !== null ? (
          <TeamFlag code={selected.code} />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-dashed border-border text-xs text-fg-muted"
          >
            ☆
          </span>
        )}

        {/* min-w-0 på rad + select så ett <select> kan krympa under sin längsta option
            (intrinsisk min-content) i stället för att spränga kolumnen på smal skärm. */}
        <select
          id={selectId}
          data-favorite-team-select=""
          value={favoriteTeamId ?? NONE_VALUE}
          onChange={(event) => handleChange(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-fg shadow-[var(--vm-shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value={NONE_VALUE}>Inget favoritlag</option>
          {sortedTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {teamShortName(team)}
            </option>
          ))}
        </select>

        {/* Avpinna-knappen: bara synlig när ett lag ÄR pinnat (annars finns inget att
            rensa). Ett rent <button> med tillgängligt namn; select:en kan också nollas
            via "Inget favoritlag", knappen är en snabbare väg. */}
        {favoriteTeamId !== null ? (
          <button
            type="button"
            data-favorite-team-clear=""
            onClick={onClear}
            className="shrink-0 rounded-pill border border-border px-3 py-2 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Ta bort
          </button>
        ) : null}
      </div>
    </div>
  );
}
