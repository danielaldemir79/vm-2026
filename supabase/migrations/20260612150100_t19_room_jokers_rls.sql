-- T19 (#19): RLS för JOKER-VALEN, ANTI-FUSK + DEADLINE-LÅS (samma modell som T15:s
-- tips-RLS). RLS är ENDA skyddet (anon-rollen har samma rättigheter som authenticated),
-- så låset OCH sekretessen MÅSTE leva i databasen, inte i klienten.
--
-- TVÅ HÅRDA SÄKERHETSGARANTIER (båda server-side, bevisade med riktiga sessioner):
--
--   1. DEADLINE-LÅS: en joker får bara sättas/ändras/tas bort FÖRE matchens avspark,
--      EXAKT samma lås som tipset (en joker är ett tips-modifierande val och måste
--      vara bindande vid avspark, annars kunde man dubbla en match man redan sett
--      utfallet på). INSERT/UPDATE/DELETE nekas när now() >= kickoff. Klockan är
--      DB:ns now() (transaction_timestamp), aldrig klientens. Avsparken slås upp i
--      match_kickoffs via match_kickoff(match_id), SAMMA helper som predictions-RLS:en
--      (en sanning för "när låser en match", återanvänd, ingen parallell tid).
--
--   2. SEKRETESS FÖRE LÅS: du ser BARA ditt eget joker-val tills matchen sparkat
--      igång. Andra rumsmedlemmars joker-val blir synliga FÖRST efter avspark (now()
--      >= kickoff), samma sekretess som tipsen, eftersom vilken match någon dubblat
--      är strategisk info (avslöja den först när tipset självt avslöjas). (Avslöjandets
--      UI är topplistan/märkena, men sekretessen är RLS-ansvar.)
--
-- FAIL-SAFE (samma som T15): en match utan rad i match_kickoffs ger kickoff = NULL.
-- now() < NULL = NULL => skriv NEKAS; now() >= NULL = NULL => andras joker DOLDA.
-- (Och joker_day-genereringen kräver redan en känd match, NOT NULL avvisar annars.)
-- Ett saknat kickoff kan alltså aldrig öppna ett fusk-fönster.

alter table public.room_jokers enable row level security;

-- SELECT (sekretess): ditt EGET joker-val alltid; ANDRAS bara efter avspark. Kräver
-- rums-medlemskap (is_room_member), så en utomstående aldrig ser några joker alls.
-- now() >= kickoff blir NULL för en okänd match => andras joker förblir dolda (fail-safe).
create policy room_jokers_select_own_or_after_kickoff
  on public.room_jokers for select
  using (
    public.is_room_member(room_id)
    and (
      user_id = (select auth.uid())
      or now() >= public.match_kickoff(match_id)
    )
  );

-- INSERT (sätt en joker): bara som dig själv, bara i ett rum du är medlem i, och bara
-- FÖRE avspark. now() < kickoff blir NULL för en okänd match => skriv nekas (fail-safe).
create policy room_jokers_insert_member_before_kickoff
  on public.room_jokers for insert
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  );

-- UPDATE (flytta jokern inom dagen, eller byt match): samma deadline-lås. BÅDE using
-- (raden du får röra) OCH with check (raden efteråt) kräver before-kickoff + eget val
-- + medlemskap. with check kollar den NYA radens kickoff (flyttar du jokern till en
-- annan match måste ÄVEN den vara öppen), using den GAMLAS (du får inte röra en redan
-- låst joker). Så man varken kan låsa upp en startad match eller flytta jokern till en
-- redan startad match, och inte heller kapa den till en annan användare.
create policy room_jokers_update_own_before_kickoff
  on public.room_jokers for update
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  )
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  );

-- DELETE (ångra jokern): bara ditt eget val, bara före avspark. Efter avspark är jokern
-- bindande och får inte tas bort i efterhand heller (samma som tipset).
create policy room_jokers_delete_own_before_kickoff
  on public.room_jokers for delete
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.match_kickoff(match_id)
  );
