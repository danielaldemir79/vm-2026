// Publik yta för det server-side globala-topplista-bygget (T90, #183). Den RENA
// kärnan (build-global-leaderboard) återanvänds av BÅDE den genererade edge-mirror:n
// och klientens live-läsare (för typer + fixtures-paritet).

export {
  buildGlobalLeaderboard,
  buildGlobalFacit,
  type RawRoomData,
  type SafeGlobalEntry,
  type StaticPlan,
} from './build-global-leaderboard';

// Sidindelad full-läsning (stabil ordning + completeness-vakt) , ren, testbar loop som
// edge-funktionens IO-wrapper matar en page-fetcher. Bor numera i den neutrala data-layer-
// roten (delad av klient-läsarna också), re-exporteras här för bakåtkompatibel publik yta.
export {
  selectAllPages,
  DEFAULT_PAGE_SIZE,
  type PageFetcher,
  type PageRequest,
  type PageResult,
} from '../select-all-pages';

// Klient-läsaren (live-vägen): anropar edge-funktionen och får de säkra raderna.
export { loadGlobalLeaderboard, GLOBAL_LEADERBOARD_FUNCTION } from './load-global-leaderboard';
