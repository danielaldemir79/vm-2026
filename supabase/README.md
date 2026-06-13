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
| `group_predictions` (T16) | Pool-tips: gissad 1:a + 2:a per grupp (A till L). |
| `bracket_predictions` (T16) | Slutspels-tips: vem går vidare per slot + VM-vinnaren. |
| `room_comments` (T66) | Korta kommentarer per rum (medlemmar snackar match, live). |
| `room_reactions` (T24) | Emoji-reaktioner på matcher per rum (en per användare+match, live). |

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
skriv nekas + andras tips dolda. Poängreglerna (3p/2p grupp, 1..5 bracket-runda, 20p mästare) är
rena funktioner i `src/data/predictions/bonus-score.ts`. Allt i `docs/decisions.md` (T16, mästar-
poängen höjd 8 -> 20 i T49 #84).

Bevisat SERVER-SIDE med riktiga roller (DO-block, 9 prov: medlemskap, deadline-lås per grupp/slot/
champion, förfalskning, sekretess, utomstående) av senior-developern, med tre kickoff-tider
tillfälligt i det förflutna och återställda. Klient-delarna: `pool-predictions-rls.integration.test.ts`.

**T53 (#95) , FÖRLÄNGD deadline för gruppvinnare + champion:** migrationen
`t53_extended_deadline_group_and_champion` ändrar `group_deadline_kickoff` och champion-grenen av
`bracket_deadline_kickoff` till `GREATEST(ursprungligt ankare, fasta söndagstiden)`, där den fasta
tiden bor i `pool_extended_deadline()` (= `2026-06-14T21:59:00Z` = sön 14/6 23:59 svensk). FÖRLÄNG,
FÖRKORTA ALDRIG: sena grupper (G..L, första match efter 14/6) behåller sitt senare ankare. SLOT-grenen
(M73..M104) + match-tipsen är OFÖRÄNDRADE (egna avsparks-lås). FAIL-SAFE bevarad (explicit null-gren).
Applicerad 1:1 från den committade filen via `apply_migration` (samma SQL; namnet i
`list_migrations` är `t53_extended_deadline_group_and_champion`). Bevisat live: read-only-frågor (alla 12 gruppers deadline =
GREATEST, ingen förkortad; champion = fasta tiden; M73 oförändrad) + ett hårt skriv-prov genom riktig
anonym session i ett isolerat test-rum (grupp A + champion skriver nu igenom RLS, städat efteråt).
Klient-spegel: `src/data/predictions/prediction-deadline.ts`. Se `docs/decisions.md` T53.

**T67 (#123) , FLYTT av den förlängda tiden 14/6 -> SÖNDAG 21/6:** migrationen
`t67_extended_deadline_to_21_june` ändrar `pool_extended_deadline()` till `2026-06-21T21:59:00Z`
(Daniels beslut: deadlinen var för nära, flyttad till söndagen veckan efter så folk hinner haka på i
helgen). T53:s GREATEST-modell är OFÖRÄNDRAD, bara konstanten byts (group_deadline_kickoff + champion-
grenen CREATE OR REPLACE:as ändå identiskt, så migrationen är en komplett fresh-replaybar ögonblicks-
bild). KONSEKVENS: alla 12 gruppers g-X-1 ligger 11-17/6 (FÖRE 21/6), så GREATEST ger nu ALLA grupper +
champion 21/6 (med 14/6 behöll G..L sitt senare 15-17/6-ankare). Slot-grenen (M73..M104) + match-tipsen
oförändrade. Applicerad via `apply_migration`; `list_migrations` visar `t67_extended_deadline_to_21_june`
(live-version `20260612101851`, MCP-stämpel skiljer från filnamnets `20260612080000`, namn + SQL 1:1).
Bevisat live (read-only): pool_extended_deadline = alla 12 gruppers deadline = champion = 21/6 21:59Z;
M73 oförändrad (28/6); ett hypotetiskt ankare 25/6 behåller 25/6 (förkorta aldrig). Klient-spegel +
beslut: `src/data/predictions/prediction-deadline.ts`, `docs/decisions.md` T67.

**T72 (#151) , PLATT deadline: grupp- + champion-tips låses när OMGÅNG 1 är spelad:** migrationen
`t72_extended_deadline_round1_flat` ändrar `pool_extended_deadline()` till `2026-06-17T20:00:00Z`
(= g-L-1, sista gruppens första match = MAX over de 12 gruppernas första match-kickoff = när omgång 1
är i spel). Daniels beslut #151: 21/6 var för sent, rättvisare att låsa när omgång 1 är spelad. T53/T67:s
GREATEST ersätts av en PLATT deadline: `group_deadline_kickoff` + champion-grenen returnerar nu samma
instant för alla (slår fortfarande upp g-X-1/g-A-1 för känd/okänd-gaten + NULL-fail-safe). SLOT-grenen
(M73..M104) + match-tipsen OFÖRÄNDRADE. Alla tre helpers CREATE OR REPLACE:as (komplett fresh-replaybar
ögonblicksbild). Applicerad via `apply_migration`; `list_migrations` visar `t72_extended_deadline_round1_flat`
(live-version `20260613101814`, MCP-stämpel skiljer från filnamnets placeholder `20260613120000`, samma
nyans som T15/T16/T53/T67; namn + exekverbar SQL 1:1). Bevisat live: (a) read-only , pool_extended_deadline
= grupp A/G/L = champion = `2026-06-17 20:00:00+00`, okänd grupp = NULL, M73 oförändrad (`2026-06-28
19:00:00+00`); (b) RIKTIG authenticated-session i ett isolerat test-rum (savepoint, rollback) , grupp +
champion skriver igenom RLS FÖRE deadline (riktig now 13/6); (c) skriv-predikat NEKAS efter deadline
(sim 18/6), tillåts före (sim 16/6); match-tips-låset g-A-1 oförändrat (egen avspark). Counts oförändrade
efteråt (14/27/154/10), 0 leftover proof-data. Klient-spegel + beslut:
`src/data/predictions/prediction-deadline.ts`, `docs/decisions.md` T72.

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

## T18 (#18): Realtime , vilka tabeller broadcastas (och vilka INTE)

Migrationen `t18_realtime_publication` lägger tre tabeller i `supabase_realtime`-
publikationen så postgres_changes-händelser skickas till anslutna klienter:

| Tabell | Varför med | Sekretess |
|---|---|---|
| `official_match_results` | Globalt facit (admin matar in) driver tracker + topplista live. | SELECT öppen (`omr_select_all`), inget att läcka. |
| `room_match_results` | Rummets delade resultat syns live för medlemmar. | RLS `rmr_select_member` = `is_room_member`, bara medlemmar får raderna. |
| `room_members` | En vän som går med syns live i rummet. | RLS `room_members_select_same_room`, bara samma-rum-medlemmar. |

**predictions / group_predictions / bracket_predictions är MEDVETET UTELÄMNADE
(sekretess-HARD):** andras tips är hemliga före avspark (RLS: eget alltid, andras bara
`now() >= kickoff`). Även om postgres_changes respekterar RLS (Supabase "Realtime
Authorization" -> "Interaction with Postgres Changes": rader skickas bara till klienter
som får läsa dem) väljer vi försvar-på-djupet: ingen tips-tabell broadcastas, så det
finns NOLL yta för en pre-avspark-tips att läcka via realtidskanalen. Tips-färskhet
drivs i stället av att resultat-/medlemshändelserna triggar en TYST RE-FETCH i klienten
(`tipsRefreshNonce`), som går genom RLS som vanligt. Se `docs/decisions.md` (T18).

Verifierbart mot live: `select tablename from pg_publication_tables where pubname =
'supabase_realtime' and schemaname = 'public'` ska ge exakt de tre tabellerna ovan
(INTE någon predictions-tabell). Klient-seamen + sekretess-beviset (onChange får aldrig
payloadens rad-data): `src/data/realtime/realtime-subscriptions.test.ts`.

**Migration-historik (T18):** applicerad 1:1 från den committade filen via
`apply_migration`; `list_migrations` visar `t18_realtime_publication` med version
`20260612072518` (samma stämpel som filnamnet, ingen drift).

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
