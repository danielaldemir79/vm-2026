/// <reference types="vite/client" />

// virtual:pwa-register typas via "vite-plugin-pwa/client" i tsconfig.app.json
// (types-listan), så register-sw.ts:s dynamiska import är typad utan extra ref.

// Bygg-injicerade konstanter (Vite define, satta i vite.config från build-info.ts).
// Deklareras här så app-version.ts kan referera dem typat; de ersätts av string-
// literaler i bygget och läses defensivt (typeof) i test/dev där define inte körts.
declare const __APP_SHA__: string;
declare const __APP_BUILT_AT__: string;

// Typade miljö-variabler. Supabase-uppgifterna är VALFRIA (?): saknas de körs
// datalagret i fixtures-läge, finns de väljs live-klienten (se data-source.ts).
// VITE_-prefix krävs för att Vite ska exponera variabeln till klientkoden.
// INGA värden ligger i repot, de sätts i .env.local (gitignorerad) eller i
// Cloudflare-dashboardens miljö-variabler (PRINCIPLES §7). Supabase anon-key
// är en publik nyckel skyddad av Row Level Security, men hålls ändå utanför
// repot för att inte binda källkoden till ett specifikt projekt.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
