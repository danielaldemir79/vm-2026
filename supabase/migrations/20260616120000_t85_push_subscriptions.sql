-- T85 (#177): web-push FUNDAMENT, prenumerationstabell + RLS.
--
-- VARFÖR: en PWA-push behöver en lagrad PushSubscription per enhet (endpoint +
-- krypteringsnycklar) som avsändar-funktionen (push-sender, service_role) kan
-- skicka TILL. En användare kan ha flera enheter (telefon + laptop), så vi
-- lagrar EN rad per endpoint (push-tjänstens unika enhets-URL).
--
-- MODELL:
--   * user_id default auth.uid(): raden ÄGS av den inloggade (anonyma) användaren,
--     samma identitetsmodell som predictions/rooms (alla har en auth-uid, även
--     anonyma vänner). Default + RLS-check binder raden till skaparen, ingen
--     förfalskning av vems prenumeration det är.
--   * endpoint UNIQUE: push-tjänsten ger en stabil unik URL per enhet. UNIQUE gör
--     upsert idempotent (samma enhet som prenumererar igen ändrar raden i stället
--     för att skapa en dubblett) OCH är on conflict-målet i klientens upsert.
--   * p256dh + auth_key: klientens publika nyckel + auth-hemlighet ur
--     PushSubscription.toJSON().keys , web-push krypterar nyttolasten till just
--     denna enhet med dem (RFC 8291). De är INTE server-hemligheter (de hör till
--     klientens prenumeration, inte VAPID-privatnyckeln), så de bor här, inte i
--     app_config. VAPID-PRIVATNYCKELN (den enda hemligheten) ligger i app_config.
--   * user_agent: valfri, för att kunna visa "den här enheten" i framtiden. Null OK.
--
-- SÄKERHET (RLS, server-side, bevisas med riktiga sessioner i integrationstestet):
--   En authenticated användare får INSERT/SELECT/DELETE BARA sina EGNA rader
--   (user_id = auth.uid()). Ingen UPDATE-policy: en prenumeration ändras inte, den
--   ersätts (upsert = insert on conflict do update, men vi tillåter bara skapa +
--   radera per användare; on conflict-update sker bara på den egna raden via
--   insert-check + den unika endpointen). Service_role (push-sender) förbigår RLS
--   och kan läsa ALLA rader (måste, för att kunna skicka till en användares enheter).
--
-- Samma "delad rums-data med RLS på auth.uid()"-mönster som predictions (T15) +
-- room_members (T14), här utan rums-dimension (en prenumeration är personlig, inte
-- per rum). Källa: docs/patterns.md "delad-rums-data-med-rls-pa-auth-uid".

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Ägaren. Default auth.uid() så klienten inte ens skickar med det (RLS-checken
  -- binder det ändå). Cascade: användaren bort => prenumerationerna bort.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Push-tjänstens unika enhets-endpoint. UNIQUE = idempotent upsert-ankare.
  endpoint text not null unique,
  -- Klientens krypteringsnycklar (base64url) ur PushSubscription.toJSON().keys.
  p256dh text not null,
  auth_key text not null,
  -- Valfri enhets-etikett (för framtida "den här enheten"-UI). Null OK.
  user_agent text,
  created_at timestamptz not null default now()
);

-- Index för avsändarens vanligaste uppslag: alla en användares enheter (T89 skickar
-- till user_id). endpoint har redan ett unikt index via UNIQUE-constrainten.
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- SELECT: bara dina egna prenumerationer. (Klienten läser för att veta om enheten
-- redan är prenumererad; service_role förbigår RLS och ser alla.)
create policy push_subscriptions_select_own
  on public.push_subscriptions for select
  using (user_id = (select auth.uid()));

-- INSERT: bara som dig själv. with check binder raden till auth.uid() så en klient
-- inte kan skapa en prenumeration i någon annans namn.
create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert
  with check (user_id = (select auth.uid()));

-- DELETE: bara dina egna (avregistrering = "stäng av" i UI:t raderar raden).
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete
  using (user_id = (select auth.uid()));

-- INGEN UPDATE-policy med flit: en prenumeration ÄNDRAS inte i fält, den ersätts.
-- Klientens upsert (on conflict endpoint) träffar bara den egna raden (samma user),
-- och on conflict do update kräver att den befintliga raden passerar insert-checken
-- (egen rad), så ingen kan kapa en annans endpoint-rad. (Skulle två användare dela
-- exakt samma endpoint vore det ändå samma fysiska enhet.)
