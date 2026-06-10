-- T15 (#15, Copilot C10): ta bort två index som är REDUNDANTA med primärnyckeln.
--
-- VARFÖR (KÄLLA: PostgreSQL "Multicolumn Indexes",
-- https://www.postgresql.org/docs/current/indexes-multicolumn.html): ett btree-
-- index kan serva sökningar på ett LEDANDE KOLUMN-PREFIX av sina kolumner. PK på
-- predictions är (room_id, match_id, user_id), och dess unika btree-index servar
-- därför både `where room_id = ?` (prefix [room_id]) och `where room_id = ? and
-- match_id = ?` (prefix [room_id, match_id]). De två sekundära indexen nedan är
-- alltså exakt de prefix:en och tillför INGEN läsnytta, bara skriv-amplifiering +
-- lagring. listMyPredictions (`where room_id = ? and user_id = ?`) servas också av
-- PK:n (room_id-prefix + user_id-filter i samma index-scan), inte av något av dessa
-- index. Bevisat med EXPLAIN (enable_seqscan=off) mot det levande projektet: alla
-- tre query-formerna väljer predictions_pkey när dessa droppats (se docs/decisions.md
-- T15 C10). `if exists` gör droppen idempotent (replay-säker).

drop index if exists public.predictions_room_idx;
drop index if exists public.predictions_room_match_idx;
