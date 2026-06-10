-- T14 (#14): Delad rums-infrastruktur för VM 2026-tipsligan.
-- Endast DELAD/MUTERBAR state lagras här. Statisk turneringsdata (lag, grupper,
-- spelschema) stannar i klient-bundlen (källåkrad, behöver ingen DB).
--
-- Tre tabeller:
--   rooms              - ett rum (mini-liga) med kort delbar kod
--   room_members       - vem som är med i vilket rum + visningsnamn
--   room_match_results - delade matchresultat per rum (vännerna fyller i ihop)
--
-- Allt nycklas på auth.uid() via RLS (se 20260610155315_..._rls_policies.sql).
-- Anon-rollen har samma rättigheter som authenticated i Supabase, så RLS är
-- ENDA skyddet.

create extension if not exists pgcrypto;

-- ROOMS -----------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- Kort, delbar kod (gemener + 2-9, ingen 0/O/1/I-tvetydighet). Genereras i
  -- klienten; UNIQUE så två rum aldrig delar kod (join-flödet slår upp på den).
  code text not null unique,
  name text not null,
  -- Skaparen. Bunden till auth.uid() av RLS-policyn / create_room-RPC:n, så
  -- klienten inte kan förfalska någon annans ägarskap.
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Kod: 4-12 tecken, gemener a-z + 2-9. Valideras även i DB (gissa aldrig att
  -- klienten skickar rätt), så en trasig/förfalskad kod aldrig lagras.
  constraint rooms_code_format check (code ~ '^[a-z2-9]{4,12}$'),
  constraint rooms_name_len check (char_length(name) between 1 and 60)
);

-- ROOM_MEMBERS ----------------------------------------------------------------
-- Sammansatt PK (room_id, user_id): en användare är med i ett rum högst en gång.
create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint room_members_name_len check (char_length(display_name) between 1 and 40)
);

-- ROOM_MATCH_RESULTS ----------------------------------------------------------
-- Delat matchresultat per rum. match_id refererar den STATISKA matchplanen i
-- klient-bundlen (M1..M104), därför ingen FK till någon match-tabell (det finns
-- ingen, matcherna är inte i DB). Sammansatt PK (room_id, match_id): ett resultat
-- per match och rum, redigeras på plats (upsert).
create table public.room_match_results (
  room_id uuid not null references public.rooms (id) on delete cascade,
  match_id text not null,
  home_goals smallint not null,
  away_goals smallint not null,
  -- Straffar bara i slutspel vid oavgjort. Null = inga straffar (gruppspel/avgjort).
  penalties_home smallint,
  penalties_away smallint,
  -- Matchens livscykel-läge, speglar domänens MatchStatus.
  status text not null,
  updated_by uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (room_id, match_id),
  constraint rmr_status_valid check (status in ('scheduled', 'live', 'finished')),
  constraint rmr_goals_nonneg check (home_goals >= 0 and away_goals >= 0),
  -- Straffar: antingen båda satta (icke-negativa) eller båda null, aldrig halvt.
  constraint rmr_penalties_paired check (
    (penalties_home is null and penalties_away is null)
    or (penalties_home >= 0 and penalties_away >= 0)
  )
);

-- Index för de vanligaste uppslagen: medlemmarnas rum, resultat per rum.
create index room_members_user_idx on public.room_members (user_id);
create index room_match_results_room_idx on public.room_match_results (room_id);
