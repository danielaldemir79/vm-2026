-- T67 (#123): FLYTTA den FÖRLÄNGDA deadlinen från 14 juni till SÖNDAG 21 juni för
-- GRUPPVINNAR-tips + CHAMPION-tips. Ren uppdatering av EN konstant (pool_extended_deadline).
--
-- DANIELS BESLUT 2026-06-12 (källa, gissas inte): "vald datum nu är för nära och
-- kommer stressa alla som vill hoppa på i helgen. ta det till söndagen veckan efter."
-- Den fasta förlängda tiden flyttas alltså 14/6 -> 21/6 (söndagen veckan efter), så
-- vänner hinner haka på under helgen utan stress. Issue #123, decisions.md T67. T53:s
-- modell (GREATEST, slot-/match-lås orörda) är OFÖRÄNDRAD, bara konstanten byts.
--
-- FAST TIDPUNKT: 2026-06-21 23:59 svensk tid = 2026-06-21T21:59:00Z. Sverige är på
-- sommartid (CEST, UTC+2) i juni, så 23:59 lokal = 21:59 UTC. (decisions.md T67.)
--
-- KRITISK DESIGN-REGEL , FÖRLÄNG, FÖRKORTA ALDRIG (GREATEST, oförändrad sedan T53):
--   Deadlinen = GREATEST(ursprungligt kickoff-ankare, fasta tiden).
--   KONSEKVENS av den NYA tiden (källverifierat live mot match_kickoffs, 2026-06-12):
--   ALLA 12 gruppers FÖRSTA match (g-A-1..g-L-1) ligger 11-17 juni, alltså FÖRE
--   21/6 21:59Z. Med T53 (14/6) behöll de sena grupperna G..L sitt SENARE ankare
--   (15-17/6); med den NYA tiden ligger även G..L:s ankare FÖRE deadlinen, så GREATEST
--   ger nu ALLA 12 grupper + champion samma 21/6-tid. Ingen grupp förkortas (GREATEST
--   kan aldrig dra ett ankare bakåt). En hypotetisk grupp med första match EFTER 21/6
--   hade fortfarande behållit sitt senare ankare (regeln, inte datat, är garantin).
--
-- DETTA ÄR EN REN UPPDATERING AV pool_extended_deadline(). group_deadline_kickoff och
-- bracket_deadline_kickoff (champion + slot) anropar samma helper, så de plockar
-- automatiskt upp den nya tiden utan att själva röras , vi CREATE OR REPLACE:ar dem
-- ändå (identisk SQL som T53) så denna migration är en komplett, fresh-replaybar
-- ögonblicksbild av deadline-helpers, inte ett implicit beroende på T53:s ordning.
-- Tabeller, policyer och sekretess-logiken är OFÖRÄNDRADE. match_kickoffs (server-
-- klockan, referensdata) rörs inte. Klockan i policyerna är fortfarande DB:ns now().
-- Fail-safe bevaras: en okänd grupp/slot ger fortfarande NULL-deadline.

-- En sanning för den fasta söndagstiden i DB-skiktet: en IMMUTABLE funktion, en ren
-- konstant. Mirror av klientens POOL_EXTENDED_DEADLINE_ISO
-- (src/data/predictions/prediction-deadline.ts), samma instant, dokumenterat på båda håll.
create or replace function public.pool_extended_deadline()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  -- 2026-06-21 23:59 svensk sommartid (CEST, UTC+2) = 21:59:00Z. Daniels beslut #123.
  select timestamptz '2026-06-21T21:59:00Z';
$$;

revoke all on function public.pool_extended_deadline() from public;
grant execute on function public.pool_extended_deadline() to anon, authenticated;

-- GRUPP-deadline: gruppens FÖRSTA match (g-X-1), men ALDRIG tidigare än den fasta
-- söndagstiden => GREATEST. Med 21/6 förlängs ALLA 12 grupper (deras ankare 11-17/6
-- ligger FÖRE). NULL-ankare (okänd grupp) => greatest(NULL, fast) i SQL IGNORERAR NULL
-- och ger fasta tiden, vilket vore ett FÖNSTER för en okänd grupp. Därför behåller vi
-- NULL-fail-safen EXPLICIT: saknas g-X-1-kickoffen ska deadlinen förbli NULL.
create or replace function public.group_deadline_kickoff(p_group_id text)
returns timestamptz
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when k.kickoff is null then null
    else greatest(k.kickoff, public.pool_extended_deadline())
  end
  from public.match_kickoffs k
  where k.match_id = 'g-' || p_group_id || '-1';
$$;

revoke all on function public.group_deadline_kickoff(text) from public;
grant execute on function public.group_deadline_kickoff(text) to anon, authenticated;

-- BRACKET-deadline: SLOT-grenen (M73..M104) är OFÖRÄNDRAD (slottens egen avspark, eget
-- lås, rörs inte). Bara CHAMPION-grenen förlängs: GREATEST(g-A-1, fasta tiden). g-A-1 är
-- 11 juni (FÖRE fasta tiden), så champion-deadlinen blir den fasta söndagstiden (21/6).
-- NULL-fail-safe bevarad på SAMMA sätt som ovan: saknas g-A-1-kickoffen förblir
-- deadlinen NULL (skriv nekas), inte fasta tiden.
create or replace function public.bracket_deadline_kickoff(p_slot_id text)
returns timestamptz
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when p_slot_id = 'champion' then
      case
        when public.match_kickoff('g-A-1') is null then null
        else greatest(public.match_kickoff('g-A-1'), public.pool_extended_deadline())
      end
    else public.match_kickoff(p_slot_id)
  end;
$$;

revoke all on function public.bracket_deadline_kickoff(text) from public;
grant execute on function public.bracket_deadline_kickoff(text) to anon, authenticated;
