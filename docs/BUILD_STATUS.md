# Build Status

## Current verified checkpoint

- **Current Wave:** 9 — Captions & QC.
- **Current Task:** W9 — transcripts, caption tracks, burn-in and technical/visual/content quality control.
- **Completed Waves:** Waves 0, 2, 3, 3.5, 4, 5, 6, 7 and 8. Wave 1 foundation is implemented; its final full gate remains deferred by owner direction.
- **Last verification:** full Wave 8 quality gate passed on 2026-08-11: Prisma validation/migrations, lint, formatting, typecheck, unit, 13 integration contracts, E2E and production build.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is the canonical `origin`; repository-as-code policy protects `main` and the SourceCraft `verify` CI is green.
- **External blockers:** live HeyGen execution is `BLOCKED_EXTERNAL` pending credentials and official app/CLI-backed runtime configuration. Docker Desktop, WSL 2 and local PostgreSQL with pgvector are healthy; mock providers are verified.
- **Next step:** close W8 full quality gate, then implement Wave 9 Captions & QC. No production deploy.
