-- T16 (#16): RLS för BRACKET-/SLUTSPELS-TIPS, ANTI-FUSK (samma modell som T15).
-- RLS är ENDA skyddet (anon-rollen = authenticated), så deadline-låset OCH
-- sekretessen MÅSTE leva i databasen, inte i klienten.
--
-- TVÅ HÅRDA SÄKERHETSGARANTIER (server-side, bevisade med riktiga sessioner):
--
--   1. DEADLINE-LÅS, TVÅ ANKARE (källmedvetet, se schema-migrationen):
--      * per-slot "går vidare"-tips (M73..M104) låses vid SLOTTENS EGEN avspark,
--      * champion-tipset (slot_id = 'champion') låses vid TURNERINGSSTART (g-A-1).
--      INSERT/UPDATE/DELETE nekas när now() >= respektive deadline. Klockan är
--      DB:ns now(), aldrig klientens. Deadline slås upp via
--      bracket_deadline_kickoff(slot_id) nedan, som väljer rätt ankare.
--
--   2. TIPS-SEKRETESS FÖRE LÅS: du ser BARA ditt eget bracket-tips tills slottens
--      deadline. Andras blir synliga FÖRST efter deadline (avslöjandets UI är T17).
--
-- FAIL-SAFE (samma som T15): en okänd slot ger NULL-deadline. now() < NULL = NULL
-- => skriv NEKAS; now() >= NULL = NULL => andras tips DOLDA. Ett saknat kickoff kan
-- aldrig öppna ett fusk-fönster.

-- DEADLINE-UPPSLAG för en bracket-slot. Väljer ANKARE:
--   * 'champion' -> turneringens första match (g-A-1), tippas FÖRE turneringen,
--   * annars     -> slottens egen avspark (slot_id är match_id M73..M104).
-- match_kickoff(text) (T15) gör själva uppslaget i match_kickoffs; denna helper
-- bara väljer vilket match_id som är deadline-ankaret. Samma härdning som de andra
-- helpers (SECURITY DEFINER, stable, search_path=''). EXECUTE för anon/authenticated
-- eftersom RLS-uttryck evalueras i anroparens roll.
create or replace function public.bracket_deadline_kickoff(p_slot_id text)
returns timestamptz
language sql
security definer
stable
set search_path = ''
as $$
  select public.match_kickoff(
    case when p_slot_id = 'champion' then 'g-A-1' else p_slot_id end
  );
$$;

revoke all on function public.bracket_deadline_kickoff(text) from public;
grant execute on function public.bracket_deadline_kickoff(text) to anon, authenticated;

alter table public.bracket_predictions enable row level security;

-- SELECT (sekretess): ditt EGET tips alltid; ANDRAS bara efter slottens deadline.
-- Kräver rums-medlemskap. now() >= deadline blir NULL för en okänd slot => andras
-- tips förblir dolda (fail-safe).
create policy bracket_predictions_select_own_or_after_kickoff
  on public.bracket_predictions for select
  using (
    public.is_room_member(room_id)
    and (
      user_id = (select auth.uid())
      or now() >= public.bracket_deadline_kickoff(slot_id)
    )
  );

-- INSERT (lägg ett bracket-tips): bara som dig själv, i ett rum du är medlem i, och
-- bara FÖRE slottens deadline. now() < deadline blir NULL för en okänd slot => nekas.
create policy bracket_predictions_insert_member_before_kickoff
  on public.bracket_predictions for insert
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.bracket_deadline_kickoff(slot_id)
  );

-- UPDATE (ändra ditt bracket-tips): samma deadline-lås på BÅDE using och with check.
create policy bracket_predictions_update_own_before_kickoff
  on public.bracket_predictions for update
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.bracket_deadline_kickoff(slot_id)
  )
  with check (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.bracket_deadline_kickoff(slot_id)
  );

-- DELETE (ångra ditt bracket-tips): bara ditt eget, bara före slottens deadline.
create policy bracket_predictions_delete_own_before_kickoff
  on public.bracket_predictions for delete
  using (
    public.is_room_member(room_id)
    and user_id = (select auth.uid())
    and now() < public.bracket_deadline_kickoff(slot_id)
  );
