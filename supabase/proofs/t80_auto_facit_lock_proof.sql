-- T80 (#180): BEVIS att auto-facit-låset (apply_auto_facit) ALDRIG skriver över
-- ett MANUELLT resultat (Daniels HARD-krav), i samma anda som T42:s RLS-DO-block.
--
-- DETTA ÄR INGEN SCHEMA-MIGRATION , det är ett BEVIS-skript som dirigenten kör
-- EN gång mot det levande projektet (execute_sql), helt inne i en TRANSAKTION
-- med ROLLBACK på slutet, så NOLL bevis-data lämnas kvar. Det körs EFTER att
-- t80_auto_facit_lock.sql + t80_official_results_source.sql applicerats.
--
-- Bevisar fyra invarianter (RAISE EXCEPTION = rött om någon bryts):
--   1. auto fyller TOMT  : apply_auto_facit på en match utan rad => rad skapas, source='auto'.
--   2. auto uppdaterar AUTO : ett andra auto-anrop ändrar den auto-raden.
--   3. auto rör ALDRIG MANUELLT : på en manuell rad hoppas uppdateringen (raden orörd).
--   4. manuell upsert vinner alltid : admin kan skriva över en auto-rad (source -> 'manual').
do $$
declare
  v_admin uuid;
  v_home smallint;
  v_away smallint;
  v_source text;
  -- Test-match-id i giltigt format men osannolikt att kollidera med riktig data.
  v_auto_match constant text := 'M104';
  v_manual_match constant text := 'M103';
begin
  -- En giltig admin-user_id att signera rader med (FK updated_by). Faller tillbaka
  -- på valfri auth.users-rad om app_admins är tom i bevis-ögonblicket.
  select user_id into v_admin from public.app_admins limit 1;
  if v_admin is null then
    select id into v_admin from auth.users limit 1;
  end if;
  if v_admin is null then
    raise exception 'BEVIS-SETUP: ingen auth.users-rad att signera med';
  end if;

  -- Städa ev. rester (idempotent bevis).
  delete from public.official_match_results where match_id in (v_auto_match, v_manual_match);

  -- (1) AUTO FYLLER TOMT --------------------------------------------------------
  perform public.apply_auto_facit(v_auto_match, 1::smallint, 0::smallint, 'finished', null, null, v_admin);
  select home_goals, away_goals, source into v_home, v_away, v_source
    from public.official_match_results where match_id = v_auto_match;
  if v_home is null then
    raise exception 'INVARIANT 1 BRUTEN: auto fyllde inte en tom match';
  end if;
  if v_source <> 'auto' then
    raise exception 'INVARIANT 1 BRUTEN: auto-rad har source=% (väntade auto)', v_source;
  end if;

  -- (2) AUTO UPPDATERAR AUTO ----------------------------------------------------
  perform public.apply_auto_facit(v_auto_match, 2::smallint, 2::smallint, 'finished', null, null, v_admin);
  select home_goals, away_goals into v_home, v_away
    from public.official_match_results where match_id = v_auto_match;
  if v_home <> 2 or v_away <> 2 then
    raise exception 'INVARIANT 2 BRUTEN: auto uppdaterade inte en auto-rad (fick %-%)', v_home, v_away;
  end if;

  -- (3) AUTO RÖR ALDRIG MANUELLT ------------------------------------------------
  -- Admin matar in ett MANUELLT resultat (source default 'manual').
  insert into public.official_match_results
    (match_id, home_goals, away_goals, status, updated_by)
    values (v_manual_match, 3::smallint, 1::smallint, 'finished', v_admin);
  -- Auto FÖRSÖKER skriva ett ANNAT resultat på samma match.
  perform public.apply_auto_facit(v_manual_match, 9::smallint, 9::smallint, 'finished', null, null, v_admin);
  select home_goals, away_goals, source into v_home, v_away, v_source
    from public.official_match_results where match_id = v_manual_match;
  if v_home <> 3 or v_away <> 1 then
    raise exception 'INVARIANT 3 BRUTEN: auto skrev ÖVER ett manuellt resultat (fick %-%)', v_home, v_away;
  end if;
  if v_source <> 'manual' then
    raise exception 'INVARIANT 3 BRUTEN: manuell rad fick source=% (väntade manual)', v_source;
  end if;

  -- (4) MANUELL UPSERT VINNER ALLTID -------------------------------------------
  -- Admin kan skriva över en auto-rad (vanlig RLS-skyddad upsert, source='manual').
  update public.official_match_results
    set home_goals = 5, away_goals = 0, source = 'manual', updated_by = v_admin
    where match_id = v_auto_match;
  select source into v_source from public.official_match_results where match_id = v_auto_match;
  if v_source <> 'manual' then
    raise exception 'INVARIANT 4 BRUTEN: admin kunde inte ta över en auto-rad';
  end if;

  raise notice 'T80 AUTO-FACIT-LÅS: alla 4 invarianter HÅLLER (auto fyller tomt, uppdaterar auto, rör aldrig manuellt, manuell vinner).';
  -- ALLT BEVIS RULLAS TILLBAKA: ingen rad lämnas kvar.
  raise exception 'ROLLBACK_BEVIS_OK';
exception
  when others then
    if sqlerrm = 'ROLLBACK_BEVIS_OK' then
      raise notice 'Bevis klart, transaktionen rullas tillbaka (ingen data kvar).';
      return;
    end if;
    raise;
end;
$$;
