-- T77 (#161): per-match kommentar-trådar PÅ room_comments.
--
-- Lägger en NULLABLE match_id-kolumn på den befintliga T66-tabellen room_comments:
--   match_id IS NULL  = rums-chatten (T66, MÅSTE förbli oförändrad)
--   match_id satt      = en kommentar i en MATCH-tråd (T77)
--
-- ICKE-DESTRUKTIVT (minimal): bara ADD COLUMN (nullable, default NULL) + ett index.
-- De befintliga rums-chatt-raderna får match_id = NULL och är oförändrade (verifierat
-- live: 5 rader, alla match_id NULL efter migrationen).
--
-- RLS: INGEN policy-ändring behövs. En match-kommentar bär SAMMA room_id som rummet,
-- och de befintliga T66-policyerna gatar på room_id:
--   SELECT room_comments_select_member  = is_room_member(room_id)
--   INSERT room_comments_insert_member  = is_room_member(room_id) AND user_id = auth.uid()
--   DELETE room_comments_delete_own     = user_id = auth.uid()
-- Alltså är både rums-chatten och match-trådarna redan per-rum-gatade och ägar-skyddade
-- på exakt samma sätt. match_id är bara en VY-uppdelning inom rummet, inte en ny
-- säkerhetsgräns (kommentarer är inte hemliga, ingen tips-sekretess), så room_id-gaten
-- räcker (bevisat live i src/data/rooms/match-comments-rls.integration.test.ts).
--
-- Längd-CHECK (room_comments_body_len, 1-500) gäller båda (oförändrad).
-- Realtid: tabellen ligger redan i supabase_realtime-publikationen (T66), så en ny/raderad
-- match-kommentar ger samma postgres_changes-signal -> tyst refetch genom RLS (T18-mönstret).
--
-- HISTORIK (ärlig, lessons committad-migration-pastar-spegla-live): denna fil bär den
-- FAKTISKA live-apply-versionen (20260613144345, bekräftad med list_migrations), inte en
-- rund placeholder, så en fresh-replay registrerar samma version som validerades live.

alter table public.room_comments
  add column if not exists match_id text;

comment on column public.room_comments.match_id is
  'T77: NULL = rums-chatt (T66), satt = match-trad. match-id ur den statiska planen (text, samma form som room_reactions.match_id). RLS gatar pa room_id (oforandrad).';

-- Index för det vanligaste match-uppslaget: ett rums kommentarer för EN match i tidsordning.
-- Partiellt (bara match-tråd-rader) så rums-chatt-raderna (match_id NULL) inte blåser upp det.
create index if not exists room_comments_room_match_created_idx
  on public.room_comments (room_id, match_id, created_at)
  where match_id is not null;
