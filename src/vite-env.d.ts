/// <reference types="vite/client" />

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
