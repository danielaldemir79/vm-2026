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
