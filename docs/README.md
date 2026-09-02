# docs

| Document | What it's for |
|---|---|
| [runbook.md](runbook.md) | **Setting it up from scratch**, and what to do when something breaks. The operational one. |
| [design-ui.md](design-ui.md) | Why the UI looks the way it does — the design decisions, the constraints Astryx imposed, and what was rejected. |
| [design-inbox-adapter.md](design-inbox-adapter.md) | How the school-mail adapter was designed: the classifier, the fallback path, and why message bodies are never stored. |
| [astryx-redesign-mockups.html](astryx-redesign-mockups.html) | Static mockups from the redesign. Open in a browser. Historical — the built app is the source of truth now. |
| [screenshots/](screenshots/) | Demo-build screenshots used in the READMEs. Regenerate with `pnpm --filter @skoolie/web shots`. |

The `design-*` documents record the reasoning behind a subsystem — what was tried and rejected, not
just what shipped — because that is usually the part you cannot recover from reading the code. They
are written at a point in time and are not maintained against the code; where they disagree with the
code, the code is right.

Package-level documentation lives with the packages:

- [packages/shared](../packages/shared/README.md) — the schemas, and what an adapter owes
- [services/collector](../services/collector/README.md) — the HAC adapter and how to adapt it to your district
- [apps/web](../apps/web/README.md) — routes, demo mode, the theme pipeline
- [firebase](../firebase/README.md) — the security model
- [deploy/collector](../deploy/collector/README.md) — Docker, systemd, operating it
