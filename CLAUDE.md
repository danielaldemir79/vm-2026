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

## Teknik (låst i inception 2026-06-09, se docs/decisions.md)

- PWA: React + Vite + TypeScript, Tailwind + Framer Motion, vite-plugin-pwa.
- Molnbas: Supabase (Postgres + Auth + Realtime + RLS).
- Hosting: Cloudflare Pages. Produktion deployas från `main`, förhandsvisning från `develop` + PR.
- Arkitektur: härledd state (rena funktioner) + fixtures-först (miljö-gating till live Supabase).

## Verifiering (se Agent Kit docs/verification.md)

Kommandona wire:as upp i T1 (repo-skelett). Från och med då gäller:
- Build:  `npm run build`
- Test:   `npm test` (Vitest)
- Lint:   `npm run lint` (ESLint) + `npm run format:check` (Prettier)
- Dev:    `npm run dev`
- E2E:    `npm run test:e2e` (Playwright, införs i T25 / vid behov)

Före T1 finns ingen kod att bygga, det är förväntat.

## Kommunikation (ärvs från Agent Kit docs/governance.md §1)

- Allt till Daniel: enkelt, pedagogiskt, gärna med liknelser. Han lär sig och ska vara med på resan.

## Kritisk regel: VM 2026-formatet

48 lag, 12 grupper (A till L), 32 vidare (12 ettor + 12 tvåor + 8 bästa treorna). Seedningen
av treorna in i sextondelsfinalerna följer FIFA:s förbestämda tabell och får **aldrig gissas**.
Se `docs/SPEC.md` avsnitt 5. Schema- och slutspelsdata är en egen verifierad task.

## Konventioner

- Inga em-dashes i commits eller svensk copy (komma eller bindestreck istället).
- Fokuserade filer, tester och verifiering hör till "klart" (Agent Kits PRINCIPLES).
