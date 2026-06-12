-- T66 (#121): kommentarer i rummet. Medlemmar skriver korta meddelanden som alla
-- i rummet ser, live (via Realtime, samma signal -> tyst refetch som T18). Enkel,
-- ärlig MVP: ingen trådning, ingen redigering (#24 Reaktioner är separat).
--
-- DENORMALISERAR EJ visningsnamnet (designval, KISS): room_comments bär bara user_id.
-- Klienten har redan medlemslistan (room_members.display_name, RoomsProvider.members)
-- och slår upp namnet på user_id där den renderar. Skäl: (a) en sanning för namnet
-- (room_members), inget driv-isär om en vän byter visningsnamn, (b) mindre yta att
-- skriva/validera. Avvägning: en kommentar från en vän som SEDAN lämnat rummet saknar
-- namn i listan; klienten faller då till "Tidigare medlem" (ofarligt, ingen krasch).
--
-- RLS (anon-rollen = authenticated i Supabase, så RLS är ENDA skyddet, samma modell
-- som room_match_results):
--   SELECT bara rumsmedlem (is_room_member(room_id))
--   INSERT bara medlem OCH user_id = auth.uid() (ingen förfalskning) + längd-CHECK
--   DELETE bara sin EGEN rad (user_id = auth.uid())
--   ingen UPDATE i v1 (kommentarer redigeras inte; minsta yta).
--
-- BEVISAT LIVE (T53-playbook, simulerade sessioner under bygget + integrationstest
-- med riktiga anon-sessioner i src/data/rooms/comments-rls.integration.test.ts):
-- medlem läser/skriver, utomstående ser/skriver INGET, bara egen rad raderas, tom +
-- 501 tecken nekas av längd-CHECK. Detaljer i docs/decisions.md (T66).

create table public.room_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- Författaren. default auth.uid() så klienten inte ens behöver skicka den; RLS:s
  -- with check binder den ändå till auth.uid() (ingen förfalskning av avsändare).
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Meddelandetexten. 1-500 tecken: en kort kommentar, inte en obegränsad text-yta
  -- (samma fail-loud-andan som rmr_match_id_format). Klienten har samma gräns, men
  -- DB:n är sanningen (gissa aldrig att klienten skickar rätt).
  body text not null,
  created_at timestamptz not null default now(),
  constraint room_comments_body_len check (char_length(body) between 1 and 500)
);

-- Vanligaste uppslaget: ett rums kommentarer i tidsordning (lista nyaste sist).
create index room_comments_room_created_idx on public.room_comments (room_id, created_at);

alter table public.room_comments enable row level security;

-- SELECT: bara medlemmar i rummet (is_room_member, SECURITY DEFINER-helpern från T14).
create policy room_comments_select_member
  on public.room_comments for select
  using (public.is_room_member(room_id));

-- INSERT: medlem OCH avsändaren = auth.uid() (ingen förfalskning). Längden vaktas av
-- room_comments_body_len-constrainten (kör oavsett policy).
create policy room_comments_insert_member
  on public.room_comments for insert
  with check (public.is_room_member(room_id) and user_id = (select auth.uid()));

-- DELETE: bara sin EGEN kommentar (aldrig andras), oavsett vem som skrev i rummet.
create policy room_comments_delete_own
  on public.room_comments for delete
  using (user_id = (select auth.uid()));

-- Ingen UPDATE-policy => UPDATE är nekad för alla (v1: kommentarer redigeras inte).

-- REALTID (T18-mönstret): lägg tabellen i publikationen så en ny/raderad kommentar
-- ger en postgres_changes-SIGNAL till de andra medlemmarna (RLS släpper bara raderna
-- till rum-medlemmar). Klienten läser ALDRIG payloadens rad (signal-inte-data); den
-- kör en tyst refetch genom RLS. REPLICA IDENTITY default (vi läser aldrig old-raden).
alter publication supabase_realtime add table public.room_comments;
