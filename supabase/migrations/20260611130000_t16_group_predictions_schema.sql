-- T16 (#16): GRUPPVINNAR-TIPS. Vänner gissar 1:an + 2:an i varje grupp FÖRE
-- gruppspelet. Klassiska VM-pool-momentet (SPEC §6: GroupPrediction).
--
-- MODELL: ett grupp-tips är en gissad (1:a, 2:a) för EN grupp (A..L) i ETT rum,
-- av EN användare. Tips är PER RUM (samma person, olika kompisgäng), därför ingår
-- room_id i nyckeln. Ett tips per (room, group, user): sammansatt PK = UNIQUE-
-- constraint, upsert-flödet ändrar det befintliga tipset i stället för dubbletter.
-- Samma form som T15:s predictions (ett tips per nyckel, upsert).
--
-- VARFÖR 1:a + 2:a (inte hela tabellen): SPEC §6 (GroupPrediction) säger
-- "gissad gruppvinnare/tvåa per grupp". De två platserna är dessutom de enda som
-- är direkt-kvalificerade (3:orna seedas av FIFA Annexe C, T4, det är inte ett
-- tippnings-moment). Poängsättningen (scoreGroupPrediction, src/data/predictions/
-- bonus-score.ts): rätt 1:a = 3p, rätt 2:a = 2p, oberoende. Se docs/decisions.md (T16).
--
-- DEADLINE-LÅS + SEKRETESS bor i RLS (egen migration, ..._t16_group_predictions_rls):
--   * skriv (INSERT/UPDATE/DELETE) NEKAS efter GRUPPENS FÖRSTA MATCH (g-X-1), och
--   * andras grupp-tips är OSYNLIGA före gruppens första match (du ser bara ditt eget).
-- DEADLINE-ANKARE: gruppens första match g-X-1 (per grupp, inte ett globalt lås),
-- vars kickoff redan finns i match_kickoffs (T15). En vän kan alltså fortsätta tippa
-- grupp L efter att grupp A börjat, men ALDRIG en grupp vars första match sparkat
-- igång. Källmedvetet val, dokumenterat i decisions.md (T16).
--
-- Constrainterna nedan är dataintegritet; anti-fusket är RLS (samma som T15).

create table public.group_predictions (
  -- Tipset hör till ett rum (mini-liga). Cascade: rummet bort => tips bort.
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- Grupp-id A..L (12 grupper, VM 2026-format). Samma rymd som domänens GroupId.
  group_id text not null,
  -- Vem som tippade. Cascade: användaren bort => tips bort.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Gissad 1:a + 2:a (lag-id, refererar den statiska lag-datan, ingen FK eftersom
  -- lagen är klient-bundle-data precis som match_id i predictions). Lag-id-formatet
  -- är FIFA:s trebokstavs-landskod (3 versaler), samma som teams.ts code-fältet.
  winner_team_id text not null,
  runner_up_team_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ett tips per (rum, grupp, användare): nyckeln ÄR unikhets-garantin (upsert).
  primary key (room_id, group_id, user_id),
  -- Grupp-id måste vara A..L (12 grupper). Speglar GROUP_IDS i domänen.
  constraint group_predictions_group_id_format check (group_id ~ '^[A-L]$'),
  -- Lag-id = FIFA trebokstavskod (3 versaler), samma format som teams.ts.
  constraint group_predictions_winner_format check (winner_team_id ~ '^[A-Z]{3}$'),
  constraint group_predictions_runner_up_format check (runner_up_team_id ~ '^[A-Z]{3}$'),
  -- 1:an och 2:an kan inte vara samma lag (ett lag fyller en plats).
  constraint group_predictions_distinct_teams check (winner_team_id <> runner_up_team_id)
);
