-- T14 (#14): RLS för rums-infrastrukturen. RLS är ENDA skyddet (anon-rollen har
-- samma rättigheter som authenticated i Supabase), så varje tabell låser ner till
-- auth.uid() + rums-medlemskap.
--
-- MODELL:
--   rooms              SELECT: medlem. (Join-via-kod går via join_room_by_code-RPC,
--                              så ett icke-medlem aldrig kan rad-skanna alla rum.)
--                      INSERT: bara som sig själv (created_by = auth.uid()).
--                      UPDATE/DELETE: bara skaparen.
--   room_members       SELECT: medlemmar i samma rum ser varandra.
--                      INSERT: bara sig själv (user_id = auth.uid()) = "gå med".
--                      DELETE: bara sig själv = "lämna".
--   room_match_results SELECT/INSERT/UPDATE/DELETE: bara medlemmar i rummet, och
--                      updated_by måste vara auth.uid() (ingen förfalskning).

-- Medlemskaps-helper. SECURITY DEFINER + search_path-lås så policyn på
-- room_members kan fråga room_members UTAN att rekursera in i sin egen RLS
-- (annars: "infinite recursion detected in policy"). Definer kör som ägaren och
-- förbigår RLS internt; vi exponerar bara en boolesk "är X medlem i rum Y?".
-- OBS: anon/authenticated MÅSTE ha EXECUTE, RLS-policy-uttryck evalueras i
-- ANROPARENS roll (empiriskt bevisat: utan grant -> "permission denied for
-- function is_room_member"). Helpern läcker ingen annan data (bara anroparens
-- eget medlemskap), så det är en accepterad avvägning (advisor-WARN 0028/0029).
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to anon, authenticated;

-- ROOMS -----------------------------------------------------------------------
alter table public.rooms enable row level security;

create policy rooms_select_member
  on public.rooms for select
  using (public.is_room_member(id));

-- with check binder created_by till auth.uid(): inget rum i någon annans namn.
create policy rooms_insert_self
  on public.rooms for insert
  with check (created_by = (select auth.uid()));

create policy rooms_update_creator
  on public.rooms for update
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy rooms_delete_creator
  on public.rooms for delete
  using (created_by = (select auth.uid()));

-- ROOM_MEMBERS ----------------------------------------------------------------
alter table public.room_members enable row level security;

create policy room_members_select_same_room
  on public.room_members for select
  using (public.is_room_member(room_id));

-- Gå med: bara sig själv (user_id = auth.uid()).
create policy room_members_insert_self
  on public.room_members for insert
  with check (user_id = (select auth.uid()));

-- Lämna: bara sin egen medlems-rad.
create policy room_members_delete_self
  on public.room_members for delete
  using (user_id = (select auth.uid()));

-- ROOM_MATCH_RESULTS ----------------------------------------------------------
alter table public.room_match_results enable row level security;

create policy rmr_select_member
  on public.room_match_results for select
  using (public.is_room_member(room_id));

create policy rmr_insert_member
  on public.room_match_results for insert
  with check (public.is_room_member(room_id) and updated_by = (select auth.uid()));

create policy rmr_update_member
  on public.room_match_results for update
  using (public.is_room_member(room_id))
  with check (public.is_room_member(room_id) and updated_by = (select auth.uid()));

create policy rmr_delete_member
  on public.room_match_results for delete
  using (public.is_room_member(room_id));
