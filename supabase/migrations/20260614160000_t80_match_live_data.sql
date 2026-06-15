-- T80 (#180): LIVESCORE Bit 2, persisterad live-data per match.
--
-- DANIELS KRAV: livescore ska vara BLÄDDRINGSBAR dagar tillbaka, så en
-- avslutad matchs snapshot (mål, händelser, statistik, laguppställningar)
-- bevaras PERMANENT och fryses vid FT. Raderas aldrig.
--
-- ANSVAR (en sak): lagra den RÅA API-Football-blobben per match + de få
-- extraherade fält pollaren behöver för budget/freeze-beslut. Klienten (Bit 3)
-- parsar de råa jsonb-blobbarna med Bit 1:s rena parsers (parse-live.ts), så
-- DB:n aldrig behöver känna API-formen i detalj. Bara pollaren (service_role)
-- skriver; service_role förbigår RLS, så ingen skriv-policy behövs för den.
--
-- SÄKERHET: anon-rollen har samma rättigheter som authenticated i Supabase, så
-- RLS är ENDA skyddet. Live-data är PUBLIK (som official_match_results), så
-- SELECT är öppen. INGEN insert/update/delete-policy => RLS default-deny för
-- anon/authenticated (bara service_role/pollaren skriver). En kringgången klient
-- kan alltså LÄSA live-data men aldrig förfalska den.

-- MATCH_LIVE_DATA -------------------------------------------------------------
-- match_id refererar den STATISKA matchplanen i klient-bundlen (ingen FK,
-- matcherna finns inte i DB), samma id-rymd + format-constraint som
-- official_match_results / room_match_results (en sanning för match-id-formatet):
--   * 72 GRUPPMATCHER:    'g-A-1'..'g-L-6'
--   * 32 SLUTSPELSMATCHER: 'M73'..'M104'
create table public.match_live_data (
  -- Appens match-id (PK = en rad per match, pollaren upsertar på den).
  match_id text primary key,
  -- API-Footballs fixture-id (stabil nyckel mot källan, för spårbarhet/uppslag).
  api_fixture_id bigint,
  -- Normaliserad status (Bit 1:s LiveStatus-union): scheduled/live/paused/
  -- finished/postponed/unknown. Pollaren skriver den redan normaliserade koden.
  status text,
  -- Spelad minut enligt API:t (null i pauser/före avspark).
  elapsed_minute int,
  -- Löpande ställning (null mycket tidigt innan API:t satt den).
  home_goals int,
  away_goals int,
  -- RÅA API-blobbar (oförändrade), parsas av klienten med Bit 1. jsonb så de är
  -- frågbara om det behövs, men appen läser dem som hela svar genom parsern.
  events jsonb,
  statistics jsonb,
  lineups jsonb,
  -- När pollaren senast skrev raden (för debug/övervakning).
  last_synced_at timestamptz,
  -- true vid FT (avgjord): snapshotten är FRYST och uppdateras inte mer. Driver
  -- både "bläddra dagar tillbaka" och auto-facit-triggern (facit härleds när en
  -- match blir avslutad). Default false (en pågående match är inte fryst).
  frozen boolean not null default false,
  updated_at timestamptz not null default now(),
  -- Samma format-constraint som official_match_results (omr_match_id_format), så
  -- de två tabellerna aldrig kan referera olika id-rymder. Källa: T14
  -- rmr_match_id_format + match-schedule-parser.ts.
  constraint mld_match_id_format
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$')
);

-- RLS: live-data är PUBLIK fakta, läsbar för alla (även icke-inloggad anon),
-- exakt som official_match_results (omr_select_all).
alter table public.match_live_data enable row level security;

create policy mld_select_all
  on public.match_live_data for select
  using (true);

-- INGEN insert/update/delete-policy => RLS default-deny för anon/authenticated.
-- Bara pollaren (edge function via service_role, förbigår RLS) skriver live-data.
-- En vän kan alltså aldrig skriva/ändra/radera en live-rad rakt mot Supabase.
