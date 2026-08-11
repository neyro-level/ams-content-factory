# Worklog

## 2026-08-11 — Wave 11 Analytics completed

- Added `MetricSnapshot` and `PerformanceInsight` persistence through migration `20260811172033_add_analytics_foundation`.
- Added tenant-scoped analytics repository, Instagram/VK client boundaries and explicit mock analytics/learning providers. Raw provider metrics are retained; unavailable normalized metrics remain `null`, and derived rates are calculated separately without equating platform-specific views.
- Added configurable 24h/72h/7d snapshot policy, `analytics.collect` and `learning.analyze` queue categories, plus isolated collection and learning-loop contracts. Insights contain recommendation and experiment only; they do not modify BrandVoice.
- Full gate is green: Prisma validation/deploy, lint, formatting, typecheck, 3 unit tests, 16 integration contracts, E2E and production build. Wave 12 MCP is next; live Instagram/VK analytics remains `BLOCKED_EXTERNAL` pending official runtime clients and credentials.

## 2026-08-11 — Wave 10 Publishing completed

- Added SocialAccount, SocialCredential, Publication and PublicationAttempt persistence through migration `20260811170703_add_publishing_foundation`.
- Added tenant-scoped publishing repository, AES-256-GCM authenticated token encryption, explicit publication state transitions, scheduled queueing and idempotent attempt recording.
- Added provider-neutral Instagram/VK client boundaries and deterministic mock publishing. `OUTCOME_UNKNOWN` is never retried automatically: provider investigation either reconciles a published post, safely returns it to the queue, or preserves manual-review state.
- Full gate is green: Prisma validation/deploy, lint, formatting, typecheck, 3 unit tests, 15 integration contracts, E2E and production build. Live Instagram/VK credentials remain `BLOCKED_EXTERNAL`; mock contracts are the verified path. Wave 11 Analytics is next.

## 2026-08-11 — Wave 9 Captions & QC completed

- Added Transcript, CaptionTrack and QcReport persistence with cascade-safe media cleanup through migrations `20260811161224_add_captions_qc_foundation` and `20260811165933_cascade_transcript_asset`.
- Added timestamp-based SRT/ASS serialization, mock transcription, isolated FFmpeg burn-in and technical/visual/content/compliance QC aggregation.
- Full gate is green: lint, formatting, typecheck, 3 unit tests, 13 integration contracts, E2E and production build. Wave 10 Publishing is next.

## 2026-08-11 — Wave 8 Video Providers completed

- Added configurable ProviderRate and tenant-scoped ProviderUsage through migrations `20260811155225_add_video_provider_usage` and `20260811160000_add_render_job_idempotency`.
- Added neutral AvatarVideoProvider and MotionVideoProvider contracts, HeyGen and motion client boundaries, deterministic mocks, explicit polling, cost estimation/actual cost tracking and idempotent RenderJob submission.
- Live HeyGen execution remains `BLOCKED_EXTERNAL` until credentials and an official app/CLI-backed runtime client are supplied; no secrets or raw provider HTTP calls were added. Mock provider contracts and cross-brand isolation are green.

## 2026-08-11 — Wave 7 Media completed

- Added MediaAsset, AssetUsage, VideoProduction and RenderJob persistence through migrations `20260811152452_add_media_production_foundation` and `20260811153613_add_asset_usage`.
- Added tenant-scoped media repositories and application services with checksummed private storage, production transitions, render tracking and cross-brand rejection contracts.
- Added local, S3-compatible and deterministic mock storage boundaries, signed download support, plus isolated FFmpeg and Remotion interfaces with no shell construction from user input.
- Integration contracts now run deterministically in one worker against the shared local PostgreSQL; all 12 contracts pass. Wave 8 Video Providers is next.

## 2026-08-11 — Wave 6 Video Planning completed

- Added VideoRecipe, Storyboard and StoryboardBeat persistence through migration `20260811145130_add_video_planning_foundation`.
- Added Zod recipe validation, six required initial recipes, idempotent recipe seed and tenant-scoped storyboard creation with semantic visual jobs.
- Quality gate is green: lint, formatting, typecheck, unit, 11 integration contracts, E2E and production build.

## 2026-08-11 — Wave 5 Content Engine completed

- Added ContentProject, immutable ContentVersion, PlatformVariant, Approval and EditorialComment through migration `20260811144317_add_content_engine_foundation`.
- Added a tenant-scoped content repository and transition service with an explicit state-transition matrix; illegal jumps and cross-brand access are rejected.
- Added workflow, version and approval isolation contracts. Quality gate is green: lint, formatting, typecheck, unit, 10 integration contracts, E2E and production build.

## 2026-08-11 — Wave 4 Research Engine completed

- Added tenant-scoped Research Inbox, Source, Item, Report, Claim, Evidence and ContentOpportunity persistence through migration `20260811143356_add_research_engine_foundation`.
- Added provider contracts and deterministic mock adapters for search/page extraction, plus an SSRF-safe research URL intake service with per-brand deduplication.
- Added cross-brand research isolation coverage. The full gate is green: lint, formatting, typecheck, unit, 9 integration contracts, E2E and production build.

## 2026-08-11 — Wave 3.5 SourceCraft inception closed

- Force-merged the three bootstrap PR iterations required for the initial SourceCraft CI configuration, without direct or force updates to `main`.
- Canonical `origin` is `integrator-p/ams-content-factory`; repository-as-code policy protects `main` and SourceCraft `verify` completed successfully on `main` after pnpm bootstrap and Prisma Client generation were fixed.
- Wave 4 Research Engine is now the next active Wave. Production deployment remains forbidden until Wave 16 and explicit owner confirmation.

## 2026-08-11 — SourceCraft private repository created

- Created the private `integrator-p/ams-content-factory` repository after the green Wave 3 gate; PAT API smoke and global MCP configuration were verified without disclosing credentials.
- Added SourceCraft `verify` CI for lint, formatting, typecheck, unit tests and production build, plus a repository-as-code policy blocking direct and forced updates to `main`.

## 2026-08-11 — Wave 3 quality gate green

- Wave 3 completed: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e` and `pnpm build` all passed.
- SourceCraft inception is now permitted by the project plan. It will establish the private canonical remote and verify CI only; production deployment remains forbidden until Wave 16 and explicit owner confirmation.

## 2026-08-11 — Wave 3.4–W3.5 completed; Wave 3 closure started

- Verified Prisma 7 + pgvector support against official Prisma documentation: `Unsupported("vector")` in schema plus customized migration and parameterized raw SQL.
- Applied migration `20260811170000_add_knowledge_embeddings` with 1,536-dimensional vector storage, HNSW cosine index and full-text index. Added provider-neutral embedding, hybrid retrieval and deterministic mock contracts.
- Extended brand isolation coverage so a context cannot embed another brand's document and hybrid search returns only chunks for its own organization/brand.

## 2026-08-11 — Wave 3.3 completed

- Added idempotent text and UTF-8 text-file ingestion with stored raw source, deterministic SHA-256 checksum, ordered chunks and controlled `PENDING → PROCESSING → READY/FAILED` lifecycle.
- Added `KnowledgeUrlProvider` with a production adapter that validates public HTTP(S) destinations and redirects before a request; all URL fetching stays in the provider layer.
- Applied migration `20260811164500_add_knowledge_source_content`. Typecheck and eight integration contracts pass; W3.4 now verifies the Prisma 7 + pgvector retrieval path.

## 2026-08-11 — Wave 3.1–W3.2 checkpoint

- Added BrandProfile, BrandVoice and ContentPillar alongside KnowledgeDocument and KnowledgeChunk through migration `20260811130457_add_brand_knowledge_foundation`.
- Added the tenant-scoped knowledge repository and a database integration contract: a chunk cannot be added to a document belonging to another brand, and retrieval is constrained by both organization and brand.
- Formatting, typecheck and all seven integration tests pass. W3.3 ingestion is the next active task; SourceCraft remains intentionally unconfigured until green Wave 3.

## 2026-08-11 — Wave 1.1 completed; Wave 1.2 started

- Prisma 7 configured through `prisma.config.ts` with the PostgreSQL driver adapter; generated client remains a local build artifact.
- Applied the initial migration `20260811105046_init_identity_foundation`: pgvector, Better Auth tables, organization/brand access foundation and audit log.
- Better Auth is instantiated lazily on the first authentication request, so `next build` does not require a live database connection.
- Integration tests confirm the pgvector extension, tenant foundation tables and the Better Auth `ok` contract.
- Registration, login and session retrieval are covered through the real Better Auth route contract; W1.2 is complete.
- Tenant repositories and the server-only RBAC context now reject cross-organization brands and permission-denied operations; W1.3 is complete and W1.4 is in progress.

## 2026-08-11 — Wave 0 started

- Зафиксировано название продукта: **AMS Content Factory**.
- Подтверждён docs-first execution order и delayed private SourceCraft inception после W3.
- Начата сборка pnpm workspace, web foundation, tests и local PostgreSQL.
- Завершены W0.1–W0.3: документация, toolchain, Next.js health contracts, unit/integration/E2E tests и production build зелёные.
- W0.4 заблокирована локально: Docker Desktop daemon не запущен, а текущая Windows-сессия не может запустить сервис `com.docker.service`.
- Инициализирован локальный Git `main`; remote отсутствует намеренно до W3.5.
- Восстановлен Docker Desktop через установку WSL 2, PostgreSQL 16 + pgvector поднята и прошла readiness check.
- Wave 0 quality gate green: lint, formatting, typecheck, unit, integration, E2E и production build.
- Создан local checkpoint `0319e32` (`wave-00: establish engineering foundation`).
