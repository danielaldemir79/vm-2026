// Publik yta för turnerings-statistiken (T87 skytteliga; T88 turneringsstatistik bygger
// vidare på samma cross-match-hook). App och framtida vyer importerar HÄRIFRÅN, så intern
// filstruktur kan ändras utan att bryta call-sites.

export { ScorerTableView } from './ScorerTableView';

// Den ÅTERANVÄNDBARA cross-match-events-hooken (T88 lutar sig på denna): hämtar events för
// ALLA matcher (smalt SELECT) och håller dem near-live via T91-spine:n.
export {
  useCrossMatchEvents,
  CROSS_MATCH_POLL_INTERVAL_MS,
  type CrossMatchEventsResult,
  type CrossMatchEventsStatus,
} from './use-cross-match-events';

// Den rena aggregeringen (skytteliga + assist-liga) , delbar om en annan vy vill räkna samma.
export {
  aggregateScoring,
  type TournamentScoring,
  type ScorerRow,
  type AssistRow,
} from './scorer-table';
