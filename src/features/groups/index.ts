// Publik yta för gruppspelsvyn (T5, issue #5). App och framtida vyer importerar
// härifrån så intern filstruktur kan ändras utan att bryta call-sites.

export { GroupStageView } from './GroupStageView';
export { GroupTable } from './GroupTable';
export type { GroupTableProps } from './GroupTable';
export { useGroupData } from './use-group-data';
export type { GroupData, LoadStatus } from './use-group-data';
export { deriveGroupTables } from './derive-group-tables';
