-- T72 (#151): GÖR den FÖRLÄNGDA deadlinen PLATT , grupp- + champion-tips låses när
-- OMGÅNG 1 är spelad (varje grupp har gått igenom sin första match). Ren uppdatering
-- av EN konstant (pool_extended_deadline).
--
-- DANIELS BESLUT 2026-06-13 (källa, gissas inte, issue #151): "ändra så gruppspel
-- tippning och mästerskap tippningen låser sig efter första omgången är slutspelad.
-- dvs varje grupp har gått igenom första matchen. så blir det mer rättvist." Den
-- gamla 21/6-tiden (T67) var för sen; den nya, rättvisare låspunkten är när omgång 1
-- är i spel. decisions.md T72.
--
-- FAST TIDPUNKT: 2026-06-17T20:00:00Z. Det är avsparket för den SISTA gruppens första
-- match (g-L-1) = MAX över de 12 gruppernas (A..L) tidigaste match-kickoff. När den
-- matchen startar har varje grupp gått igenom sin första match. (Verifierat live mot
-- match_kickoffs 2026-06-13: max(kickoff) where match_id ~ '^g-[A-L]-1$' = g-L-1 =
-- 2026-06-17 20:00:00Z. Klient-spegeln POOL_EXTENDED_DEADLINE_ISO har ett test som
-- HÄRLEDER samma max ur WC2026_MATCHES, så en schema-ändring fångas rött.)
--
-- VARFÖR PLATT och inte längre GREATEST(ankare, fasta tiden) (T53/T67): den fasta tiden
-- är nu den SISTA gruppens första match, alltså ligger den per definition PÅ ELLER EFTER
-- varje grupps första match. GREATEST behövdes bara när den fasta tiden kunde ligga FÖRE
-- en sen grupps ankare (för att inte FÖRKORTA fönstret). Med den nya tiden finns ingen
-- sådan grupp, och Daniels intent är EN gemensam låspunkt (omgång 1 spelad). Därför
-- returnerar grupp- + champion-grenarna nu den PLATTA tiden för ett känt ankare. Vi
-- BEHÅLLER ändå den explicita NULL-fail-safen (saknat ankare -> NULL-deadline -> skriv
-- nekas), så en okänd grupp/slot aldrig får ett öppet fönster ur tomma luften.
--
-- AVGRÄNSNING: SLOT-grenen (M73..M104) i bracket_deadline_kickoff + match-tipsen är
-- OFÖRÄNDRADE (egna avsparks-lås, rörs INTE). Tabeller, policyer, sekretess-logiken är
-- oförändrade. match_kickoffs (server-klockan, referensdata) rörs inte. Klockan i
-- policyerna är fortfarande DB:ns now(). Denna migration CREATE OR REPLACE:ar alla tre
-- deadline-helpers (identisk SQL utom konstanten) så den är en komplett, fresh-replaybar
-- ögonblicksbild av deadline-skiktet, inte ett implicit beroende på T53/T67:s ordning.

-- En sanning för den platta pool-tiden i DB-skiktet: en IMMUTABLE funktion, en ren
-- konstant. Mirror av klientens POOL_EXTENDED_DEADLINE_ISO
-- (src/data/predictions/prediction-deadline.ts), samma instant, dokumenterat på båda håll.
create or replace function public.pool_extended_deadline()
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  -- 2026-06-17 20:00:00Z = g-L-1 (sista gruppens första match) = omgång 1 spelad.
  -- Daniels beslut #151 (platt, ersätter 21/6 21:59Z från T67).
  select timestamptz '2026-06-17T20:00:00Z';
$$;

revoke all on function public.pool_extended_deadline() from public;
grant execute on function public.pool_extended_deadline() to anon, authenticated;

-- GRUPP-deadline: PLATT pool-tid (omgång 1 spelad) för en KÄND grupp, samma instant
-- för alla grupper (T72: ingen per-grupp-GREATEST längre). NULL-fail-safe EXPLICIT:
-- saknas gruppens g-X-1-kickoff i match_kickoffs ska deadlinen förbli NULL (skriv nekas),
-- inte falla tillbaka på den platta tiden (det vore ett fönster för en okänd grupp).
-- Vi slår fortfarande upp g-X-1 enbart för att avgöra "är gruppen känd?" , värdet på
-- kickoffen styr inte längre tiden (platt).
create or replace function public.group_deadline_kickoff(p_group_id text)
returns timestamptz
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when k.kickoff is null then null
    else public.pool_extended_deadline()
  end
  from public.match_kickoffs k
  where k.match_id = 'g-' || p_group_id || '-1';
$$;

revoke all on function public.group_deadline_kickoff(text) from public;
grant execute on function public.group_deadline_kickoff(text) to anon, authenticated;

-- BRACKET-deadline: SLOT-grenen (M73..M104) är OFÖRÄNDRAD (slottens egen avspark, eget
-- lås, rörs inte). CHAMPION-grenen är nu PLATT: den platta pool-tiden för en KÄND
-- turneringsstart (g-A-1). NULL-fail-safe bevarad: saknas g-A-1-kickoffen förblir
-- champion-deadlinen NULL (skriv nekas), inte den platta tiden.
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
        else public.pool_extended_deadline()
      end
    else public.match_kickoff(p_slot_id)
  end;
$$;

revoke all on function public.bracket_deadline_kickoff(text) from public;
grant execute on function public.bracket_deadline_kickoff(text) to anon, authenticated;
