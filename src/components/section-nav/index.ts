// Sektions-navets publika yta (T103): en sticky chip-rad som hoppar till sektioner i
// en lång flik. Hookarna exporteras med så att de kan testas/återanvändas fristående.
export { SectionNav } from './SectionNav';
export type { SectionNavProps, SectionNavItem } from './SectionNav';
export { useScrollToSection } from './use-scroll-to-section';
export { useActiveSection } from './use-active-section';
export type { UseActiveSectionOptions } from './use-active-section';
