-- T89 (#182): DB-TRIGGER som väcker goal-push-dispatcher när match_live_data uppdateras.
--
-- VARFÖR en trigger (POLLAREN RÖRS EJ, SPEC §13.3 out-of-scope): pollaren upsertar
-- match_live_data oförändrat. Vi reagerar PÅ den raden via en AFTER UPDATE-trigger som POST:ar
-- OLD + NEW till dispatch-funktionen med pg_net (async HTTP) , EXAKT samma mekanism som
-- livescore-poller-cronen redan använder (cron.job 2: net.http_post). Ingen rad i pollarens
-- kod ändras; mål-detekteringen lever helt utanför pollaren.
--
-- BARA NÄR EVENTS ÄNDRATS: pollaren skriver raden VARJE poll (var 30:e sek), men events-blobben
-- ändras bara när en ny händelse kommit. Vi gatar triggern på `new.events is distinct from
-- old.events` så vi inte POST:ar en dispatch på varje ren klock-/elapsed-uppdatering (sparar
-- onödiga anrop; dispatchern skulle ändå returnera "inga nya mål", men vi väcker den inte i onödan).
-- AFTER UPDATE (inte INSERT): en match får sin första rad via INSERT (pollarens upsert), men
-- events sätts/växer via efterföljande UPDATE; ett mål är alltid en FÖRÄNDRING av en befintlig
-- rad. (Skulle en match få events redan i sin allra första INSERT är det ovanligt och fångas av
-- nästa UPDATE; vi håller triggern på UPDATE för att matcha pollarens upsert-mönster och OLD-diffen.)
--
-- SÄKERHET: dispatch-URL:en är publik, men funktionen kräver den HEMLIGA headern
-- x-goal-dispatch-secret (verify_jwt=false + custom auth). Triggern läser hemligheten ur
-- app_config (server-side) och sätter den i headern , så bara denna trigger (och den som har
-- service-role-åtkomst till app_config) kan väcka utskick. Hemligheten är ALDRIG i koden.
--
-- IDEMPOTENS: en re-levererad/dubbel POST är ofarlig , dispatchern avduppar varje mål mot
-- notified_goals (PK + on conflict do nothing). Triggern behöver alltså inte själv vara
-- exakt-en-gång; dubbel-skyddet bor i dispatchern (HARD-kravet).

create or replace function public.t89_notify_goal_push()
  returns trigger
  language plpgsql
  security definer
  -- Lås search_path (security definer-funktion läser app_config + anropar net): undvik att en
  -- search_path-manipulation kapar funktions-/tabell-uppslag. Samma härdning som RPC:erna (T14).
  set search_path = public, extensions
as $$
declare
  dispatch_secret text;
  function_url text := 'https://kmzhyblzxangpxydufve.supabase.co/functions/v1/goal-push-dispatcher';
begin
  -- Bara väcka dispatchern när events FAKTISKT ändrats (inte på en ren klock-/ställnings-poll).
  if new.events is distinct from old.events then
    select value into dispatch_secret from public.app_config where key = 'goal_dispatch_secret';
    -- Saknas hemligheten: hoppa tyst (logga en varning) hellre än att POST:a oautentiserat.
    if dispatch_secret is null then
      raise warning '[VM2026] t89_notify_goal_push: goal_dispatch_secret saknas i app_config, hoppar.';
      return new;
    end if;

    perform net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-goal-dispatch-secret', dispatch_secret
      ),
      -- Skicka NEW + OLD (dispatchern diffar dem). to_jsonb(row) ger hela raden (events-blobben
      -- ingår), samma form dispatchern läser (body.record / body.old_record).
      body := jsonb_build_object('record', to_jsonb(new), 'old_record', to_jsonb(old)),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end;
$$;

-- LEAST PRIVILEGE: trigger-funktionen ska BARA köras av triggern, ALDRIG som en RPC av
-- anon/authenticated (den läser NEW/OLD som inte finns i ett direkt RPC-anrop). Återkalla
-- EXECUTE så den inte exponeras via /rest/v1/rpc/. Triggern kör som tabell-ägaren oavsett.
revoke execute on function public.t89_notify_goal_push() from anon, authenticated, public;

create trigger t89_goal_push_trigger
  after update on public.match_live_data
  for each row
  execute function public.t89_notify_goal_push();
