// Publik yta för den rika matchvyns drill-in (T86, #178). App + matchrader importerar
// härifrån så intern struktur kan ändras utan att bryta call-sites.

export { MatchDetailProvider } from './MatchDetailProvider';
export { MatchDetailView, MatchDetailTrigger } from './MatchDetailView';
export {
  useMatchDetail,
  MatchDetailContext,
  type MatchDetailContextValue,
} from './match-detail-context';
export { buildTimeline, type TimelineEntry, type TimelineSide } from './match-timeline-model';
