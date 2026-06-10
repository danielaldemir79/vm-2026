// Publik yta för lag-profilen (T10, issue #10). App och vyer importerar härifrån
// så intern filstruktur kan ändras utan att bryta call-sites.

export { TeamProfileProvider } from './TeamProfileProvider';
export { TeamProfilePanel } from './TeamProfilePanel';
export type { TeamProfilePanelProps } from './TeamProfilePanel';
export { TeamNameButton } from './TeamNameButton';
export type { TeamNameButtonProps } from './TeamNameButton';
export { useTeamProfile } from './team-profile-context';
export type { TeamProfileStore } from './team-profile-context';
export { deriveTeamProfile } from './derive-team-profile';
export type { TeamProfileData, TeamProfileMatch } from './derive-team-profile';
