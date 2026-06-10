-- T15 (#15): tips-tabellen. Vänner gissar resultatet på en match FÖRE avspark.
--
-- MODELL: ett tips är en gissad MÅLSTÄLLNING (home_goals, away_goals) för EN
-- match i ETT rum, av EN användare. Tips är PER RUM (samma person kan vara med i
-- flera kompisgäng med olika tips), därför ingår room_id i nyckeln. Ett tips per
-- (room, match, user): sammansatt PK = UNIQUE-constraint, upsert-flödet ändrar
-- det befintliga tipset i stället för att skapa dubbletter.
--
-- VARFÖR bara hemma/borta-mål (inga straffar): tipset är en gissning på ordinarie
-- resultat. Slutspels-/bracket-tips (vem går vidare, straffar) är en EGEN feature
-- (T16, bracket-tips) och ligger UTANFÖR T15. Poängsättningen (scorePrediction)
-- jämför tippad målställning mot den faktiska, se docs/decisions.md (T15).
--
-- updated_by-mönstret från room_match_results gäller INTE här: ägaren ÄR user_id
-- (ditt tips), och RLS binder user_id = auth.uid() (ingen förfalskning av vems
-- tips det är). created_at/updated_at bär tidsstämplar för revision/sortering.
--
-- DEADLINE-LÅS + SEKRETESS bor i RLS (egen migration, ..._t15_predictions_rls):
--   * skriv (INSERT/UPDATE) NEKAS efter matchens avspark (now() < kickoff), och
--   * andras tips är OSYNLIGA före avspark (du ser bara ditt eget tills kickoff).
-- Constrainterna nedan är dataintegritet; anti-fusket är RLS.

create table public.predictions (
  -- Tipset hör till ett rum (mini-liga). Cascade: rummet bort => tips bort.
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- match_id refererar den statiska matchplanen (ingen FK, samma som
  -- room_match_results). Samma format-constraint så id-rymden är en sanning.
  match_id text not null,
  -- Vem som tippade. Cascade: användaren bort => tips bort.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Den gissade målställningen (ordinarie resultat). Icke-negativa heltal.
  home_goals smallint not null,
  away_goals smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ett tips per (rum, match, användare): nyckeln ÄR unikhets-garantin (upsert).
  primary key (room_id, match_id, user_id),
  constraint predictions_match_id_format
    check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$'),
  constraint predictions_goals_nonneg check (home_goals >= 0 and away_goals >= 0)
);

-- Index för de vanligaste uppslagen: alla tips i ett rum (topplista/avslöjande,
-- T17), och alla tips på en match i ett rum (jämför vänners gissningar efter lås).
--
-- OBS (Copilot C10): dessa två index visade sig REDUNDANTA med PK:n
-- (room_id, match_id, user_id), de är exakt dess ledande prefix och tillför ingen
-- läsnytta (PostgreSQL "Multicolumn Indexes"). De DROPPAS därför i den efterföljande
-- migrationen 20260611120400_t15_predictions_drop_redundant_idx.sql. Raderna nedan
-- behålls för historik-trohet (replay skapar dem och nästa migration tar bort dem).
create index predictions_room_idx on public.predictions (room_id);
create index predictions_room_match_idx on public.predictions (room_id, match_id);
