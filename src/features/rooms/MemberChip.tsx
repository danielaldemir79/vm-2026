// En medlems monogram-avatar + namn-chip (lyft ur RoomPanel i T94, #187).
//
// VARFÖR en egen fil (PRINCIPLES §2, en fil ett ansvar): chip:en delas nu av
// medlems-RUTNÄTET (MemberGrid) , den enda ytan som renderar medlemmar , och var
// tidigare inbäddad i RoomPanel. Genom EN källa kan avatar-/självmarkerings-
// semantiken aldrig drifta mellan vyer (DRY).
//
// IDENTITET + KONTRAST: avatar-färgen härleds STABILT ur user-id (member-avatar.ts:
// samma hash som lag-färgerna), så samma person känns igen på färgen i varje rendering.
// Färgen är DEKOR (aria-hidden); INITIALERNA + NAMNET bär identiteten (färg-oberoende,
// a11y). Hue:n sätts som CSS-variabel så rooms.css kan klampa lightness PER hue och
// hålla ink-kontrasten AA i båda teman (kontrast-vakten, mätt över hela hue-spannet).
//
// "DU"-MARKERINGEN (north-star §5, återanvänd överallt): den egna medlemmen får en
// accent-tonad kant (rooms.css [data-self='true']) + texten "(du)", så man hittar sig
// själv direkt , buret av FORM + TEXT, inte enbart färg.

import { type CSSProperties } from 'react';
import { avatarHueFromId, initialsFromName } from './member-avatar';

export interface MemberChipProps {
  userId: string;
  displayName: string;
  isSelf: boolean;
  /**
   * Radens 1-baserade position + listans totala storlek, för list-ARIA i rutnätet
   * (aria-posinset/-setsize), så skärmläsaren vet "3 av 43" även i ett grid. Utelämnas
   * när chip:en inte ligger i en räknad lista (då sätts inga set-attribut).
   */
  posInSet?: number;
  setSize?: number;
}

/**
 * En medlems-chip: monogram-avatar (dekor) + namn (+ "(du)" för den egna raden).
 * Namnet truncar (ellipsis) så cellen håller sin bredd i det linjerade rutnätet.
 */
export function MemberChip({ userId, displayName, isSelf, posInSet, setSize }: MemberChipProps) {
  const hue = avatarHueFromId(userId);
  const initials = initialsFromName(displayName);
  return (
    <li
      data-rooms-member
      data-rooms-member-self={isSelf}
      // role="listitem" + set-attributen bär listans storlek åt skärmläsaren (rutnätets
      // <ul> nollar ibland list-semantiken i Safari; role återställer den på raden).
      role="listitem"
      aria-setsize={setSize}
      aria-posinset={posInSet}
      className="vm-rooms-member flex min-w-0 items-center gap-2 rounded-pill border border-border bg-surface py-1 pl-1 pr-3 text-sm"
      data-self={isSelf}
    >
      <span
        aria-hidden="true"
        className="vm-rooms-avatar flex h-7 w-7 shrink-0 items-center justify-center rounded-pill font-display text-xs font-bold leading-none"
        style={{ '--vm-avatar-hue': hue } as CSSProperties}
      >
        {initials}
      </span>
      {/* min-w-0 + truncate: namnet klipps med ellipsis i stället för att spränga cellen,
          så ALLA celler håller samma bredd och rutnätets rader ligger i linje. */}
      <span className="min-w-0 truncate">
        {displayName}
        {isSelf && <span className="text-fg-muted"> (du)</span>}
      </span>
    </li>
  );
}
