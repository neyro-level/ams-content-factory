# Build Status

## Current verified checkpoint

- **Current Wave:** 16 — Production package.
- **Current Task:** W16 — Docker/Nginx, migration/backup/restore runbooks and clean-DB verification; production deploy remains pending explicit infrastructure approval.
- **Completed Waves:** Waves 0, 2, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 and 15. Wave 1 foundation is implemented; its final full gate remains deferred by owner direction.
- **Last verification:** full Wave 15 quality gate passed on 2026-08-11: Prisma deploy, lint, formatting, typecheck, 3 unit tests, 18 integration contracts, 2 responsive E2E contracts and production build.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is the canonical `origin`; repository-as-code policy protects `main` and the SourceCraft `verify` CI is green.
- **External blockers:** live HeyGen and Instagram/VK execution are `BLOCKED_EXTERNAL` pending credentials and official runtime clients. Docker Desktop, WSL 2 and local PostgreSQL with pgvector are healthy; mock providers are verified.
- **Next step:** implement Wave 16 production package. No production deploy without explicit infrastructure approval.
