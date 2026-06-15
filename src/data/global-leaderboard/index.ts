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

// Klient-läsaren (live-vägen): anropar edge-funktionen och får de säkra raderna.
export { loadGlobalLeaderboard, GLOBAL_LEADERBOARD_FUNCTION } from './load-global-leaderboard';
