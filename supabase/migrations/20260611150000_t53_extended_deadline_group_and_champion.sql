-- T53 (#95): FÖRLÄNGD deadline till SÖNDAG 14 juni för GRUPPVINNAR-tips + CHAMPION-tips.
--
-- DANIELS BESLUT 2026-06-11 (källa, gissas inte): de som inte hann tippa före
-- premiären ska få till och med SÖNDAG 2026-06-14 23:59 svensk tid på sig att tippa
-- GRUPPVINNARE/TVÅA och VM-VINNARE (champion). Spelade matcher ger inga match-poäng i
-- efterhand (match-tipsen + bracket-SLOT-tipsen M73..M104 behåller sina EGNA avsparks-
-- lås, de rörs INTE här). Issue #95, decisions.md T53.
--
-- FAST TIDPUNKT: 2026-06-14 23:59 svensk tid = 2026-06-14T21:59:00Z. Sverige är på
-- sommartid (CEST, UTC+2) i juni, så 23:59 lokal = 21:59 UTC. (decisions.md T53.)
--
-- KRITISK DESIGN-REGEL , FÖRLÄNG, FÖRKORTA ALDRIG (GREATEST):
--   Nya deadlinen = GREATEST(ursprungligt kickoff-ankare, fasta tiden).
--   VARFÖR GREATEST och inte "sätt alla till fasta tiden": grupperna G..L spelar sin
--   FÖRSTA match EFTER 14 juni (g-G-1..g-L-1 ligger 15-17 juni, se t15-seeden). Att
--   tvinga dem till 14/6 21:59 skulle FÖRKORTA deras fönster och låsa ute folk som
--   enligt det ursprungliga (senare) ankaret fortfarande har tid kvar. GREATEST ger
--   A..F den förlängda söndagstiden (deras ankare ligger FÖRE 14/6) OCH låter G..L
--   behålla sitt SENARE egna ankare. Champion-ankaret är g-A-1 (11 juni), alltså FÖRE
--   fasta tiden => GREATEST(g-A-1, fast) = fasta tiden (champion förlängs till söndag).
--
-- DETTA ÄR EN REN UPPDATERING AV DEADLINE-HELPERS. Tabeller, policyer, sekretess-
-- logiken och slot-grenen i bracket_deadline_kickoff är OFÖRÄNDRADE: policyerna
-- (group_predictions_*, bracket_predictions_*) anropar samma helpers, så de plockar
-- automatiskt upp den nya regeln utan att själva röras. match_kickoffs (server-klockan,
-- referensdata) rörs inte. Klockan i policyerna är fortfarande DB:ns now(), aldrig
-- klientens. Fail-safe bevaras: en okänd grupp/slot ger fortfarande NULL-deadline
-- (now() < NULL = NULL => skriv nekas; now() >= NULL = NULL => andras tips dolda).

-- En sanning för den fasta söndagstiden i DB-skiktet: en IMMUTABLE funktion, en ren
-- konstant (inte en magisk literal upprepad på två ställen). Mirror av klientens
-- POOL_EXTENDED_DEADLINE_ISO (src/data/predictions/prediction-deadline.ts), samma
-- instant, dokumenterat på båda håll. OBS: denna kommentarrad rättades (STABLE ->
-- IMMUTABLE, copilot R2) EFTER att migrationen applicerats live; skillnaden mot
-- den lagrade live-kopian är enbart denna kommentartext, SQL-definitionen är identisk.
create or replace function public.pool_extended_deadline()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  -- 2026-06-14 23:59 svensk sommartid (CEST, UTC+2) = 21:59:00Z. Daniels beslut #95.
  select timestamptz '2026-06-14T21:59:00Z';
$$;

revoke all on function public.pool_extended_deadline() from public;
grant execute on function public.pool_extended_deadline() to anon, authenticated;

-- GRUPP-deadline: gruppens FÖRSTA match (g-X-1), men ALDRIG tidigare än den fasta
-- söndagstiden => GREATEST. A..F förlängs till söndag; G..L behåller sitt senare
-- ankare (förkortas aldrig). NULL-ankare (okänd grupp) => greatest(NULL, fast) i SQL
-- IGNORERAR NULL och ger fasta tiden, vilket vore ett FÖNSTER för en okänd grupp.
-- Därför behåller vi NULL-fail-safen EXPLICIT: saknas g-X-1-kickoffen ska deadlinen
-- förbli NULL (skriv nekas), inte falla tillbaka på fasta tiden.
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
-- 11 juni (FÖRE fasta tiden), så champion-deadlinen blir den fasta söndagstiden.
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
