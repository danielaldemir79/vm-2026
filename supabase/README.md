# Supabase , VM 2026 (T14, #14)

Den molnbaserade delen av appen: **delad rums-infrastruktur** för tipsligan.
Projekt-id: `kmzhyblzxangpxydufve` (URL `https://kmzhyblzxangpxydufve.supabase.co`).

## Vad som lagras här (och vad som INTE gör det)

Bara **delad, muterbar** state ligger i Supabase:

| Tabell | Innehåll |
|---|---|
| `rooms` | Ett rum (mini-liga) med kort delbar kod, namn, skapare. |
| `room_members` | Vem som är med i vilket rum + visningsnamn. |
| `room_match_results` | Delade matchresultat per rum (vännerna fyller i ihop). |
| `predictions` (T15) | Tips: en gissad målställning per (rum, match, användare). |
| `match_kickoffs` (T15) | Referensdata: matchernas avsparkstider, deadline-låsets klocka. |

**Statisk turneringsdata (lag, grupper, spelschema) stannar i klient-bundlen.**
Den är källåkrad och verifierad i Fas 1 (T4/T4b/T10), ändras aldrig av användare,
och behöver därför ingen databas. Att lägga den i DB:n hade bara dubblerat en
redan låst sanning. Live-datakällan (`createSupabaseDataSource`) returnerar
därför SAMMA statiska data som fixtures-läget för lag/grupper/matcher, kontraktet
(`DataSource`) är oförändrat (se `src/data/supabase-client.ts` + `docs/decisions.md`).

## Säkerhetsmodell (RLS är ENDA skyddet)

Auth är **anonym inloggning** (friktionsfritt för vänner, Daniels val). Anon-rollen
har i Supabase SAMMA rättigheter som `authenticated`, så **Row Level Security är
det enda som skyddar datan**. Varje tabell är låst till `auth.uid()` + rums-medlemskap:

- **rooms:** läsbart för medlemmar. Skapas via `create_room`-RPC (atomiskt med
  medlemskap). Ändras/raderas bara av skaparen.
- **room_members:** medlemmar i samma rum ser varandra. Man fogar bara in / tar
  bort sin EGEN medlems-rad (gå med / lämna).
- **room_match_results:** bara medlemmar i rummet läser/skriver, och `updated_by`
  måste vara `auth.uid()` (ingen förfalskning av vem som skrev).

Join-via-kod går genom `join_room_by_code`-RPC (SECURITY DEFINER) så ett icke-medlem
kan slå upp EXAKT en kod för att gå med, men aldrig rad-skanna alla rum.

RLS-modellen är bevisad end-to-end med tre riktiga anonyma sessioner (nekad OCH
tillåten) i `src/data/rooms/rooms-rls.integration.test.ts`.

### Tips (T15): deadline-lås + sekretess SERVER-SIDE

- **predictions:** ett tips (gissad målställning) per (rum, match, användare). RLS:
  - **INSERT/UPDATE/DELETE nekas EFTER avspark** (deadline-lås, anti-fusk): policyn
    kräver `now() < public.match_kickoff(match_id)`. Klockan är DB:ns `now()`, aldrig
    klientens. `user_id = auth.uid()` (ingen förfalskning) + medlemskap krävs.
  - **SELECT (sekretess):** eget tips ALLTID, andras BARA efter avspark (`now() >=
    kickoff`) + medlemskap. Andras gissningar är dolda tills matchen sparkat igång.
- **match_kickoffs:** referensdata (avsparkstider) som deadline-låset slår upp via
  `match_kickoff(text)` (SECURITY DEFINER, samma härdning som `is_room_member`).
  Läsbar för alla, men INGEN skriv-policy (bara migrationer seedar), så en klient
  kan aldrig flytta en deadline. Tiderna är källåkrade ur `matches.ts` (genererade
  av `scripts/generate-kickoff-seed.ts`, värde-låsta av `kickoff-seed.test.ts`), så
  DB-tiden aldrig driftar från klient-bundlens.

Bevisat SERVER-SIDE med riktiga roller (`set role authenticated` + JWT-claims, DO-block)
av senior-developern (deadline-lås nekar efter avspark, sekretess döljer andras tips
före avspark, avslöjar efter, förfalskning + utomstående nekas), se `docs/decisions.md`
(T15). Klient-delarna som är bevisbara mot en öppen match: `predictions-rls.integration.test.ts`.

**Migration-historik (T15):** till skillnad från T14:s konsoliderade slutform (se KA-SA1
nedan) applicerades T15:s migrationer 1:1 från de committade filerna via `apply_migration`
i samma ordning: `t15_match_kickoffs_ref`, `t15_predictions_schema`, `t15_predictions_rls`,
`t15_match_kickoffs_seed`, och (Copilot C10) `t15_predictions_drop_redundant_idx` (samma fem
NAMN i `list_migrations`, samma SQL). En nyans: version-STÄMPLARNA skiljer (filerna har
`20260611120000..120400`, live fick MCP-genererade stämplar vid apply), men namnen + innehållet
är 1:1, så en fresh-replay av filträdet kör exakt samma steg i samma ordning. Ingen konsolidering,
ingen drift i slutläget (verifierat mot `list_tables`/`pg_indexes` + RLS-proven).

## T16 (#16): pool-tipsen, gruppvinnar-tips + bracket-/slutspels-tips

Två nya tabeller ovanpå T15:s mönster (bygger PÅ, bygger inte om):

- **`group_predictions`** (PK `room_id, group_id, user_id`): gissad 1:a + 2:a per grupp A..L.
  Deadline = gruppens FÖRSTA match `g-X-1` (per-grupp-lås) via ny helper `group_deadline_kickoff`.
- **`bracket_predictions`** (PK `room_id, slot_id, user_id`): vem går VIDARE per slutspels-slot
  (M73..M104) + VM-vinnaren (`slot_id = 'champion'`). Deadline = slottens egen avspark, eller
  `g-A-1` (turneringsstart) för champion, via ny helper `bracket_deadline_kickoff`.

Båda låsen + sekretessen är RLS, klockan = DB:ns `now()`, ankarena slås upp i den befintliga
`match_kickoffs` (T15, redan seedad med alla 104 kickoffs, ingen ny seed behövs). De två nya
helpers är SECURITY DEFINER med samma härdning som `match_kickoff`/`is_room_member`
(`search_path=''`, EXECUTE för anon/authenticated). FAIL-SAFE: okänd grupp/slot => NULL-deadline =>
skriv nekas + andras tips dolda. Poängreglerna (3p/2p grupp, 1..5 bracket-runda, 8p mästare) är
rena funktioner i `src/data/predictions/bonus-score.ts`. Allt i `docs/decisions.md` (T16).

Bevisat SERVER-SIDE med riktiga roller (DO-block, 9 prov: medlemskap, deadline-lås per grupp/slot/
champion, förfalskning, sekretess, utomstående) av senior-developern, med tre kickoff-tider
tillfälligt i det förflutna och återställda. Klient-delarna: `pool-predictions-rls.integration.test.ts`.

**Migration-historik (T16, samma nyans som T15):** de fyra T16-migrationerna applicerades 1:1 från
de committade filerna via `apply_migration` i samma ordning: `t16_group_predictions_schema`,
`t16_group_predictions_rls`, `t16_bracket_predictions_schema`, `t16_bracket_predictions_rls` (samma
fyra NAMN i `list_migrations`, samma SQL). Version-STÄMPLARNA skiljer (filerna har
`20260611130000..130300`, live fick MCP-genererade stämplar `20260611002406..002434` vid apply), men
namnen + innehållet är 1:1, så en fresh-replay kör exakt samma steg. Ingen konsolidering, ingen drift
i slutläget (verifierat mot `list_tables` + RLS-proven).

**Index på `predictions` (Copilot C10):** bara primärnyckeln `predictions_pkey
(room_id, match_id, user_id)` finns kvar. De ursprungliga `predictions_room_idx (room_id)` och
`predictions_room_match_idx (room_id, match_id)` var REDUNDANTA (ledande PK-prefix, PostgreSQL
"Multicolumn Indexes") och droppades, se `docs/decisions.md` T15 C10 (EXPLAIN-bevisat att PK:n
servar alla tre query-formerna).

## Migrationer

Migrationerna ligger i `supabase/migrations/` och är applicerade på projektet via
Supabase MCP (`apply_migration`). De är versionerade här för spårbarhet och så att
reviewern kan BEKRÄFTA RLS-reglerna + constraints mot källan.

**Ärlig not om historik (KA-SA1):** de committade filerna är en KONSOLIDERAD
SLUTFORM, inte en 1:1-replay av live-historiken. Live byggdes via 8 iterativa
`apply_migration`-steg (skapa RPC:er, fixa en 42702-kolumn-ambiguitet i
`join_room_by_code`, döpa om OUT-params, låsa/återställa `is_room_member`-grant),
medan de committade rums-RPC-filerna är konsoliderade till färre, renare filer (plus
schema, RLS och `rmr_match_id_format`-härdningen). `list_migrations` på projektet
visar därför 9 poster med andra namn/versioner än filerna, INTE samma uppsättning,
en fresh-replay av repot kör den konsoliderade vägen, inte den exakta live-sekvensen.
Sluttillståndet är funktionellt identiskt, verifierat mot `pg_proc`/`pg_policies`/
`pg_constraint` (search_path, SECURITY DEFINER, grants, policyer och check-constraints
matchar den konsoliderade SQL:en). Vill man reproducera EXAKT live-historiken är
`list_migrations` sanningen, inte filträdet.

## Advisor-noteringar (medvetna avvägningar)

`get_advisors (security)` flaggar WARN för (a) anonym åtkomst-policy på de tre
tabellerna och (b) att SECURITY DEFINER-RPC:erna är anropbara av anon/authenticated.
Båda är MEDVETNA: anonyma vänner ÄR användarna (Daniels val), och RPC:erna är själva
gå-med/skapa-flödet (hårda mot förfalskning, `search_path=''`, bundna till `auth.uid()`).
`is_room_member` MÅSTE vara körbar av anon/authenticated, RLS-policy-uttryck evalueras
i anroparens roll (empiriskt bevisat). Leaked-password-protection-WARNen gäller
e-post/lösenords-auth som appen inte använder. Se `docs/decisions.md` (T14).
