# VM 2026 , projekt-karta (AI)

VM 2026-app: en proffsig, snygg PWA som Daniel delar med vänner. Gemensam live-tracker
(matcher, gruppspelstabeller, dynamiskt slutspelsträd, resultatinmatning) + ett tips-lager
med topplista. Full design: [`docs/SPEC.md`](docs/SPEC.md).

## Byggs med Agent Kit

Detta repo är **arbetsstycket**. Motorn är Agent Kit (installerat plugin), som körs via
`/agent-kit`. Ingen pipeline-maskineri bor här , bara projektets eget: denna `CLAUDE.md`,
`docs/SPEC.md`, och tasks på GitHub-boarden.

- Starta bygget: `cd C:\Repo\vm-2026 && claude` , `> /agent-kit`
- Dirigenten kör inception (Läge 2, använder `docs/SPEC.md`), bygger backlog, sen task för task.
- Branch-modell: feature-branch per task från `develop`, PR mot `develop`, Daniel mergar manuellt.
  `main` får bara release-merges.

## Teknik (förslag, låses i inception)

- PWA: React + Vite + TypeScript, Tailwind + Framer Motion, vite-plugin-pwa.
- Molnbas: Supabase (Postgres + Auth + Realtime + RLS).
- Hosting: Vercel eller Cloudflare Pages (auto-deploy från `main`).

## Kritisk regel: VM 2026-formatet

48 lag, 12 grupper (A till L), 32 vidare (12 ettor + 12 tvåor + 8 bästa treorna). Seedningen
av treorna in i sextondelsfinalerna följer FIFA:s förbestämda tabell och får **aldrig gissas**.
Se `docs/SPEC.md` avsnitt 5. Schema- och slutspelsdata är en egen verifierad task.

## Konventioner

- Inga em-dashes i commits eller svensk copy (komma eller bindestreck istället).
- Fokuserade filer, tester och verifiering hör till "klart" (Agent Kits PRINCIPLES).
