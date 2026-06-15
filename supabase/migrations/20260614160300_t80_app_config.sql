-- T80 (#180): LIVESCORE Bit 2, privat config-tabell för server-hemligheter.
--
-- VARFÖR: pollaren (edge function) behöver API-Football-nyckeln. MCP kan
-- (sannolikt) inte sätta edge-function-secrets, så nyckeln läggs i en PRIVAT
-- tabell som BARA service_role (pollaren) når. SJÄLVA NYCKELVÄRDET COMMITTAS
-- ALDRIG (PRINCIPLES §7) , denna migration skapar tabellen TOM. Dirigenten
-- inserterar nyckel-värdet vid deploy via execute_sql (se DEPLOY-RUNBOK i HANDOFF):
--   insert into public.app_config (key, value) values ('api_football_key', '<NYCKEL>');
--   insert into public.app_config (key, value) values ('auto_facit_admin_id', '<DANIELS_USER_ID>');
--
-- SÄKERHET: en enkel nyckel/värde-tabell. RLS PÅ men UTAN policy => RLS
-- default-deny för anon OCH authenticated (ingen kan läsa eller skriva via
-- klienten). Bara service_role (pollaren) och table owner (migration) når raderna;
-- service_role förbigår RLS. Så nyckeln kan ALDRIG läsas ut av en vanlig klient
-- ens om hen försöker `select * from app_config` rakt mot Supabase.
create table public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- RLS på, men medvetet INGEN policy => allt nekas för anon/authenticated.
-- (Samma default-deny-mönster som app_admins skriv-sidan i T42.)
alter table public.app_config enable row level security;

-- Ingen select/insert/update/delete-policy med flit: bara service_role/owner når datan.
-- Tabellen skapas TOM , nyckel-värdena inserteras av dirigenten vid deploy (ovan).
