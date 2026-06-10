-- T15 (#15): referenstabell för matchernas avsparkstider, SERVER-SIDE klockan.
--
-- VARFÖR denna tabell finns (anti-fusk, HARD): tips-deadlinen (du får inte ändra
-- ett tips efter avspark) MÅSTE upprätthållas SERVER-SIDE. Ett klient-lås räcker
-- inte, en vän kan kringgå klienten och skriva rakt mot Supabase (anon-rollen är
-- enda rollen, RLS är enda skyddet). RLS-policyn på predictions (egen migration)
-- jämför `now()` mot matchens avspark, men en RLS-policy kan bara läsa data som
-- finns i DATABASEN. Avsparkstiderna är annars STATISK klient-data (matches.ts),
-- så vi speglar dem till en liten referenstabell som policyn kan slå upp.
--
-- KLOCKAN ÄR DB:ns now(), ALDRIG klientens: en klient kan ljuga om sin tid, men
-- inte om serverns. `now()` (= transaction_timestamp) är sanningen i policyn.
--
-- DATA-KÄLLA (gissas ALDRIG, källåkrad): match_id + kickoff kommer 1:1 ur den
-- redan källåkrade matchplanen (src/data/wc2026/matches.ts, värde-låst mot den
-- svenska TV-tablån i match-schedule-source.test.ts). Seed-raderna genereras ur
-- matches.ts av scripts/generate-kickoff-seed.ts och värde-låses av
-- match-kickoffs-seed.test.ts (regenerera-och-diffa), så DB-tiderna aldrig kan
-- drifta från klient-bundlens tider. match_id-formatet är samma constraint som
-- room_match_results (g-A-1..g-L-6 + M73..M104), så de två tabellerna kan aldrig
-- referera olika id-rymder.
--
-- SÄKERHET: detta är REFERENSDATA (turneringens fasta avsparkstider), inte
-- användardata. Den är läsbar för alla (RLS SELECT to anon/authenticated) men
-- INGEN klient får skriva (inga INSERT/UPDATE/DELETE-policyer => RLS nekar allt
-- skriv från anon/authenticated). Seed sker via migration (table owner), inte via
-- klienten. Så en vän kan inte flytta en deadline genom att skriva en ny kickoff.

create table public.match_kickoffs (
  -- Samma id-rymd + format som room_match_results.match_id (en sanning för id).
  match_id text primary key,
  -- Avspark i UTC (samma instant som matches.ts kickoff; UI:t formaterar lokalt).
  kickoff timestamptz not null,
  constraint match_kickoffs_match_id_format
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$')
);

-- RLS: läsbar för alla (referensdata), men INGEN skriv-policy => skriv nekas helt
-- för anon/authenticated (RLS default-deny utan matchande policy). Bara migrationer
-- (table owner, förbigår RLS) seedar/uppdaterar raderna.
alter table public.match_kickoffs enable row level security;

create policy match_kickoffs_select_all
  on public.match_kickoffs for select
  using (true);
