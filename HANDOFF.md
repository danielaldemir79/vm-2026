# HANDOFF , VM 2026

Var projektet står just nu. Nyaste överst. Bryggan mellan sessioner: disken är sanningen,
chatten är kladdpapper. En tom session ska kunna återskapa hela läget härifrån + boarden.

---

## RESUME-HERE , 2026-06-09 , T1 KLAR - PR #27 väntar på Daniels merge

**Branch:** `feature/T1-pwa-skelett-cicd` @ HEAD `5b710b2`
**PR:** https://github.com/danielaldemir79/vm-2026/pull/27 mot `develop` (Closes #1, state: OPEN)
**Board:** issue #1 ligger i kolumnen "In Review" (korrekt, dirigenten flyttar till Done EFTER Daniels merge).

**KLART med bevis (SHA + verifiering):**
- `35a4df1` - React + Vite + TS-scaffold med toolchain
- `81dd84b` - PWA-skal, app-shell-platshallare och smoke-test
- `5b710b2` - CI-kvalitetsgrind + Cloudflare-deploy via git-integration
- Lokal verifiering: lint rent, format rent, test 2/2 grönt, build grönt (sw.js + manifest.webmanifest + registerSW.js, 10 precache-entries)
- CI GitHub Actions run 27191855440: grönt pa PR #27
- Oberoende bekräftad av dirigenten: lint, format, test, build alla gröna

**PINNAD punkt (ägare Daniel):**
- Cloudflare Pages-koppling: förhandsvisning på PR-URL kräver Daniels manuella engångs-koppling i Cloudflare-dashboarden. Steg-för-steg finns i `docs/deploy.md`. Denna acceptanspunkt (issue #1) är medvetet lämnad obockad tills Daniel gjort det.

**Öppna risker:**
- **T4 (#4) kritisk FIFA-data:** treeplats-seedning får ALDRIG gissas, own review-grind. Bygg tabell-driven + uttömmande tester. Källor i SPEC §8.
- **T14 (#14) hög-risk:** Supabase/auth + RLS + secrets, inga nycklar i repo.
- **GitHub default-branch är `main`:** PR:er MÅSTE skapas med `--base develop` explicit.

**FORTSÄTTNINGS-PROMPT:**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. T1 är klar (läs `HANDOFF.md`).
>
> Om PR #27 ÄNNU INTE mergad: Daniel ska merga den manuellt mot `develop`. Påminn om
> Cloudflare-kopplingen i `docs/deploy.md` efteråt (pinnad punkt, ägare Daniel).
> Dirigenten uppdaterar board-kortet (#1) till Done efter merge.
>
> Om PR #27 REDAN mergad: plocka nästa byggbara task. T2 (#2, design/tema) och
> T3 (#3, datalager) är båda byggbara efter T1 (inga fler beroenden, se issue-bodyn).
> Välj den med lägst risk eller högst värde enligt SPEC och boarden.
> Skapa feature-branch med `--base develop`, PR med `--base develop`.
>
> OBS hela vägen: T4 (#4) kritisk FIFA-data (treeplats-tabell, aldrig gissa),
> T14 (#14) hög-risk auth (RLS + secrets).

---

## 2026-06-09 , Inception KLAR och godkänd, redo att bygga T1

**Läge:** Agent Kit Fas 0 (inception) är klar och godkänd av Daniel. SPEC utökad och låst,
26 tasks på board, redo för bygg-pipelinen. Inget byggt än (ingen kod i repot).

**Branch:** `develop`. Inception-innehåll committat i `ed524aa`, denna HANDOFF i efterföljande
commit. `main` @ `c896cfb`. Arbetsträd rent, pushat till origin.

**KLART (med bevis):**
- `docs/SPEC.md` + `CLAUDE.md` + `docs/decisions.md` + `docs/patterns.md` uppdaterade/skapade,
  committat `ed524aa` på develop, pushat.
- Stack låst: React + Vite + TS, Tailwind + Framer Motion, vite-plugin-pwa, Supabase.
  Hosting: Cloudflare Pages (produktion från main, förhandsvisning från develop/PR).
- Board (GitHub Projects #2, https://github.com/users/danielaldemir79/projects/2): 26 tasks
  (issue #1-#26), 4 faser, kolumner Backlog -> Ready -> In Progress -> In Review -> Done.
  **T1 (#1) i Ready**, resten Backlog. Etiketter: phase-0/1/2/3, critical (#4), high-risk (#14).
- Oberoende fullständighets-review: **CLEAN** (2 luckor hittade + stängda i #6 och #13).

**Mänskliga beslut redan tagna (av Daniel denna session):**
- Hela utökade menyn (26 tasks) godkänd.
- Hosting = Cloudflare Pages.
- Tempo = kvalitet före tidspress (Fas 1 byggs ordentligt, inte minimal snabb-deploy).
- Bygget startas i en färsk session.

**EXAKT nästa steg:** Bygg **T1 (#1: PWA-skelett + CI/CD + tidig deploy)**. Enda Ready-tasken,
inga beroenden. Efter T1 blir T2 (#2) och T3 (#3) byggbara (Fas 0).

**Öppna risker / OBS:**
- **T4 (#4) kritisk data:** FIFA-treeplats-seedning får ALDRIG gissas, egen review-grind.
  Källor i SPEC §8. Bygg tabell-driven + uttömmande tester.
- **T14 (#14) hög-risk:** Supabase/auth + RLS + secrets, inga nycklar i repo.
- **GitHubs default-branch är fortf. `main`** (auto-läget nekade ändring till develop).
  PR:er MÅSTE skapas med `--base develop` explicit.

**FORTSÄTTNINGS-PROMPT (starta nästa session med denna):**
> Kör `/agent-kit` i `C:\Repo\vm-2026`. Inception är klar och godkänd (läs `HANDOFF.md` +
> `docs/SPEC.md`). Plocka **T1 (#1)** från boardens Ready och bygg den genom pipelinen.
> OBS: skapa PR med `--base develop` (default-branch är `main`). Om T1 redan är mergad till
> develop: plocka nästa byggbara task (T2/T3) enligt beroenden i issue-bodyn. Är hela Fas 0
> klar: fortsätt med Fas 1 och den kritiska data-tasken T4.
