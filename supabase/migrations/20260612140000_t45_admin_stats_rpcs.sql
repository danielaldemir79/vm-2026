-- T45 (#76): ADMIN-STATISTIK. Arrangören (Daniel) ska se HELA ligan, alla rum +
-- medlemmar + vem som tippar bäst. (Daniels feedback 2026-06-11.)
--
-- PROBLEMET: en vanlig medlems RLS (T14/T15/T16) släpper bara EGNA rum + EGNA tips
-- (andras tips först efter avspark). Admin behöver en överblick ÖVER ALLA rum. Det
-- kan se ut som en klient-fråga men MÅSTE vara server-side: bara is_app_admin() får
-- läsa över rumsgränserna, annars vore det ett läckage (vem som helst kunde lista
-- alla rum + medlemmar). Samma anda som T42:s facit-skydd: en roll-gatad läsning.
--
-- DESIGN (KISS + SEKRETESS-HARD, se docs/decisions.md T45):
--   * TVÅ SECURITY DEFINER-RPC:er, BÅDA gatade på is_app_admin() i FÖRSTA raden:
--     en icke-admin får TOM mängd (ingen rad), aldrig data. Definer-läge så de kan
--     läsa över RLS (det är hela poängen), men gaten gör att BARA admin når datan.
--   * RPC:erna returnerar AGGREGAT / REDAN-AVSLÖJAD data, ALDRIG hemliga framtida tips:
--       - admin_room_stats(): per rum: namn, kod, skapad, MEDLEMSANTAL + ENGAGEMANGS-
--         RÄKNARE (hur många match-/grupp-/bracket-tips medlemmarna lagt). Ett ANTAL
--         läcker inget om VAD någon tippat, bara hur aktiv hen är. Plus medlemslistan
--         (visningsnamn) per rum.
--       - admin_revealed_predictions(): rådata-tips ÖVER ALLA rum, men BARA de vars
--         deadline REDAN PASSERAT (now() >= deadline). Det är EXAKT samma gräns som
--         tips-sekretessens RLS SELECT (own_or_after_kickoff): ett avslöjat tips är
--         per definition inte längre hemligt (alla rumsmedlemmar ser det redan). Vi
--         återanvänder samma deadline-helpers (match_kickoff / group_deadline_kickoff
--         / bracket_deadline_kickoff) som RLS, så "avslöjad" är EN sanning, kan inte
--         drifta. FRAMTIDA (hemliga) tips returneras ALDRIG.
--   * "Vem tippar bäst" RÄKNAS INTE i SQL (det vore att duplicera den källhänvisade
--     poäng-/facit-motorn: FIFA-tiebreak, bracket-härledning, score-reglerna). I
--     stället matar admin_revealed_predictions de AVSLÖJADE tipsen till den befintliga,
--     testade TS-motorn (buildLeaderboard mot det PUBLIKA globala facit). Servern
--     levererar bara den säkra delmängden; klienten poängsätter med en sanning.
--
-- VARFÖR now() >= deadline (inte > ): identiskt med RLS-policyernas own_or_after_kickoff
-- (`now() >= public.match_kickoff(...)`), så admin-läsningen aldrig avslöjar EN sekund
-- tidigare än en vanlig medlem skulle se tipset. En okänd match/grupp/slot ger NULL
-- deadline => `now() >= NULL` = NULL = INTE avslöjat (fail-safe åt det säkra hållet,
-- samma som RLS). Ett saknat kickoff kan alltså aldrig läcka ett framtida tips.

-- ADMIN_ROOM_STATS ------------------------------------------------------------
-- Per rum: överblick + engagemang. INGA tips-VÄRDEN, bara antal (engagemang) +
-- medlemmarnas visningsnamn. Returnerar EN rad per (rum, medlem); rummets
-- aggregat (member_count, *_prediction_count) upprepas per medlemsrad (klienten
-- grupperar per room_id). Ett rum UTAN medlemmar (skulle vara ovanligt, skaparen
-- är alltid medlem) ger ingen rad, vilket är ofarligt för överblicken.
--
-- SECURITY DEFINER + search_path='': samma härdning som is_room_member/is_app_admin.
-- Gaten (is_app_admin) körs FÖRST; en icke-admin returnerar tom mängd (return utan
-- rad), så definer-läget aldrig läcker data till en icke-admin.
create or replace function public.admin_room_stats()
returns table (
  room_id uuid,
  room_name text,
  room_code text,
  room_created_at timestamptz,
  member_count bigint,
  match_prediction_count bigint,
  group_prediction_count bigint,
  bracket_prediction_count bigint,
  member_user_id uuid,
  member_display_name text,
  member_joined_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  -- GATE: bara admin. En icke-admin (eller anon) får tom mängd, ingen data.
  if not public.is_app_admin() then
    return;
  end if;

  return query
  with member_counts as (
    -- Medlemsantal per rum (en gång, återanvänds nedan).
    select rm.room_id, count(*) as cnt
    from public.room_members rm
    group by rm.room_id
  ),
  match_counts as (
    select p.room_id, count(*) as cnt
    from public.predictions p
    group by p.room_id
  ),
  group_counts as (
    select gp.room_id, count(*) as cnt
    from public.group_predictions gp
    group by gp.room_id
  ),
  bracket_counts as (
    select bp.room_id, count(*) as cnt
    from public.bracket_predictions bp
    group by bp.room_id
  )
  select
    r.id,
    r.name,
    r.code,
    r.created_at,
    coalesce(mc.cnt, 0),
    coalesce(pc.cnt, 0),
    coalesce(gc.cnt, 0),
    coalesce(bc.cnt, 0),
    rm.user_id,
    rm.display_name,
    rm.joined_at
  from public.rooms r
  join public.room_members rm on rm.room_id = r.id
  left join member_counts mc on mc.room_id = r.id
  left join match_counts pc on pc.room_id = r.id
  left join group_counts gc on gc.room_id = r.id
  left join bracket_counts bc on bc.room_id = r.id
  order by r.created_at asc, rm.joined_at asc;
end;
$$;

revoke all on function public.admin_room_stats() from public;
grant execute on function public.admin_room_stats() to anon, authenticated;

-- ADMIN_REVEALED_PREDICTIONS --------------------------------------------------
-- ALLA rums tips, men BARA de vars deadline REDAN passerat (now() >= deadline),
-- EXAKT samma gräns som tips-sekretessens RLS (own_or_after_kickoff). Returnerar
-- en NORMALISERAD form (en rad per tips, typad via `kind`) så klienten kan mata
-- den till den befintliga poäng-motorn (buildLeaderboard mot publika facit).
--
-- VARFÖR samma deadline-helpers som RLS: "avslöjad" MÅSTE vara en sanning. Genom
-- att slå upp deadline via match_kickoff / group_deadline_kickoff /
-- bracket_deadline_kickoff (samma helpers RLS:s SELECT-policyer använder) avslöjar
-- admin aldrig ett tips tidigare än en vanlig medlem skulle. Ett FRAMTIDA tips
-- (now() < deadline) filtreras BORT i where, så hemliga tips lämnar aldrig DB:n.
--
-- KOLUMN-SEMANTIK per kind:
--   kind='match'   : team_a = home_goals::text, team_b = away_goals::text (tippad
--                    målställning). team_a/team_b återanvänds som generiska bärare.
--   kind='group'   : team_a = winner_team_id, team_b = runner_up_team_id (CODE).
--   kind='bracket' : team_a = advancing_team_id (CODE), team_b = null, key = slot_id.
-- `key` bär tipsets nyckel inom sin typ (match_id / group_id / slot_id).
create or replace function public.admin_revealed_predictions()
returns table (
  room_id uuid,
  user_id uuid,
  kind text,
  key text,
  team_a text,
  team_b text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  -- GATE: bara admin. En icke-admin (eller anon) får tom mängd, ingen data.
  if not public.is_app_admin() then
    return;
  end if;

  return query
  -- MATCH-TIPS (T15): avslöjat när matchens avspark passerat (now() >= kickoff).
  select
    p.room_id,
    p.user_id,
    'match'::text,
    p.match_id,
    p.home_goals::text,
    p.away_goals::text
  from public.predictions p
  where now() >= public.match_kickoff(p.match_id)
  union all
  -- GRUPP-TIPS (T16): avslöjat när gruppens första match (g-X-1) passerat.
  select
    gp.room_id,
    gp.user_id,
    'group'::text,
    gp.group_id,
    gp.winner_team_id,
    gp.runner_up_team_id
  from public.group_predictions gp
  where now() >= public.group_deadline_kickoff(gp.group_id)
  union all
  -- BRACKET-/MÄSTAR-TIPS (T16): avslöjat när slottens deadline passerat
  -- (per-slot: slottens egen avspark; champion: turneringsstart g-A-1).
  select
    bp.room_id,
    bp.user_id,
    'bracket'::text,
    bp.slot_id,
    bp.advancing_team_id,
    null::text
  from public.bracket_predictions bp
  where now() >= public.bracket_deadline_kickoff(bp.slot_id);
end;
$$;

revoke all on function public.admin_revealed_predictions() from public;
grant execute on function public.admin_revealed_predictions() to anon, authenticated;
