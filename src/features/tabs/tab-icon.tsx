// Flik-ikonerna (D1, #175): EN inline-SVG-glyf per flik, stroke + currentColor.
//
// VARFÖR inline-SVG (inte ett ikon-bibliotek): noll extra nedladdning, ärver
// färg/storlek via currentColor + em, och varje glyf kan rita ett aktivt
// "fyllt" läge (D2) utan en andra asset. Glyferna är medvetet ENKLA (24px-rutnät,
// rundade ändar, strokeWidth 1.75) så de läser rent vid 22-24px i flik-raden och
// hör till EN visuell familj (samma penna), inte fem olika ritstilar.
//
// AKTIV-LÄGE (D2): `active` fyller glyfens kärna med en låg-alfa accent-yta
// (currentColor på den aktiva fliken = accent), så den aktiva ikonen får TYNGD
// (inte bara färg), vilket bär aktiv-markeringen även för en färgblind användare
// tillsammans med vikt-bumpen + indikator-linjen i TabBar. aria-hidden: etiketten
// bär flikens tillgängliga namn, ikonen är ren dekor.

import type { TabIconName } from './tab-config';

interface TabIconProps {
  /** Vilken flik-glyf som ska ritas. */
  name: TabIconName;
  /** Aktiv flik: fyll glyfens kärna med en låg-alfa accent-yta (D2, extra tyngd). */
  active?: boolean;
}

/**
 * En låg-alfa fyllning för den aktiva ikonens kärna (D2). Bara på den aktiva
 * fliken, så ikonen "tänds" i stället för att bara byta färg. currentColor =
 * accent på aktiv flik (sätts i tabs.css), så fyllningen följer temat.
 */
const ACTIVE_FILL = 'color-mix(in srgb, currentColor 16%, transparent)';

/** Idag: en kalender/dag-glyf, med en markerad "idag"-prick på aktiv flik. */
function TodayGlyph({ active }: { active: boolean }) {
  return (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" fill={active ? ACTIVE_FILL : 'none'} />
      <path d="M3 9h18" />
      <path d="M8 3v3M16 3v3" />
      {/* Dagens markör: en liten ifylld prick (aktiv) eller kontur. */}
      <circle cx="12" cy="14.5" r="1.9" fill={active ? 'currentColor' : 'none'} />
    </>
  );
}

/** Tips: en spelkupong med ifyllda rader (kupong-metaforen, samma som T15). */
function CouponGlyph({ active }: { active: boolean }) {
  return (
    <>
      <path
        d="M5 3.5h14v17l-2.3-1.4-2.3 1.4-2.4-1.4-2.4 1.4-2.3-1.4L5 20.5z"
        fill={active ? ACTIVE_FILL : 'none'}
      />
      <path d="M9 9h6M9 13h6" />
    </>
  );
}

/** Topplista: tre rank-staplar (pall), mitten högst, fylld på aktiv flik. */
function LeaderboardGlyph({ active }: { active: boolean }) {
  return (
    <>
      <rect x="3.5" y="12" width="4.5" height="8.5" rx="1" fill={active ? ACTIVE_FILL : 'none'} />
      <rect x="9.75" y="6.5" width="4.5" height="14" rx="1" fill={active ? ACTIVE_FILL : 'none'} />
      <rect x="16" y="9.5" width="4.5" height="11" rx="1" fill={active ? ACTIVE_FILL : 'none'} />
    </>
  );
}

/** Turnering: en mästerskaps-pokal (turneringen + dess slutspel). */
function TournamentGlyph({ active }: { active: boolean }) {
  return (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0z" fill={active ? ACTIVE_FILL : 'none'} />
      <path d="M7 5.5H4.5V7a3 3 0 0 0 3 3M17 5.5h2.5V7a3 3 0 0 1-3 3" />
      <path d="M12 13v3.5" />
      <path d="M8.5 20.5h7M9.5 20.5l.6-4h3.8l.6 4" />
    </>
  );
}

/** Mer: den universella tre-prickars-meny (lugn samlingsplats). */
function MoreGlyph({ active }: { active: boolean }) {
  const fill = active ? 'currentColor' : 'none';
  return (
    <>
      <circle cx="5.5" cy="12" r="1.7" fill={fill} />
      <circle cx="12" cy="12" r="1.7" fill={fill} />
      <circle cx="18.5" cy="12" r="1.7" fill={fill} />
    </>
  );
}

const GLYPHS: Record<TabIconName, (props: { active: boolean }) => React.ReactElement> = {
  today: TodayGlyph,
  coupon: CouponGlyph,
  leaderboard: LeaderboardGlyph,
  tournament: TournamentGlyph,
  more: MoreGlyph,
};

export function TabIcon({ name, active = false }: TabIconProps) {
  const Glyph = GLYPHS[name];
  return (
    <svg
      className="vm-tab-icon"
      data-tab-icon={name}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Glyph active={active} />
    </svg>
  );
}
