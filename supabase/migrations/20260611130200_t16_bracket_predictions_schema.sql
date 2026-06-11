-- T16 (#16): BRACKET-/SLUTSPELS-TIPS. Vänner gissar vem som går VIDARE ur varje
-- slutspelsmatch, plus en separat VM-VINNAR-tippning. (SPEC §6: BracketPrediction.)
--
-- ============================================================================
-- MODELL-VAL (källmedvetet, KISS, se docs/decisions.md T16):
--
-- Slutspelet börjar EFTER gruppspelet, så lagen i en tidig slutspels-slot är
-- delvis okända när man vill tippa. Man kan inte tippa "Brasilien vinner sin
-- sextondel" innan man vet att Brasilien hamnar där. Standard-VM-pool löser det
-- så här, och vi följer det:
--
--   * PER-SLOT "GÅR VIDARE"-TIPS: ett tips per slutspelsmatch-slot (M73..M104),
--     du tippar vilket LAG du tror går vidare ur den slotten. Tipset låses per
--     matchens EGEN avspark (samma deadline-modell som T15), så du kan tippa när
--     lagen i slotten är kända men FÖRE den matchen spelas. Detta är robust mot
--     att lagen avslöjas gradvis under slutspelet.
--
--   * VM-VINNAR-TIPS (mästaren): EN separat tippning, gjord FÖRE turneringen,
--     låst vid turneringens FÖRSTA match (g-A-1). Detta är "vem vinner hela VM"
--     -momentet och ger störst bonus. Lagras som en rad med slot_id = 'champion'.
--
-- Per-slot-modellen tippar alltså LAGET som avancerar, inte målställningen (det
-- är T15:s predictions). Poäng: scoreBracketAdvance (stigande per runda) +
-- scoreChampionPrediction (8p), src/data/predictions/bonus-score.ts.
-- ============================================================================
--
-- DEADLINE-LÅS + SEKRETESS bor i RLS (..._t16_bracket_predictions_rls):
--   * per-slot-tips låses vid SLOTTENS egen avspark (M73..M104 i match_kickoffs),
--   * champion-tipset låses vid turneringsstart (g-A-1),
--   * andras tips dolda före respektive deadline (sekretess).
--
-- Constrainterna nedan är dataintegritet; anti-fusket är RLS (samma som T15).

create table public.bracket_predictions (
  -- Tipset hör till ett rum (mini-liga). Cascade: rummet bort => tips bort.
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- VILKEN slot tipset gäller: en slutspelsmatch (M73..M104, vem går vidare) ELLER
  -- 'champion' (vem vinner hela VM, separat tippning). En sanning för id-rymden.
  slot_id text not null,
  -- Vem som tippade. Cascade: användaren bort => tips bort.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Lag-id man tror går VIDARE ur slotten (eller blir mästare för 'champion').
  -- FIFA trebokstavskod (3 versaler), samma format som teams.ts / group_predictions.
  advancing_team_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ett tips per (rum, slot, användare): nyckeln ÄR unikhets-garantin (upsert).
  primary key (room_id, slot_id, user_id),
  -- slot_id är antingen en slutspelsmatch (M73..M104) eller 'champion'. INGA
  -- gruppspels-id (g-*): bracket-tips gäller bara slutspelet + mästaren.
  constraint bracket_predictions_slot_id_format
    check (slot_id ~ '^(M(7[3-9]|8[0-9]|9[0-9]|10[0-4])|champion)$'),
  -- Lag-id = FIFA trebokstavskod (3 versaler).
  constraint bracket_predictions_team_format check (advancing_team_id ~ '^[A-Z]{3}$')
);
