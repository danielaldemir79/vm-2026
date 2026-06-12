-- T19 (#19): JOKER-MATCHEN. Varje omgång (kalenderdag) får en spelare välja EN
-- joker-match vars MATCH-tips-poäng DUBBLAS. Gamification: strategi + återkommande
-- engagemang (issue #19, beroende T15 tips + T17 topplista).
--
-- MODELL: en joker pekar ut EN match (match_id) i ETT rum för EN användare. Jokern
-- dubblar den matchens match-tips-poäng i topplistans aggregering (scoreMember-vägen,
-- EN sanning, summan==delarna-invarianten består, se aggregate-scores.ts).
--
-- EN JOKER PER ANVÄNDARE OCH KALENDERDAG (KISS, dokumenterat val, decisions.md T19):
-- "per omgång" tolkas som per SVENSK KALENDERDAG (Europe/Stockholm), den naturliga
-- VM-"omgången" (en dags matcher). Regeln upprätthålls STRUKTURELLT av en GENERERAD
-- kolumn `joker_day` (matchens avspark i svensk lokaltid, som date) + PK på
-- (room_id, user_id, joker_day): en andra joker samma dag KROCKAR med PK:n och
-- upsertas (byter jokern), den kan aldrig bli två rader samma dag. Avsparken slås
-- upp i match_kickoffs (referenstabellen, seedad ur den källåkrade matchplanen, T15),
-- så dagen är EN sanning härledd ur samma plan som allt annat, inte ett klient-värde.
--
-- VARFÖR härleda dagen ur kickoff SERVER-SIDE (inte lita på klientens värde): en klient
-- kan ljuga om vilken dag en match spelas. joker_day kan dock INTE vara en GENERERAD
-- kolumn: uttrycket måste vara IMMUTABLE, men "slå upp kickoff i en tabell + konvertera
-- tidszon" är STABLE (läser data, tidszons-beroende), så Postgres avvisar det som
-- generation expression. Vi använder därför en BEFORE INSERT/UPDATE-TRIGGER som SKRIVER
-- ÖVER joker_day med match_joker_day(match_id) (en trigger får anropa en stable funktion).
-- Då är dagen lika oförfalskbar som en generated-kolumn (klientens värde ignoreras, DB
-- räknar fram det), och en joker på en okänd match_id (saknar kickoff => NULL dag) avvisas
-- av NOT NULL-constrainten (fail-safe: ingen joker på en match utanför planen).
--
-- DEADLINE-LÅS + SEKRETESS bor i RLS (egen migration, ..._t19_room_jokers_rls):
--   * skriv (INSERT/UPDATE/DELETE) NEKAS efter matchens avspark (now() < kickoff),
--     EXAKT samma lås som tipset (en joker kan inte sättas/flyttas efter avspark), och
--   * andras joker-VAL är osynliga före avspark (du ser bara ditt eget tills kickoff),
--     samma sekretess som tipsen (jokern är strategisk info, avslöjas när tipset gör).
-- Constrainterna nedan är dataintegritet; anti-fusket + låset är RLS (samma som T15).

-- Hjälpare: matchens avspark som SVENSK KALENDERDAG (Europe/Stockholm). EN sanning för
-- "vilken omgång (dag) en match tillhör", härledd ur match_kickoffs. SECURITY DEFINER +
-- stable + tom search_path (samma härdning som match_kickoff/is_room_member). Returnerar
-- NULL för en okänd match_id (fail-safe: NOT NULL på joker_day avvisar då jokern).
-- Tidszons-konvertering i DB: kickoff är timestamptz (UTC-instant), `at time zone
-- 'Europe/Stockholm'` ger lokal vägg-tid, ::date plockar kalenderdagen. Detta matchar
-- klientens svenska dag-gruppering (DISPLAY_TIMEZONE = 'Europe/Stockholm', T7).
create or replace function public.match_joker_day(p_match_id text)
returns date
language sql
security definer
stable
set search_path = ''
as $$
  select (k.kickoff at time zone 'Europe/Stockholm')::date
  from public.match_kickoffs k
  where k.match_id = p_match_id;
$$;

revoke all on function public.match_joker_day(text) from public;
grant execute on function public.match_joker_day(text) to anon, authenticated;

create table public.room_jokers (
  -- Jokern hör till ett rum (mini-liga). Cascade: rummet bort => joker bort.
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- Vem som valde jokern. Cascade: användaren bort => joker bort.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Matchen jokern pekar ut (refererar den statiska matchplanen, ingen FK, samma
  -- format-constraint som predictions: gruppmatch g-X-N eller slutspels-slot M73..M104).
  match_id text not null,
  -- Den SVENSKA kalenderdagen matchen spelas. SKRIVS ÖVER av before-triggern nedan ur
  -- match_joker_day(match_id) (klientens värde ignoreras, kan inte förfalskas). NOT NULL:
  -- en match utanför planen (okänt kickoff => NULL dag) avvisas (fail-safe, ingen joker
  -- utan känd dag). Klienten skickar inte detta fält; triggern fyller det.
  joker_day date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- EN JOKER PER (rum, användare, kalenderdag): nyckeln ÄR regeln (upsert byter jokern
  -- inom samma dag i stället för att skapa en andra). Detta är "en joker per omgång".
  primary key (room_id, user_id, joker_day),
  constraint room_jokers_match_id_format
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$')
);

-- TRIGGER: skriv ÖVER joker_day med den SERVER-härledda svenska match-dagen FÖRE varje
-- insert/update. Klientens joker_day-värde ignoreras helt (kan inte förfalska vilken
-- omgång jokern gäller), och en okänd match_id ger NULL => NOT NULL-constrainten avvisar
-- raden (fail-safe). En trigger får anropa en STABLE funktion (till skillnad från en
-- generated-kolumn som kräver IMMUTABLE), så detta är den enda säkra vägen att materia-
-- lisera dagen för PK:n. SECURITY DEFINER + tom search_path (samma härdning som helpers).
create or replace function public.room_jokers_set_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.joker_day := public.match_joker_day(new.match_id);
  return new;
end;
$$;

create trigger room_jokers_set_day_trg
  before insert or update on public.room_jokers
  for each row execute function public.room_jokers_set_day();

-- Index för det vanligaste uppslaget: alla joker-val i ett rum (topplista/aggregering,
-- T17 läser dem för att dubbla rätt match-poäng). user_id ingår i PK:ns prefix, så ett
-- "mina joker i rummet"-uppslag (room_id, user_id) täcks redan av PK:n.
create index room_jokers_room_idx on public.room_jokers (room_id);
