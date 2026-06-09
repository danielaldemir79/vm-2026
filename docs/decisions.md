# Besluts-logg (VM 2026)

Varför bakom större design-beslut (lätt ADR). Nyaste överst. En rad per beslut räcker ofta,
skriv mer bara när "varför" är icke-uppenbart. Knyter till tasks/SPEC där det hjälper.

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
