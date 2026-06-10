-- T14 (#14, C1, DB-INTEGRITET): laga halv-straff-läckan i rmr_penalties_paired.
--
-- BAKGRUND: den ursprungliga constrainten (core-schemat) var
--   CHECK ((penalties_home IS NULL AND penalties_away IS NULL)
--          OR (penalties_home >= 0 AND penalties_away >= 0))
-- Den SLÄPPER IGENOM ett HALVT straff-par. En CHECK i Postgres avvisar bara när
-- uttrycket är FALSE, ett NULL-resultat behandlas som godkänt (samma three-valued
-- logik som en WHERE inte gör, men en CHECK gör). För raden
--   penalties_home = NULL, penalties_away = 3
-- blir gren 1 = FALSE och gren 2 = (NULL >= 0) AND (3 >= 0) = NULL AND TRUE = NULL.
-- FALSE OR NULL = NULL => raden ACCEPTERAS. Det bryter invarianten "straffar är
-- antingen båda satta eller båda null, aldrig halvt" som domänen (slutspels-straffar
-- vid oavgjort) bygger på, ett halvt par är ett ogiltigt resultat. Bevisat live:
-- en (NULL, 3)-rad accepterades före denna migration, nekas efter.
-- Källa: PostgreSQL-dok "Check Constraints" (en check passerar på TRUE eller NULL,
-- bara FALSE avvisar) + Copilot-runda-1-fynd C1. Se docs/decisions.md (T14, C1).
--
-- FIX: ersätt constrainten så straff-grenen kräver att BÅDA är NOT NULL (och icke-
-- negativa). Då kan NULL inte längre läcka in på bara ena sidan: ett halvt par
-- matchar varken "båda null"-grenen eller "båda satta"-grenen och avvisas hårt.

alter table public.room_match_results
  drop constraint rmr_penalties_paired;

alter table public.room_match_results
  add constraint rmr_penalties_paired check (
    (penalties_home is null and penalties_away is null)
    or (
      penalties_home is not null and penalties_away is not null
      and penalties_home >= 0 and penalties_away >= 0
    )
  );
