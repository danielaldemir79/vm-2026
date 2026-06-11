// SMAL ambient-deklaration för bygg-tids-koden i vite.config (T43).
//
// VARFÖR inte @types/node: hela @types/node-paketet läcker Node-globaler (bl.a.
// `NodeJS.Timeout`) in i APP-projektet via vitest-typerna, vilket bryter
// browser-typningen av `window.setTimeout` (number vs Timeout) på orelaterade
// ställen (t.ex. RoomPanel). Vi deklarerar därför BARA exakt de Node-ytor bygget
// faktiskt rör: `process.env` (CF_PAGES_COMMIT_SHA) och `execSync` (git rev-parse).
// Denna fil ingår ENBART i tsconfig.node (vite.config), aldrig i app-projektet.

declare const process: {
  env: Record<string, string | undefined>;
};

declare module 'node:child_process' {
  /** Kör ett kommando synkront och returnerar dess stdout (utf8 -> string). */
  export function execSync(
    command: string,
    options: { encoding: 'utf8'; stdio: ['ignore', 'pipe', 'ignore'] }
  ): string;
}
