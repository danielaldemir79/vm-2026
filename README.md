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
