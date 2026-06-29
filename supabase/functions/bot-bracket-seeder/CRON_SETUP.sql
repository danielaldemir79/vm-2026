-- BOT-SLUTSPELSTIPS-SEEDARE , pg_cron-uppsättning (Fas 3). KÖRS EJ AUTOMATISKT.
--
-- Detta är en REFERENS-SQL, INTE en migration (ligger med flit under functions/, inte
-- supabase/migrations/, så ett `db reset` aldrig registrerar jobbet av misstag). Dirigenten
-- KÖR den manuellt via MCP/execute_sql EFTER verifiering, och ersätter de två platshållarna.
--
-- VAD DEN GÖR: schemalägger ett HTTP-POST mot edge-funktionen bot-bracket-seeder var 30:e
-- minut MED {"dryRun": false} (= verkställ). Funktionen är IDEMPOTENT + self-triggering: när
-- en ny slutspelsrunda blir tippbar (lagen kända, avspark ej passerad) fyller nästa tick
-- bot-tipsen för den rundan; när allt redan är giltigt skriver den inget. Var 30:e minut ger
-- snabb upptäckt utan kostnad (dagligen funkar också , byt schemat om så önskas).
--
-- VIKTIGT om dryRun: cron-kroppen MÅSTE vara {"dryRun": false} för att skriva. Ett anrop
-- UTAN body (eller med {}) kör dry-run och skriver inget (säkerhets-default i funktionen).
--
-- ===========================================================================
-- DIRIGENTEN FINALISERAR (två projekt-specifika värden, gissas ALDRIG):
-- ===========================================================================
--   :FUNCTION_URL  = https://kmzhyblzxangpxydufve.functions.supabase.co/bot-bracket-seeder
--                    (= <project-ref>.functions.supabase.co/<function-name>)
--   :SERVICE_ROLE  = projektets service_role-JWT (Settings -> API). HEMLIGHET , klistras in
--                    HÄR vid körning, ALDRIG i repot.
--
-- FÖRE FÖRSTA LIVE-KÖRNINGEN: verifiera dry-run-planen först (manuellt POST utan body, eller
-- med {"dryRun": true}) och granska "wouldWrite" + "summary" + "seedableSlots".

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent re-apply: avregistrera ett ev. tidigare jobb med samma namn.
select cron.unschedule('bot-bracket-seeder')
  where exists (select 1 from cron.job where jobname = 'bot-bracket-seeder');

select cron.schedule(
  'bot-bracket-seeder',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := ':FUNCTION_URL',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer :SERVICE_ROLE'
    ),
    body := '{"dryRun": false}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
