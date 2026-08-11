# Build Status

## Current verified checkpoint

- **Current Wave:** 3 — Brand Intelligence & Knowledge.
- **Current Task:** W3.4 — embeddings and hybrid retrieval through pgvector.
- **Completed Waves:** Wave 0 and Wave 2. Wave 1 foundation is implemented; its final full gate remains deferred by owner direction.
- **Completed within Wave 3:** W3.1 BrandProfile/Voice/Pillar, W3.2 KnowledgeDocument/Chunk and W3.3 safe URL/text/UTF-8-file ingestion, including applied migrations `20260811130457_add_brand_knowledge_foundation` and `20260811164500_add_knowledge_source_content`.
- **Last verification:** typecheck and integration tests passed on 2026-08-11; integration suite: 8 tests.
- **Remote:** intentionally absent; SourceCraft inception is allowed only after green W3.
- **External blockers:** none. Docker Desktop, WSL 2 and local PostgreSQL with pgvector are healthy.
- **Next step:** implement W3.4 using the documented Prisma 7 `Unsupported("vector")` + parameterized raw-query path.
