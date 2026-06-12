# VM 2026

En proffsig, snygg PWA för att följa fotbolls-VM 2026 tillsammans med vänner: dagens matcher
med tid, svensk TV-kanal, arena och kuriosa, gruppspelstabeller som uppdateras live, ett
dynamiskt slutspelsträd, och ett tips-spel med topplista.

- **Design/spec:** [`docs/SPEC.md`](docs/SPEC.md)
- **Projekt-karta:** [`CLAUDE.md`](CLAUDE.md)
- **Status:** design godkänd, bygge sker via Agent Kit (`/agent-kit`).

## Kom igång (bygge)

```
cd C:\Repo\vm-2026
claude
> /agent-kit
```

Dirigenten läser `docs/SPEC.md`, formar backloggen och bygger task för task. Daniel godkänner
planen per task och mergar manuellt till `develop`.

## Verifiering (kommandon)

| Vad | Kommando |
| --- | --- |
| Bygg (typkoll + bundle) | `npm run build` |
| Enhets-/komponenttester (Vitest) | `npm test` |
| E2E (Playwright) | `npm run test:e2e` |
| Lint | `npm run lint` |
| Formattering | `npm run format:check` |

### E2E (Playwright), så funkar den

- `npm run test:e2e` BYGGER appen och kör `vite preview`, sedan E2E-sviten mot det byggda dist:et
  (artefakten som deployas, inte dev-servern). Allt sker via ETT kommando (webServer i
  `playwright.config.ts`).
- **Fixtures-läge, ingen live-DB:** configen sätter inga `VITE_SUPABASE_*`-env, så appen kör mot
  fixtures-data och alla sociala providers är vilande. Sviten kräver alltså inga hemligheter och är
  deterministisk i CI.
- **Separat från `npm test`:** Vitest är pinnat till `src/` och rör aldrig `e2e/`. E2E körs bara av
  Playwright. Specarna: `e2e/flows.spec.ts` (kritiska flöden) + `e2e/a11y.spec.ts` (axe-core WCAG AA
  i ljust + mörkt tema).
- **Första gången** behövs Chromium: `npx playwright install chromium`.

Detaljer + beslut: [`docs/decisions.md`](docs/decisions.md) (T25).
