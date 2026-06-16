-- T89 (#182): PUSH-PREFERENSER på push_subscriptions (master / nattläge / match-scope).
--
-- VARFÖR kolumner på push_subscriptions (inte en ny tabell): preferenserna hör till en
-- prenumererad ENHET (en rad per endpoint, T85). Dispatchern (service_role) läser raden för
-- att avgöra om enheten ska få notisen , de bor därför där prenumerationen bor (en sanning per
-- enhet, ingen join). RLS ärvs oförändrad: de fyra self-scope-policyerna (select/insert/update/
-- delete på user_id = auth.uid()) täcker även de nya kolumnerna, och den BEFINTLIGA UPDATE-
-- policyn (push_subscriptions_update_own) gör att klienten kan ÄNDRA sina preferenser via
-- upsert/update utan en ny policy (T85-migrationen lade den med flit, just för upsert-grenen).
--
-- DANIELS SPEC + issue #182:
--   * notify_enabled (P1): master på/av. DEFAULT TRUE , notiser PÅ när enheten prenumererar.
--   * quiet_hours_enabled (P2): nattläge ("stäng av på nätterna"). DEFAULT FALSE , notiser
--     dygnet runt tills användaren slår på nattläget. Nattfönstret (23:00-08:00 Europe/
--     Stockholm) utvärderas i dispatchern (push-preferences.ts isQuietHoursStockholm), INTE i
--     DB:n , tidszons-/DST-logiken bor i den testade rena funktionen, inte i ett SQL-uttryck.
--   * match_scope (P3): 'all' (default) eller 'favorite'. CHECK låser de två giltiga värdena.
--   * favorite_team_id (P3): FIFA-koden (3 versaler) för favoritlaget, NULL när inget valt
--     eller scope='all'. CHECK: NULL eller exakt 3 versaler (samma format som group_predictions.
--     winner_team_id). Klient-favoriten är i dag localStorage-only (FavoriteTeamProvider); för
--     att kunna filtrera SERVER-side speglas det valda laget hit när användaren väljer
--     'favorite' i Mer (T89-UI). Tom favorit + scope='favorite' hanteras fail-OPEN i dispatchern.

alter table public.push_subscriptions
  add column notify_enabled boolean not null default true,
  add column quiet_hours_enabled boolean not null default false,
  add column match_scope text not null default 'all',
  add column favorite_team_id text;

alter table public.push_subscriptions
  add constraint push_subscriptions_match_scope_check
    check (match_scope in ('all', 'favorite'));

-- FIFA-kod: NULL eller exakt 3 versaler (A-Z). Samma format som group_predictions.winner_team_id
-- (en sanning för lag-kod-formatet). Gissa aldrig ett lag , null när inget valt.
alter table public.push_subscriptions
  add constraint push_subscriptions_favorite_team_id_format
    check (favorite_team_id is null or favorite_team_id ~ '^[A-Z]{3}$');
