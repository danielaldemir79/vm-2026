-- T89 (#182): IDEMPOTENS-tabell för mål-push , garanterar ALDRIG dubbel-notis.
--
-- VARFÖR (HARD, issue #182): en mål-notis får skickas EXAKT EN gång per mål. En DB-webhook
-- kan re-levereras, dispatchern kan deployas om, och pollaren kan SKRIVA OM hela events-
-- blobben vid en re-poll (vanligt: API:t kompletterar en tidigare match). Utan ett hårt
-- dedup-lager skulle vänner få samma "MÅL! Spanien 2-1" om och om igen, eller en svärm av
-- historiska mål-notiser när en gammal match re-pollas. Mål-detekteringens signatur-diff
-- (goal-detection.ts) är ett FÖRSTA lager (event-listan), men det räcker inte mot en
-- re-levererad webhook med samma OLD/NEW , DETTA är det andra, hårda lagret: en UNIQUE-
-- nyckel i DB:n. Dispatchern INSERTar en rad PER mål den tänker notifiera; en redan
-- notifierad signatur ger en unik-konflikt (insert ... on conflict do nothing) och hoppas
-- TYST , exakt det som gör en re-leverans/re-poll/redeploy ofarlig.
--
-- NYCKEL: (match_id, goal_signature). goal_signature byggs av den DELADE goalSignature
-- (goal-detection.ts): minut + tillägg + lag-id + skytt-id + skytt-namn + straff/egenmåls-
-- flagga , STABIL över en re-poll (INTE event-index, som skiftar när blobben skrivs om).
-- match_id är redundant i signaturen (den scopar den redan) men hålls som egen kolumn för
-- läsbara uppslag/städning per match.
--
-- SÄKERHET (RLS): live-/notis-spår är INTE användardata , bara dispatchern (service_role,
-- förbigår RLS) skriver och läser. Vi sätter RLS PÅ men lägger INGA policies => default-deny
-- för anon/authenticated. En vän kan alltså aldrig läsa vilka mål som notifierats eller
-- förfalska en rad (samma "service-role-only"-mönster som poll_log / fixture_match_map).

create table public.notified_goals (
  -- Appens match-id (samma id-rymd + format-constraint som match_live_data, en sanning).
  match_id text not null,
  -- Målets stabila signatur (goalSignature i goal-detection.ts). Text, opak nyckel.
  goal_signature text not null,
  -- När notisen skickades (för debug/städning efter VM). Default now().
  notified_at timestamptz not null default now(),
  -- En rad per (match, mål-signatur). PK = den hårda dedup-garantin: en andra insert med
  -- samma par avvisas (on conflict do nothing i dispatchern), så aldrig dubbel-notis.
  constraint notified_goals_pkey primary key (match_id, goal_signature),
  -- Samma format-constraint som match_live_data (mld_match_id_format), så de två tabellerna
  -- aldrig kan referera olika id-rymder. Källa: T14 rmr_match_id_format + match-schedule-parser.ts.
  constraint notified_goals_match_id_format
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$')
);

-- RLS PÅ men INGA policies => default-deny för anon/authenticated. Bara dispatchern
-- (service_role) rör tabellen. Ingen vän kan läsa/skriva notis-spåret rakt mot Supabase.
alter table public.notified_goals enable row level security;
