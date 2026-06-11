-- T16 (#16): RLS för GRUPPVINNAR-TIPS, ANTI-FUSK (samma modell som T15:s tips).
-- RLS är ENDA skyddet (anon-rollen har samma rättigheter som authenticated), så
-- deadline-låset OCH sekretessen MÅSTE leva i databasen, inte i klienten.
--
-- TVÅ HÅRDA SÄKERHETSGARANTIER (båda server-side, bevisade med riktiga sessioner):
--
--   1. DEADLINE-LÅS: ett grupp-tips får bara skrivas/ändras FÖRE gruppens FÖRSTA
--      match (g-X-1). INSERT/UPDATE/DELETE nekas när now() >= g-X-1-avspark.
--      Klockan är DB:ns now() (transaction_timestamp), aldrig klientens. Avsparken
--      slås upp i match_kickoffs (referenstabellen, seedad ur den källåkrade
--      matchplanen, T15) via group_deadline_kickoff(group_id) nedan.
--
--   2. TIPS-SEKRETESS FÖRE LÅS: du ser BARA ditt eget grupp-tips tills gruppens
--      första match sparkat igång. Andra rumsmedlemmars grupp-tips blir synliga
--      FÖRST efter g-X-1 (now() >= deadline). Annars kunde en vän läsa allas
--      gissningar och sno dem före deadline. (Avslöjandets UI är T17.)
--
-- FAIL-SAFE (samma som T15): en grupp utan rad för g-X-1 i match_kickoffs (skulle
-- bara hända vid en trasig seed, som kickoff-seed.test.ts utesluter) ger NULL.
-- now() < NULL = NULL => skriv NEKAS; now() >= NULL = NULL => andras tips DOLDA.
-- Ett saknat kickoff kan alltså aldrig öppna ett fusk-fönster.

-- DEADLINE-UPPSLAG för en grupp: kickoff för gruppens FÖRSTA match (g-X-1).
-- VARFÖR en egen helper (inte match_kickoff direkt): grupp-tipsets deadline-ankare
-- är gruppens första match, inte en match per tips. Helpern bygger match_id:t
-- ('g-' || group_id || '-1') och slår upp i match_kickoffs. Samma härdning som
-- match_kickoff/is_room_member (SECURITY DEFINER, stable, search_path=''). EXECUTE
-- för anon/authenticated eftersom RLS-uttryck evalueras i anroparens roll.
create or replace function public.group_deadline_kickoff(p_group_id text)
returns timestamptz
language sql
security definer
stable
set search_path = ''
as $$
  select k.kickoff
  from public.match_kickoffs k
  where k.match_id = 'g-' || p_group_id || '-1';
$$;

revoke all on function public.group_deadline_kickoff(text) from public;
grant execute on function public.group_deadline_kickoff(text) to anon, authenticated;

alter table public.group_predictions enable row level security;

-- SELECT (sekretess): ditt EGET grupp-tips alltid; ANDRAS bara efter gruppens
-- första match. Kräver rums-medlemskap (is_room_member), så en utomstående aldrig
-- ser några tips alls. now() >= deadline blir NULL för en okänd grupp => andras
-- tips förblir dolda (fail-safe).
create policy group_predictions_select_own_or_after_kickoff
  on public.group_predictions for select
  using (
    public.is_room_member(room_id)
    and (
      user_id = (select auth.uid())
      or now() >= public.group_deadline_kickoff(group_id)
    )
  );

-- INSERT (lägg ett grupp-tips): bara som dig själv, bara i ett rum du är medlem i,
-- och bara FÖRE gruppens första match. now() < deadline blir NULL för en okänd
-- grupp => skriv nekas (fail-safe).
create policy group_predictions_insert_member_before_kickoff
  on public.group_predictions for insert
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.group_deadline_kickoff(group_id)
  );

-- UPDATE (ändra ditt grupp-tips): samma deadline-lås. BÅDE using (raden du får röra)
-- OCH with check (raden efteråt) kräver before-deadline + eget tips + medlemskap, så
-- man varken kan ändra ett tips efter gruppstart eller flytta det till annan användare.
create policy group_predictions_update_own_before_kickoff
  on public.group_predictions for update
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.group_deadline_kickoff(group_id)
  )
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.group_deadline_kickoff(group_id)
  );

-- DELETE (ångra ditt grupp-tips): bara ditt eget, bara före gruppstart.
create policy group_predictions_delete_own_before_kickoff
  on public.group_predictions for delete
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.group_deadline_kickoff(group_id)
  );
