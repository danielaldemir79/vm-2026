-- T42 (#72): RLS för GLOBAL facit + admin-allowlist. RLS är ENDA skyddet (anon-
-- rollen har samma rättigheter som authenticated), så skriv-skyddet på facit MÅSTE
-- bo här, inte i klienten. En vän kan kringgå klienten och skriva rakt mot Supabase;
-- bara is_app_admin() i RLS stoppar det.
--
-- MODELL:
--   official_match_results SELECT: ALLA (anon + authenticated). Facit är OFFENTLIG
--                          fakta, alla ska se de officiella resultaten utan
--                          rum-medlemskap (till skillnad från room_match_results
--                          som krävde medlemskap).
--                          INSERT/UPDATE/DELETE: BARA is_app_admin(), och
--                          with_check binder updated_by = auth.uid() (en admin kan
--                          inte signera en rad i en annan admins namn).
--   app_admins             SELECT: en användare ser BARA sin EGEN admin-rad (så
--                          klienten kan visa/dölja admin-läget). Ingen kan rad-
--                          skanna hela admin-listan.
--                          INSERT/UPDATE/DELETE: INGEN policy => RLS default-deny
--                          för anon/authenticated. Bara migration/MCP (table owner)
--                          seedar admins, så ingen kan befordra sig själv.

-- OFFICIAL_MATCH_RESULTS ------------------------------------------------------
alter table public.official_match_results enable row level security;

-- Facit är offentlig fakta: läsbar för alla (även icke-inloggad anon).
create policy omr_select_all
  on public.official_match_results for select
  using (true);

-- Skriv bara admin. with_check binder updated_by till auth.uid() (ingen
-- förfalskning av signaturen), exakt som rmr_insert_member band updated_by i T14.
create policy omr_insert_admin
  on public.official_match_results for insert
  with check (public.is_app_admin() and updated_by = (select auth.uid()));

create policy omr_update_admin
  on public.official_match_results for update
  using (public.is_app_admin())
  with check (public.is_app_admin() and updated_by = (select auth.uid()));

create policy omr_delete_admin
  on public.official_match_results for delete
  using (public.is_app_admin());

-- APP_ADMINS ------------------------------------------------------------------
alter table public.app_admins enable row level security;

-- En användare ser bara SIN EGEN admin-rad (för att kunna visa admin-läget i UI:t).
-- Ingen öppen SELECT => admin-listan kan inte rad-skannas av en utomstående.
create policy app_admins_select_self
  on public.app_admins for select
  using (user_id = (select auth.uid()));

-- INGEN insert/update/delete-policy: RLS nekar all skriv från anon/authenticated.
-- Bara migration/MCP (table owner, förbigår RLS) lägger till en admin. Så en klient
-- kan ALDRIG befordra sig själv till admin (det vore hela tävlingsintegritetens fall).
