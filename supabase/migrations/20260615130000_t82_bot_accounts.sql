-- T82 (#173): BOT-REGISTER för seedning av tipsligan med diskreta "atmosfär"-botar.
--
-- VARFÖR: appen ska kännas levande och ge tävlings-tryck även innan en stor mängd
-- riktiga vänner gått med. Vi seedar därför ~240 diskreta botar (egna auth.users-
-- konton) som ligger i nya rum (med poäng, spridda över hela topplistan) eller i de
-- befintliga rummen (börjar på 0). Botarna får ALDRIG toppa topplistan eller spamma.
--
-- DETTA REGISTER ÄR HELA SEEDNINGENS ÅNGER-KNAPP: varje bot taggas här med sin
-- persona. Eftersom user_id refererar auth.users(id) ON DELETE CASCADE kan hela
-- seedningen rivas med EN sanning, registret:
--   delete from auth.users where id in (select user_id from public.bot_accounts);
-- Cascaden städar då bot-kontots room_members + predictions + group/bracket-tips
-- (alla FK:ar mot auth.users(id) on delete cascade), så ingen botspår blir kvar.
-- Riktig data (icke-bot-medlemmar/tips) rörs aldrig, den har inget bot_accounts-rad.
--
-- SÄKERHET: detta är ett INTERNT register som BARA seed-skriptet (service_role)
-- och migrationen (table owner) behöver. En vanlig klient (anon/authenticated) ska
-- ALDRIG kunna läsa eller skriva det: vem som är bot är inte information appen
-- exponerar (botarna ska smälta in), och persona-fälten (skill_tier m.m.) är
-- intern seednings-logik. Därför: RLS PÅ men UTAN policy => default-deny för anon
-- OCH authenticated (ingen klient-åtkomst alls). service_role förbigår RLS, så
-- seed-skriptet når raderna. Samma default-deny-mönster som app_config (T80) och
-- app_admins skriv-sidan (T42).

create table public.bot_accounts (
  -- Bot-kontots auth.users-id. PK + FK med cascade: registret ÄR nyckeln till att
  -- riva en bot komplett (radera auth.users-raden => cascade städar resten).
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- IDEMPOTENS-ANKARE: en stabil, deterministisk persona-nyckel (kohort#index, se
  -- personaKey() i src/data/bots/seed-plan.ts). UNIQUE så en andra seed-körning ser
  -- vilka personas som redan har konto och hoppar över dem (ingen dubblett). Detta är
  -- vad seed-planeraren läser som snapshot.existingBotKeys.
  persona_key text not null unique,
  -- Persona-fält (satta av persona-motorn, src/data/bots/personas.ts). De är intern
  -- seedningsdata, inte appens sanning: visningsnamnet som syns i appen bor på
  -- room_members.display_name (per rum), detta är bara persona-spåret.
  display_name text not null,
  -- Skicklighets-skikt 0..1 som styr tips-träffsäkerheten (högre => fler rätt, med
  -- spridning så ingen bot toppar). numeric, inte en hårdkodad skala, så motorn kan
  -- finkalibrera utan migration.
  skill_tier numeric not null,
  -- Personlighets-etikett (styr senare kommentar-/reaktions-benägenhet i liv-lagret,
  -- nästa task). Fri text, validerad i koden (persona-motorn), inte i DB:n.
  personality text not null,
  -- Vilken kohort boten tillhör: 'new-room' (de ~200 i nya rum, tippar allt inkl.
  -- spelade matcher => får poäng), 'vm2026' / 'fsu' (tippar bara kommande matcher
  -- => börjar på 0). Driver seed-planerarens scopning.
  cohort text not null,
  created_at timestamptz not null default now(),
  -- Skikt-värdet är en andel: håll det i [0,1] redan i DB:n (gissa aldrig att koden
  -- skickar rätt), så ett trasigt värde fail-loud:ar på write i stället för att tyst
  -- snedvrida tips-genereringen.
  constraint bot_accounts_skill_tier_range check (skill_tier >= 0 and skill_tier <= 1),
  -- Kohort-listan är låst (DB:n är sanningen): seed-planeraren scopar på dessa exakta
  -- värden, en okänd kohort ska aldrig kunna lagras. Håll i synk med BotCohort i
  -- src/data/bots/personas.ts (en sanning, två speglar).
  constraint bot_accounts_cohort_valid check (cohort in ('new-room', 'vm2026', 'fsu')),
  -- Visningsnamnet speglas till room_members.display_name (char 1..40 där, T14), så
  -- håll samma övre gräns här så ett persona-namn aldrig kan bli olagligt i medlems-
  -- tabellen (fail-loud redan i registret om motorn skulle generera ett för långt namn).
  constraint bot_accounts_display_name_len check (char_length(display_name) between 1 and 40)
);

-- Vanligaste uppslaget vid teardown/idempotens: alla botar i en viss kohort.
create index bot_accounts_cohort_idx on public.bot_accounts (cohort);

-- RLS på, men medvetet INGEN policy => allt nekas för anon/authenticated. Bara
-- service_role (seed-skriptet) och table owner (migrationen) når raderna. En klient
-- kan alltså inte ens `select * from bot_accounts` rakt mot Supabase för att lista
-- vilka som är botar. (Samma default-deny-mönster som app_config, T80.)
alter table public.bot_accounts enable row level security;
