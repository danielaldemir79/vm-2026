// Publik yta för "Min sida"-profilen (T97). App importerar härifrån så intern filstruktur
// kan ändras utan att bryta call-sites.

export { MinSidaSection } from './MinSidaSection';
export type { MinSidaSectionProps } from './MinSidaSection';

// Ren härledning (testbar, återanvändbar): profilens view-model + gatningen.
export {
  deriveMinSidaProfile,
  type MinSidaProfile,
  type MinSidaStanding,
  type MinSidaRoom,
  type MinSidaInput,
} from './derive-min-sida';
