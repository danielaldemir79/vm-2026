-- T18 (#18): aktivera Supabase Realtime (postgres_changes) för de tabeller appen
-- prenumererar på, så ett inmatat resultat / en ny rumsmedlem syns LIVE hos alla
-- anslutna klienter utan reload.
--
-- VILKA TABELLER (och varför INTE alla):
--   official_match_results  GLOBALT facit (admin matar in). Driver hela tracker-
--                           kedjan + topplistans poäng via härledd state. SELECT är
--                           öppen (omr_select_all = true), ingen sekretess att läcka.
--   room_match_results      Rummets delade resultat. RLS: bara medlemmar (rmr_select_
--                           member = is_room_member). Realtime postgres_changes
--                           respekterar RLS, så bara medlemmar får raderna.
--   room_members            Vem som är med i rummet (join syns live). RLS: medlemmar
--                           i samma rum (room_members_select_same_room).
--
-- MEDVETET UTELÄMNADE (SEKRETESS-HARD): predictions / group_predictions /
-- bracket_predictions läggs INTE i publikationen. Andras tips är hemliga FÖRE avspark
-- (RLS: eget tips alltid, andras bara now() >= kickoff). Även om postgres_changes
-- respekterar RLS väljer vi försvar-på-djupet: ingen tips-tabell broadcastas alls, så
-- det finns NOLL yta för en pre-avspark-tips att läcka via realtidskanalen. I stället
-- triggar resultat-/medlemshändelserna en TYST RE-FETCH i klienten (tipsRefreshNonce),
-- och den re-fetchen går genom RLS som vanligt -> avslöjade tips kommer in korrekt,
-- dolda tips förblir dolda. (Källa för RLS-respekt: Supabase "Realtime Authorization",
-- avsnitt "Interaction with Postgres Changes": rader skickas bara till klienter som får
-- läsa dem enligt RLS. Verifierat 2026-06-12.)
--
-- REPLICA IDENTITY: lämnas default (vi läser ALDRIG `old`-raden i klienten, vi
-- refetchar färdiga rader genom RLS). `replica identity full` behövs bara för att få
-- previous-values i UPDATE/DELETE-payloads, vilket vi inte använder (KISS/YAGNI).
--
-- Idempotent: ADD TABLE på en tabell som redan ingår ger ett fel, men i detta projekt
-- var publikationen tom (read-only-verifierat före migrationen) så ett rent ADD är rätt.

alter publication supabase_realtime add table public.official_match_results;
alter publication supabase_realtime add table public.room_match_results;
alter publication supabase_realtime add table public.room_members;
