// Publik yta för "Så funkar poängen"-förklaringen (T34, #62). Konsumenter
// (tips-vyn, topplistan) importerar härifrån så intern struktur kan ändras utan
// att bryta call-sites.

export { ScoreGuide, type ScoreGuideProps } from './ScoreGuide';
export {
  buildScoreExplainer,
  formatScorePoints,
  type ScoreExplainerSection,
  type ScoreExplainerItem,
  type ScorePoints,
} from './score-explainer-items';
