-- T80 (#180): LIVESCORE Bit 2, AUTO-FACIT-LÅSET (skriv aldrig över manuellt).
--
-- DANIELS HARD-KRAV: när en match avslutas härleder systemet facit automatiskt
-- ur live-data, MEN det får ALDRIG skriva över ett resultat Daniel matat in
-- manuellt. Auto fyller bara TOMT eller uppdaterar TIDIGARE AUTO.
--
-- ===========================================================================
-- VAR BOR FACIT-HÄRLEDNINGEN? (medvetet designval, EN sanning)
-- ===========================================================================
-- Facit-REGELN (goals, inte score.extratime, se nedan) är den mest fel-gissbara
-- raden i hela featuren. Den är redan implementerad, källhänvisad OCH testad EN
-- gång i TypeScript: `parseFinalResult` i src/data/livescore/parse-live.ts
-- (guld-fixturen fixture-aet-pen.json, negativ-kontroll körd, se docs/decisions.md
-- 2026-06-14). Att RE-IMPLEMENTERA samma regel i plpgsql vore en ANDRA kopia av
-- exakt den rad som är lättast att få tyst fel (kumulativt vs additivt, et vs
-- goals) , de två kopiorna skulle kunna drifta isär utan att någon grind märker
-- det (lärdomen "lattgissad-domanregel-styr-otestad-gren").
--
-- DÄRFÖR: facit-HÄRLEDNINGEN sker i pollaren (edge function) som ÅTERANVÄNDER
-- den testade `parseFinalResult` (regeln på EXAKT ETT ställe). Pollaren har
-- dessutom hela det råa fixtures?id-svaret i handen (inkl. score.penalty), så
-- straffar finns tillgängliga , vilket de inte är som rena kolumner i
-- match_live_data.
--
-- DEN HÄR MIGRATIONEN äger LÅSET (inte härledningen): en SECURITY DEFINER-
-- funktion `apply_auto_facit(...)` som pollaren anropar i stället för en rå
-- upsert. Låset är en DEKLARATIV, reviewbar SQL-invariant (ett `where source =
-- 'auto'` i on-conflict-grenen) som Postgres upprätthåller OAVSETT vem som
-- anropar, bevisad med ett DO-block (se t80_auto_facit_lock_proof.sql). Så:
--   * facit-regeln = EN sanning (parseFinalResult, testad),
--   * facit-LÅSET = EN sanning (denna funktion, bevisad mot DB).
--
-- ===========================================================================
-- FACIT-REGELN (källhänvisad, gissas ALDRIG, verifierad mot RIKTIG data
-- 2026-06-14 , speglar parse-live.ts:s parseFinalResult OCH decisions.md):
-- ===========================================================================
--   * slutresultat (home_goals/away_goals) = API-Footballs `goals.home/away`,
--     det AUKTORITATIVA aggregatet (ordinarie + ev. förlängning, EXKL. straffar).
--     Rätt för FT, AET och PEN. Pollaren skickar in dessa (ur parseFinalResult).
--   * straffar (penalties_home/away) = `score.penalty`, satt BARA vid PEN.
--   * ANVÄND ALDRIG `score.extratime` som facit (det är bara målen UNDER
--     förlängningen, additivt, inte slutresultatet).
-- Källa: probe mot riktiga 2022-VM-slutspelssvar (fixture-aet-pen.json:
--   Argentina-Frankrike goals 3-3, fulltime 2-2, extratime 1-1, penalty 4-2).

-- apply_auto_facit: skriv ett AUTO-härlett facit MEN respektera det manuella
-- låset. Pollaren (service_role) anropar denna i stället för en rå upsert.
--
-- SECURITY DEFINER så pollaren kan skriva official_match_results genom RLS
-- (skriv-policyn där kräver is_app_admin(); pollaren är ingen admin-användare).
-- Definer-ägaren (postgres/table owner) förbigår RLS. search_path='' (samma
-- härdning som is_app_admin/is_room_member). REVOKE från public + grant BARA
-- service_role: en vanlig anon/authenticated-klient kan ALDRIG anropa denna och
-- på så vis skriva facit (de saknar EXECUTE; admin-vägen går via RLS-skyddad
-- direkt-upsert med source='manual', inte via denna funktion).
--
-- updated_by: pollaren har ingen egen auth.users-rad, så auto-rader signeras med
-- den admin-user_id som äger facit (p_updated_by, = Daniels id ur app_config).
-- Det binder auto-raden till en giltig användare (FK updated_by) utan att låtsas
-- vara någon annan, och håller raden konsistent med omr-schemats NOT NULL.
create or replace function public.apply_auto_facit(
  p_match_id text,
  p_home_goals smallint,
  p_away_goals smallint,
  p_status text,
  p_penalties_home smallint,
  p_penalties_away smallint,
  p_updated_by uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.official_match_results (
    match_id, home_goals, away_goals, penalties_home, penalties_away,
    status, source, updated_by, updated_at
  )
  values (
    p_match_id, p_home_goals, p_away_goals, p_penalties_home, p_penalties_away,
    p_status, 'auto', p_updated_by, now()
  )
  on conflict (match_id) do update set
    home_goals = excluded.home_goals,
    away_goals = excluded.away_goals,
    penalties_home = excluded.penalties_home,
    penalties_away = excluded.penalties_away,
    status = excluded.status,
    updated_by = excluded.updated_by,
    updated_at = now()
  -- HÄR ÄR LÅSET (Daniels HARD-krav): uppdatera BARA om den befintliga raden
  -- redan är 'auto'. En MANUELL rad (source='manual', default) matchar inte
  -- predikatet => uppdateringen hoppas tyst, det manuella facit står kvar
  -- orört. INSERT-grenen (ingen befintlig rad) träffar inte detta predikat, så
  -- auto fyller fortfarande TOMT. Resultat: auto fyller tomt eller uppdaterar
  -- auto, ALDRIG manuellt.
  where public.official_match_results.source = 'auto';
$$;

revoke all on function
  public.apply_auto_facit(text, smallint, smallint, text, smallint, smallint, uuid)
  from public;
grant execute on function
  public.apply_auto_facit(text, smallint, smallint, text, smallint, smallint, uuid)
  to service_role;
