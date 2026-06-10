// Publik yta för den dagliga matchvyn (T7, issue #7). App och framtida vyer
// importerar härifrån så intern filstruktur kan ändras utan att bryta call-sites.

export { DailyMatchesView } from './DailyMatchesView';
export { MatchCard } from './MatchCard';
export type { MatchCardProps } from './MatchCard';
export { useDailyMatches, initialDayIndex } from './use-daily-matches';
export type { DailyMatchesData } from './use-daily-matches';
export { useTodayKey, type TodayKey } from './use-today-key';
export {
  groupMatchesByDay,
  localDateKey,
  DISPLAY_TIMEZONE,
  type MatchDay,
} from './group-matches-by-day';
export {
  computeCountdown,
  splitDuration,
  selectMatchOfTheDay,
  type CountdownState,
  type CountdownParts,
} from './countdown';
export { formatKickoffTime, formatDayHeading, formatDayShort } from './format-datetime';
export {
  stageLabel,
  teamDisplayName,
  isVenuePlaceholder,
  UNKNOWN_TEAM_LABEL,
} from './match-display';
export { hashCode, hueFromCode, huesFor } from './team-hue';
export { deriveDayTheme, type DayTheme } from './day-theme';
export { useDayTheme, type DayThemeSeam } from './use-day-theme';
