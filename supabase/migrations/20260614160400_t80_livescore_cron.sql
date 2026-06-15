-- T80 (#180): LIVESCORE Bit 2, schemalägg pollaren (pg_cron + pg_net).
--
-- VAD DEN GÖR: säkerställer extensions pg_cron + pg_net, och schemalägger ett
-- HTTP-POST mot edge-funktionen livescore-poller var ~2 minut. Pollaren är
-- SJÄLV-budgeterande (Bit 1:s planPolls + en daglig räknare i app_config), så
-- cron-FREKVENSEN behöver inte vara försiktig , budgeten styrs i KODEN, inte i
-- schemat. Var 2:a minut ger pollaren täta tillfällen att fånga freeze/facit
-- utan att någonsin spräcka 100/dag (gaten i koden avgör om ett tick verkligen
-- slår mot API:t).
--
-- ===========================================================================
-- DIRIGENTEN FINALISERAR (två projekt-specifika värden, gissas ALDRIG):
-- ===========================================================================
-- pg_net behöver funktionens FULLA URL + en auth-header. Båda är projekt-
-- specifika och får inte hårdkodas/gissas i repot. Vid deploy (execute_sql),
-- KÖR DENNA MIGRATION och ERSÄTT de två platshållarna nedan:
--
--   :FUNCTION_URL   = https://kmzhyblzxangpxydufve.functions.supabase.co/livescore-poller
--                     (= <project-ref>.functions.supabase.co/<function-name>;
--                      hämtas med get_project_url / Supabase-dashboarden)
--   :SERVICE_ROLE   = projektets service_role-JWT (Settings -> API). Den är en
--                     HEMLIGHET och får ALDRIG committas , dirigenten klistrar in
--                     den HÄR vid deploy, i SQL:en som körs via MCP, inte i repot.
--
-- Funktionen verifierar Authorization-headern (Supabase kräver den för en icke-
-- publik function), och cron är det enda som anropar den.
--
-- Alternativ utan service_role i SQL: gör funktionen publik (--no-verify-jwt vid
-- deploy) och skydda den i stället med en delad hemlighet i app_config som
-- funktionen jämför mot en custom header. Dirigenten väljer , se HANDOFF.

-- Extensions i schemat `extensions` (Supabase-konvention, inte public).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Avregistrera ett ev. tidigare jobb med samma namn (idempotent re-apply).
select cron.unschedule('livescore-poller')
  where exists (select 1 from cron.job where jobname = 'livescore-poller');

-- Schemalägg pollaren var 2:a minut. net.http_post köar ett asynkront anrop.
-- PLATSHÅLLARE , dirigenten ersätter :FUNCTION_URL och :SERVICE_ROLE vid deploy.
select cron.schedule(
  'livescore-poller',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := ':FUNCTION_URL',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer :SERVICE_ROLE'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
