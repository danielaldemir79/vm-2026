-- T42 (#72): GLOBAL facit + admin-allowlist. TÄVLINGSINTEGRITET (HÖG-RISK).
--
-- DANIELS BESLUT (2026-06-11): bara admin (Daniel) matar in de OFFICIELLA
-- matchresultaten EN gång, och de gäller för ALLA rum och ALLA användare. En
-- sanning för facit minimerar fel och fusk (tidigare kunde varje rumsmedlem mata
-- in/ändra facit per rum via room_match_results, vilket bröt tävlingsintegriteten).
--
-- Två nya tabeller + en RLS-helper (RLS i egen migration, ...rls.sql):
--   official_match_results - GLOBALA officiella matchresultat (INGEN room_id)
--   app_admins             - allowlist över vilka user_id som är admin
--   is_app_admin()         - SECURITY DEFINER-helper som RLS-policyer slår upp
--
-- Anon-rollen har samma rättigheter som authenticated i Supabase, så RLS är ENDA
-- skyddet. Skriv-skyddet på facit nycklas på is_app_admin() (inte medlemskap).

-- APP_ADMINS ------------------------------------------------------------------
-- Allowlist: en rad per admin-user_id. Hålls AVSIKTLIGT minimal (bara user_id +
-- added_at). Seedas via migration (table owner) eller MCP, ALDRIG via klienten
-- (RLS nedan ger ingen skriv-policy => en klient kan aldrig befordra sig själv).
create table public.app_admins (
  -- Admin-användarens id (auth.users). PK: en användare är admin högst en gång.
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- ADMIN-HELPER ----------------------------------------------------------------
-- "Är den anropande användaren admin?" SECURITY DEFINER + search_path-lås, samma
-- härdning som is_room_member (T14): policyn på official_match_results frågar
-- app_admins, och definer-läget kör som ägaren så uppslaget inte fastnar i RLS.
-- Helpern läcker ingen data (svarar bara boolean om ANROPAREN själv är admin),
-- en accepterad avvägning (samma klass som is_room_member, advisor-WARN 0028/0029).
--
-- OBS: anon/authenticated MÅSTE ha EXECUTE, ett RLS-policy-uttryck evalueras i
-- ANROPARENS roll (empiriskt bevisat i T14: utan grant -> "permission denied for
-- function"). En anonym icke-admin får helt enkelt `false` tillbaka och nekas skriv.
create or replace function public.is_app_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

-- OFFICIAL_MATCH_RESULTS ------------------------------------------------------
-- GLOBALA officiella matchresultat. INGEN room_id: facit är ETT, delat av alla
-- rum/användare. match_id refererar den STATISKA matchplanen i klient-bundlen
-- (ingen FK, matcherna finns inte i DB), samma id-rymd + format-constraint som
-- room_match_results och match_kickoffs (en sanning för match-id-formatet):
--   * 72 GRUPPMATCHER:    'g-A-1'..'g-L-6'  (g-<A..L>-<1..6>)
--   * 32 SLUTSPELSMATCHER: 'M73'..'M104'    (FIFA-matchnummer; gruppspelet bär
--                          g-...-id, så M-prefixet börjar vid 73). Källa: T14
--                          rmr_match_id_format + match-schedule-parser.ts.
create table public.official_match_results (
  match_id text primary key,
  home_goals smallint not null,
  away_goals smallint not null,
  -- Straffar bara i slutspel vid oavgjort. Null = inga straffar (gruppspel/avgjort).
  penalties_home smallint,
  penalties_away smallint,
  -- Matchens livscykel-läge, speglar domänens MatchStatus.
  status text not null,
  -- Admin som senast skrev raden. Bunden till auth.uid() av RLS with_check, så en
  -- admin inte kan förfalska någon annans signatur. on delete cascade: om admin-
  -- kontot raderas faller raden (osannolikt; Daniels konto är permanent).
  updated_by uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint omr_match_id_format
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$'),
  constraint omr_status_valid check (status in ('scheduled', 'live', 'finished')),
  constraint omr_goals_nonneg check (home_goals >= 0 and away_goals >= 0),
  -- Straffar: antingen BÅDA satta (icke-negativa) eller BÅDA null, aldrig halvt.
  -- Samma strikta paired-form som T14 C1 (en CHECK passerar på TRUE eller NULL, så
  -- straff-grenen måste kräva NOT NULL på båda, annars läcker ett halvt par in).
  constraint omr_penalties_paired check (
    (penalties_home is null and penalties_away is null)
    or (
      penalties_home is not null and penalties_away is not null
      and penalties_home >= 0 and penalties_away >= 0
    )
  )
);
