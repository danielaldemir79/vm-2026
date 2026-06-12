-- T24 (#24): emoji-REAKTIONER på matcher i rummet. Medlemmar trycker en emoji på en
-- match (ett snabbt "kände precis så här!") och alla i rummet ser aggregatet live.
-- Lättviktig variant av kommentarerna (T66): noll text att skriva, bara EN knapp.
--
-- MODELL: EN reaktion per (rum, användare, match). En andra reaktion på SAMMA match
-- BYTER den förra (upsert mot PK:n), den kan aldrig bli två rader. Att avmarkera tar
-- bort raden (DELETE). Aggregatet "hur många tryckte 🔥 på den här matchen" räknas i
-- klienten ur raderna (härledd state, ingen denormaliserad räknar-kolumn).
--
-- KURERAD EMOJI-LISTA (8 st, CHECK-låst, gissas inte , designval i decisions.md T24):
--   ⚽ mål      🔥 het match   😂 skratt    😭 sorg/besvikelse
--   🎉 fira     👏 bra spelat   😱 chock     🧊 iskall (lugn/avgjort)
-- Varför just dessa 8: de täcker fotbolls-känslorna runt en match (jubel, sorg, chock,
-- humor) utan att bli en oöverskådlig palett (KISS). CHECK:en är DB:ns sanning: en
-- klient (anon-roll, enda skyddet är RLS) kan inte smuggla in en godtycklig sträng/
-- emoji utanför listan (samma fail-loud-anda som rmr_match_id_format). Listan speglas
-- 1:1 i klientens REACTION_EMOJIS (src/data/rooms/reactions-api.ts), dokumenterat på
-- båda håll (en sanning, två speglar).
--
-- MATCH_ID-FORMAT: refererar den STATISKA matchplanen i klient-bundlen (ingen FK,
-- matcherna är inte i DB). EXAKT samma källåkrade format-constraint som predictions /
-- room_jokers / rmr_match_id_format (g-<A..L>-<1..6> för 72 gruppmatcher, M73..M104 för
-- 32 slutspelsmatcher). Återanvänd regel, ingen parallell tolkning (se T14 KA-SA2 +
-- docs/decisions.md för spårbarheten av just detta mönster).
--
-- RLS (anon = authenticated i Supabase, RLS är ENDA skyddet, samma modell som
-- room_comments / room_match_results):
--   SELECT bara rumsmedlem (is_room_member(room_id))
--   INSERT bara medlem OCH user_id = auth.uid() (ingen förfalskning av avsändaren)
--   UPDATE bara sin EGEN rad (byta emoji på en match man redan reagerat på)
--   DELETE bara sin EGEN rad (avmarkera)
-- INGEN deadline/sekretess-logik: en reaktion är PUBLIK i rummet DIREKT (decisions.md
-- T24): den avslöjar inget hemligt tips (att tycka en match är "het" säger inget om
-- vad du tippade), så den behöver inte gömmas före avspark som tips/joker. Enklare
-- modell än T15/T19 just för att det inte finns något att skydda.
--
-- BEVISAT LIVE (T53/T66-playbook): simulerade sessioner under bygget (set role) +
-- env-gatat integrationstest med RIKTIGA anon-sessioner (src/data/rooms/
-- reactions-rls.integration.test.ts): medlem reagerar/byter/avmarkerar, utomstående
-- ser/skriver INGET, bara egen rad byts/raderas, en emoji utanför listan nekas av
-- CHECK:en. Detaljer i docs/decisions.md (T24).

create table public.room_reactions (
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- Reagerande medlem. default auth.uid() så klienten inte ens skickar den; RLS:s
  -- with check binder den till auth.uid() (ingen förfalskning). Cascade: användaren
  -- bort => reaktioner bort.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Matchen reaktionen sitter på (refererar den statiska matchplanen, format nedan).
  match_id text not null,
  -- Den valda emojin. CHECK-låst till den kurerade 8-listan (DB:n är sanningen, en
  -- klient kan inte smuggla in en egen emoji). Listan speglas i klientens
  -- REACTION_EMOJIS (reactions-api.ts).
  emoji text not null,
  created_at timestamptz not null default now(),
  -- EN reaktion per (rum, användare, match): nyckeln ÄR regeln (upsert BYTER emojin i
  -- stället för att skapa en andra). Detta är "en reaktion per användare och match".
  primary key (room_id, user_id, match_id),
  constraint room_reactions_match_id_format
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$'),
  -- Kurerad emoji-lista (8 st). Håll i synk med klientens REACTION_EMOJIS.
  constraint room_reactions_emoji_allowed
    check (emoji in ('⚽', '🔥', '😂', '😭', '🎉', '👏', '😱', '🧊'))
);

-- Vanligaste uppslaget: alla reaktioner i ett rum (klienten aggregerar per match).
-- room_id + match_id täcker även "reaktionerna på EN match" (prefix-uppslag).
create index room_reactions_room_match_idx on public.room_reactions (room_id, match_id);

alter table public.room_reactions enable row level security;

-- SELECT: bara medlemmar i rummet (is_room_member, SECURITY DEFINER-helpern från T14).
-- Reaktioner är publika INOM rummet direkt (ingen sekretess-gren som tips/joker).
create policy room_reactions_select_member
  on public.room_reactions for select
  using (public.is_room_member(room_id));

-- INSERT: medlem OCH avsändaren = auth.uid() (ingen förfalskning). Emoji + match_id
-- vaktas av CHECK-constrainterna (kör oavsett policy).
create policy room_reactions_insert_member
  on public.room_reactions for insert
  with check (public.is_room_member(room_id) and user_id = (select auth.uid()));

-- UPDATE: byt emoji på en match man redan reagerat på. Bara sin EGEN rad, både den
-- man får röra (using) och den efteråt (with check). Medlemskap krävs i båda. Detta
-- gör upserten (insert ... on conflict do update) laglig: konflikt-grenen är en UPDATE
-- på den egna raden.
create policy room_reactions_update_own
  on public.room_reactions for update
  using (user_id = (select auth.uid()))
  with check (public.is_room_member(room_id) and user_id = (select auth.uid()));

-- DELETE: bara sin EGEN reaktion (avmarkera), aldrig andras.
create policy room_reactions_delete_own
  on public.room_reactions for delete
  using (user_id = (select auth.uid()));

-- REALTID (T18-mönstret, signal-inte-data): lägg tabellen i publikationen så en ny/
-- bytt/raderad reaktion ger en postgres_changes-SIGNAL till de andra medlemmarna (RLS
-- släpper bara raderna till rum-medlemmar). Klienten läser ALDRIG payloadens rad
-- (signal-inte-data); den kör en tyst refetch genom RLS. REPLICA IDENTITY default (vi
-- läser aldrig old-raden).
alter publication supabase_realtime add table public.room_reactions;
