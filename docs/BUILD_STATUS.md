# Build Status

## Current verified checkpoint

- **Current Wave:** 5 — Content Engine.
- **Current Task:** W5 — ContentProject, versions, review, facts, approval and rewrite loop.
- **Completed Waves:** Wave 0 and Wave 2. Wave 1 foundation is implemented; its final full gate remains deferred by owner direction.
- **Completed within Wave 3:** W3.1 BrandProfile/Voice/Pillar, W3.2 KnowledgeDocument/Chunk and W3.3 safe URL/text/UTF-8-file ingestion, including applied migrations `20260811130457_add_brand_knowledge_foundation` and `20260811164500_add_knowledge_source_content`.
- **Last verification:** full Wave 4 quality gate passed on 2026-08-11: lint, formatting, typecheck, unit, 9 integration contracts, E2E and production build.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is the canonical `origin`; repository-as-code policy protects `main` and the SourceCraft `verify` CI is green.
- **External blockers:** none. Docker Desktop, WSL 2 and local PostgreSQL with pgvector are healthy.
- **Next step:** implement Wave 5 Content Engine. No production deploy.
