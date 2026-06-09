# Besluts-logg (VM 2026)

Varför bakom större design-beslut (lätt ADR). Nyaste överst. En rad per beslut räcker ofta,
skriv mer bara när "varför" är icke-uppenbart. Knyter till tasks/SPEC där det hjälper.

---

## 2026-06-09 , T1: Cloudflare-deploy via git-integration, inga secrets i repot

**Beslut:** Cloudflare Pages kopplas till repot via Cloudflares egen git-integration (Cloudflare
bygger repot direkt från sin dashboard), INTE via en GitHub Actions-deploy med API-token. GitHub
Actions-workflowen (`.github/workflows/ci.yml`) gör bara kvalitetsgrinden (build + test + lint) på
PR mot `develop`, den deployar inte. Koppling-instruktion: `docs/deploy.md`.
**Varför:** Daniels val denna session. Git-integration betyder att inga Cloudflare-tokens behöver
ligga i koden eller repot (PRINCIPLES §7), vilket tar bort hela secret-hanteringen för deployen.
Avvägning: en Actions-deploy ger lite mer kontroll över deploy-steget, men kostar en hemlighet att
förvalta och övervaka, inte värt det för en vänapp.

**Beslut:** T1-stacken pinnad till **Vite 7** + `@vitejs/plugin-react@^5.2.0`, Tailwind v4 via
`@tailwindcss/vite`-pluginen, `vite-plugin-pwa` för det installerbara skalet.
**Varför:** `@vitejs/plugin-react@6` kräver Vite 8 som peer, och vite-plugin-pwa stöder ännu inte
Vite 8. Vite 7 + plugin-react 5.2 + vite-plugin-pwa ger en helt ren peer-dependency-träd (ingen
`--force` / `--legacy-peer-deps`, vilket skulle dolt en verklig inkompatibilitet). Tailwind v4 använder
`@import "tailwindcss"` + Vite-plugin i stället för den gamla `tailwind.config.js`-stilen.

---

## 2026-06-09 , Inception: stack, hosting och scope låsta

**Beslut:** Stacken låst till React + Vite + TypeScript, Tailwind + Framer Motion,
vite-plugin-pwa, Supabase (Postgres + Auth + Realtime + RLS).
**Varför:** Matchar SPEC:ens WOW-/levande-mål (Framer Motion för rörelse), PWA = dela via länk
utan App Store, Supabase ger delad sanning + realtid + auth på gratisnivå utan egen backend-server.

**Beslut:** Hosting = **Cloudflare Pages** (inte Vercel). Produktion deployas från `main`,
förhandsvisning från `develop` och PR-brancher.
**Varför:** Daniels val i inception. Gratis, globalt edge-nätverk, billigare vid stor skala.
Avvägning mot Vercel: Vercel har något smidigare PR-förhandsvisningar, men skillnaden är liten
för en vän-app och Cloudflares edge + prissättning vägde över.

**Beslut:** Utökad backlog (~26 tasks, 4 faser) godkänd, utöver grund-SPEC:en.
**Varför:** Daniel bad uttryckligen om maximal kvalitet och fler roliga/vassa features. Tillägg:
bracket-tips, gamification, mini-ligor, "vad krävs"-kalkylator, what-if-simulator, delbara kort,
personlig statistik, reaktioner. Full lista i SPEC §12. Tempo: **kvalitet före tidspress** (Daniels
val), så Fas 1 byggs ordentligt, inte som en minimal snabb-deploy.

**Beslut:** Arkitektur-ryggrad = **härledd state** (tabeller/träd/poäng beräknas av rena funktioner
från matchresultat + tips) + **fixtures-först** (typad fixtures-data, miljö-gating till live Supabase).
**Varför:** Gör den kritiska FIFA-treeplats-seedningen (SPEC §5) testbar och säker, och låter hela
appen byggas innan Supabase-kontot finns. Fixtures-mönstret är bevisat i Agent Kit-playbooken.
