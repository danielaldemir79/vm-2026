-- T80 (#180): LIVESCORE Bit 2, källa + manuellt lås på official_match_results.
--
-- DANIELS HARD-KRAV: auto-facit (härlett ur live-data) får ALDRIG skriva över
-- ett resultat Daniel matat in MANUELLT. För att kunna SKILJA manuellt från
-- auto behöver varje facit-rad veta sin källa.
--
-- source = 'manual' | 'auto':
--   * 'manual' = admin (Daniel) matade in raden via official-results-UI:t.
--   * 'auto'   = auto-facit-triggern (t80_auto_facit) härledde raden ur en
--                avslutad match i match_live_data.
--
-- DEFAULT 'manual' SKYDDAR BEFINTLIGA RADER: alla redan inmatade resultat (innan
-- denna kolumn fanns) var per definition manuellt inmatade av admin. Default
-- 'manual' gör att auto-facit-låset (t80_auto_facit) aldrig rör dem. NOT NULL +
-- CHECK så ingen rad kan sakna eller ljuga om sin källa.
alter table public.official_match_results
  add column source text not null default 'manual'
    check (source in ('auto', 'manual'));
