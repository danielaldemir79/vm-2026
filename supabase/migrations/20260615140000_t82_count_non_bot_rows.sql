-- T82 (#173): SERVER-SIDE räkning av RIKTIG (icke-bot) data för seedningens
-- FÖRE/EFTER-skydd.
--
-- VARFÖR: seed-skriptets skydd räknar riktiga (icke-bot) medlemmar + tips före och
-- efter en live-körning och avbryter om de ändrats. Den första versionen byggde ett
-- PostgREST `not in (<240 UUID:er>)`-filter i GET-URL:en (~8,9 kB), nära/över vanliga
-- URL-längd-tak , efter-räkningen kunde då faila EFTER att skrivningarna redan gjorts
-- och lämna en halv-seedad DB. Vi flyttar NOT-IN till SQL i stället: ingen UUID-lista
-- i URL:en alls, bara ett funktionsnamn + tabell-argument.
--
-- SÄKERHET: SECURITY DEFINER så pollaren/seed-skriptet (service_role) kan räkna genom
-- RLS (room_members/predictions har egna läs-policyer som annars skulle dölja andras
-- rader för en vanlig roll). set search_path = '' (samma härdning som is_room_member /
-- apply_auto_facit). p_table valideras mot en ALLOWLIST (bara de två tabeller skyddet
-- rör) och varje gren är en STATISK query , ingen dynamisk SQL, ingen injektions-yta.
-- REVOKE från public + GRANT bara service_role: en vanlig anon/authenticated-klient
-- kan ALDRIG anropa den (samma åtkomst-mönster som apply_auto_facit, T80). "Riktig"
-- data = rader vars user_id INTE finns i bot_accounts (registret över alla botar).
create or replace function public.count_non_bot_rows(p_table text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  if p_table = 'room_members' then
    select count(*) into result
    from public.room_members rm
    where not exists (
      select 1 from public.bot_accounts b where b.user_id = rm.user_id
    );
  elsif p_table = 'predictions' then
    select count(*) into result
    from public.predictions p
    where not exists (
      select 1 from public.bot_accounts b where b.user_id = p.user_id
    );
  else
    -- Fail loud: en okänd tabell är ett anropsfel (skyddet rör bara dessa två).
    raise exception '[VM2026] count_non_bot_rows: okänd tabell %', p_table;
  end if;
  return result;
end;
$$;

revoke all on function public.count_non_bot_rows(text) from public;
grant execute on function public.count_non_bot_rows(text) to service_role;
