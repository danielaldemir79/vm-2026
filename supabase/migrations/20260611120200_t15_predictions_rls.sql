-- T15 (#15): RLS för tips, ANTI-FUSK-kärnan. RLS är ENDA skyddet (anon-rollen
-- har samma rättigheter som authenticated), så deadline-låset OCH tips-sekretessen
-- MÅSTE leva här, i databasen, inte i klienten.
--
-- TVÅ HÅRDA SÄKERHETSGARANTIER (båda server-side, bevisade med riktiga sessioner
-- i predictions-rls.integration.test.ts):
--
--   1. DEADLINE-LÅS: ett tips får bara skrivas/ändras FÖRE matchens avspark.
--      INSERT/UPDATE/DELETE nekas när now() >= kickoff. Klockan är DB:ns now()
--      (transaction_timestamp), aldrig klientens, en klient kan ljuga om sin tid
--      men inte om serverns. Avsparkstiden slås upp i match_kickoffs (referens-
--      tabellen, seedad ur den källåkrade matchplanen).
--
--   2. TIPS-SEKRETESS FÖRE LÅS: du ser BARA ditt eget tips tills matchen sparkat
--      igång. Andra rumsmedlemmars tips blir synliga FÖRST efter avspark (now()
--      >= kickoff). Annars kunde en vän läsa allas gissningar och sno dem före
--      deadline. (Avslöjandets UI är T17, men sekretessen är T15:s RLS-ansvar.)
--
-- En match UTAN rad i match_kickoffs (skulle bara hända vid en trasig seed, som
-- kickoff-seed.test.ts utesluter) ger kickoff = NULL. Vi FAIL-SAFE:ar då
-- åt det SÄKRA hållet: `now() < kickoff` blir NULL (=> skriv NEKAS, inget tips på
-- en okänd match) och `now() >= kickoff` blir NULL (=> andras tips förblir DOLDA).
-- Ett saknat kickoff kan alltså aldrig öppna ett fusk-fönster.

-- KICKOFF-UPPSLAG som SECURITY DEFINER-helper. VARFÖR definer: policy-uttrycket
-- evalueras i anroparens roll, och vi vill att uppslaget i match_kickoffs sker
-- likadant oavsett anropare (referensdata, läsbar för alla ändå). Stable + tom
-- search_path (samma härdning som is_room_member). Returnerar matchens kickoff
-- eller NULL om match_id saknas i referenstabellen (fail-safe ovan hanterar NULL).
create or replace function public.match_kickoff(p_match_id text)
returns timestamptz
language sql
security definer
stable
set search_path = ''
as $$
  select k.kickoff from public.match_kickoffs k where k.match_id = p_match_id;
$$;

revoke all on function public.match_kickoff(text) from public;
grant execute on function public.match_kickoff(text) to anon, authenticated;

alter table public.predictions enable row level security;

-- SELECT (tips-sekretess): ditt EGET tips alltid; ANDRAS bara efter avspark.
-- Villkoret kräver dessutom rums-medlemskap (is_room_member), så en utomstående
-- aldrig ser några tips alls. now() >= kickoff blir NULL för en okänd match =>
-- andras tips förblir dolda (fail-safe).
create policy predictions_select_own_or_after_kickoff
  on public.predictions for select
  using (
    public.is_room_member(room_id)
    and (
      user_id = (select auth.uid())
      or now() >= public.match_kickoff(match_id)
    )
  );

-- INSERT (lägg ett tips): bara som dig själv, bara i ett rum du är medlem i, och
-- bara FÖRE avspark. now() < kickoff blir NULL för en okänd match => skriv nekas.
create policy predictions_insert_member_before_kickoff
  on public.predictions for insert
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  );

-- UPDATE (ändra ditt tips): samma deadline-lås. BÅDE using (raden du får röra)
-- OCH with check (raden efteråt) kräver before-kickoff + eget tips + medlemskap,
-- så man varken kan ändra ett tips efter avspark eller flytta det till en annan
-- användare/match.
create policy predictions_update_own_before_kickoff
  on public.predictions for update
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  )
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  );

-- DELETE (ångra ditt tips): bara ditt eget, bara före avspark. Efter avspark är
-- tipset låst, det får inte raderas bort i efterhand heller.
create policy predictions_delete_own_before_kickoff
  on public.predictions for delete
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  );
