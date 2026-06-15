-- T80 (#180): LIVESCORE Bit 2, pollarens operativa tabeller (budget + mappning).
--
-- Två små server-tabeller bara pollaren (service_role) rör. RLS PÅ utan policy
-- => default-deny för anon/authenticated (samma mönster som app_config), de är
-- inte publik data och har inget i klienten att göra.

-- POLL_LOG: dagens API-anrops-räknare (budget-gatens "callsUsedToday").
-- En rad per svensk kalenderdag. Pollaren ökar `calls` med antalet anrop varje
-- tick (atomiskt) och läser den för decidePollTick. Self-contained budget-skydd:
-- summan över dagen kan aldrig spräcka 100 även om cron tickar oftare än tänkt.
create table public.poll_log (
  -- Svensk kalenderdag (Europe/Stockholm), samma zon som appens dag-gruppering.
  day date primary key,
  calls int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.poll_log enable row level security;
-- Ingen policy: bara service_role/owner. Klienten har inget här att göra.

-- FIXTURE_MATCH_MAP: api_fixture_id -> appens match_id. Pollaren SLÅR UPP denna
-- för att veta vilken appmatch en API-fixture är (i stället för att gissa).
--
-- VARFÖR en mappnings-TABELL och inte resolveAppMatch i funktionen: Bit 1:s
-- resolveAppMatch behöver hela den statiska matchplanen + lag-bryggan (klient-
-- bundlen), som edge-funktionen (Deno, deployar bara functions-trädet) inte kan
-- importera utan att duplicera 104 matcher. En liten mappnings-tabell är den
-- renaste vägen: en KÄND koppling slås upp deterministiskt, en OKÄND fixture
-- LOGGAS och hoppas (gissa aldrig). Kopplingarna seedas (dirigent/admin) när
-- en VM-fixtures id dyker upp i live=all , samma "fylls före/under go-live"-
-- princip som lag-bryggan (docs/decisions.md). SELECT öppen vore ofarligt men
-- onödig: bara pollaren behöver den, så default-deny.
create table public.fixture_match_map (
  api_fixture_id bigint primary key,
  -- Samma format-constraint som match_live_data / official_match_results.
  match_id text not null
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$'),
  created_at timestamptz not null default now()
);

alter table public.fixture_match_map enable row level security;
-- Ingen policy: bara service_role/owner (pollaren läser, dirigent/admin seedar).
