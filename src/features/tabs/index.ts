// Publik yta för flik-IA:n (T83, #175): flik-rad + tabpaneler + URL-routning.
// App importerar härifrån så intern filstruktur kan ändras utan att bryta call-sites.

export { TABS, DEFAULT_TAB, tabById, tabBySlug, tabButtonId, tabPanelId } from './tab-config';
export type { TabId, TabDescriptor } from './tab-config';
export { tabFromHash, hashForTab } from './tab-routing';
export { useTabRouting } from './use-tab-routing';
export type { TabRouting } from './use-tab-routing';
export { TabBar } from './TabBar';
export type { TabBarProps } from './TabBar';
export { TabPanel } from './TabPanel';
export type { TabPanelProps } from './TabPanel';
