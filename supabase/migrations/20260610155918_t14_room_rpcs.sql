-- T14 (#14): RPC:erna för skapa-rum och gå-med-via-kod. SECURITY DEFINER så de
-- kan utföra det atomiska/uppslag som RLS annars skulle blockera, men hårda mot
-- förfalskning: allt binds till auth.uid() inuti funktionen och search_path är
-- låst (tom) mot schema-shadowing.
--
-- (Denna fil är den konsoliderade slutformen. Live-projektet byggdes upp via
-- flera apply_migration-steg, 20260610155345 -> ...155918, inkl. en fix för en
-- 42702-kolumn-ambiguitet; se supabase/README.md. Slutläget är detta.)

-- #variable_conflict use_column undviker att OUT-/lokala variabler skuggar
-- kolumnnamn i insert/on-conflict (rotorsaken till en tidig 42702 i join-RPC:n).

-- CREATE_ROOM -----------------------------------------------------------------
-- Skapa rum ATOMISKT med skaparen som första medlem. VARFÖR en RPC och inte en
-- ren INSERT: skaparen måste bli medlem SAMTIDIGT, annars (a) kan hen inte läsa
-- sitt eget rum (rooms_select_member kräver medlemskap) och (b) en INSERT med
-- return=representation failar (PostgREST:s SELECT-tillbaka nekas). En tvåstegs
-- klient-lösning vore inte atomisk: kraschar appen emellan finns ett föräldralöst
-- rum utan medlemmar. RPC:n gör båda i en transaktion.
create or replace function public.create_room(
  p_code text,
  p_name text,
  p_display_name text
)
returns table (room_id uuid, room_name text, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_code text := lower(btrim(p_code));
  v_name text := nullif(btrim(p_name), '');
  v_display text := nullif(btrim(p_display_name), '');
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'Ingen autentiserad användare (logga in först).' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'Rumsnamn krävs.' using errcode = '22023';
  end if;
  if v_display is null then
    raise exception 'Visningsnamn krävs.' using errcode = '22023';
  end if;

  -- code-format + namn-längd vaktas av check-constraints (fail loud vid trasig kod).
  insert into public.rooms (code, name, created_by)
  values (v_code, v_name, v_uid)
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, display_name)
  values (v_room_id, v_uid, v_display);

  return query select v_room_id, v_name, v_code;
end;
$$;

revoke all on function public.create_room(text, text, text) from public;
grant execute on function public.create_room(text, text, text) to anon, authenticated;

-- JOIN_ROOM_BY_CODE -----------------------------------------------------------
-- Gå med via kod. Ett icke-medlem MÅSTE kunna slå upp ett rum på dess EXAKTA kod
-- för att gå med, men får ALDRIG kunna rad-skanna alla rum. Därför en SECURITY
-- DEFINER-RPC som tar koden, lägger till anroparen som medlem (idempotent: gå med
-- igen byter bara visningsnamn) och returnerar rummet. Ingen öppen SELECT-policy
-- på rooms för icke-medlem behövs (den skulle annars läcka hela rumslistan).
-- Saknas koden -> tom mängd (klienten visar "rummet finns inte"), ingen läckande
-- felskillnad.
create or replace function public.join_room_by_code(
  p_code text,
  p_display_name text
)
returns table (room_id uuid, room_name text, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_room public.rooms%rowtype;
  v_name text := nullif(btrim(p_display_name), '');
begin
  if v_uid is null then
    raise exception 'Ingen autentiserad användare (logga in först).' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'Visningsnamn krävs för att gå med.' using errcode = '22023';
  end if;

  select * into v_room from public.rooms r where r.code = lower(btrim(p_code));
  if not found then
    return; -- okänd kod: tom mängd, ingen läcka
  end if;

  insert into public.room_members (room_id, user_id, display_name)
  values (v_room.id, v_uid, v_name)
  on conflict (room_id, user_id) do update set display_name = excluded.display_name;

  return query select v_room.id, v_room.name, v_room.code;
end;
$$;

revoke all on function public.join_room_by_code(text, text) from public;
grant execute on function public.join_room_by_code(text, text) to anon, authenticated;
