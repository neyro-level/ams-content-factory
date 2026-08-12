# Worklog

## 2026-08-12 — Wave 1.3: secure n8n tenant binding

- Replaced the global inbound webhook secret and caller-supplied organization header with encrypted
  `InboundWebhookCredential`: an active `keyId` determines its organization server-side.
- Added canonical HMAC signing for method, topic, key ID, brand ID, idempotency key and body hash. Brand
  UUID, active organization ownership and duplicate workflow creation are all verified before enqueueing.
- Added integration coverage for unknown key, wrong secret, malformed UUID, foreign/tampered brand and
  duplicate delivery; next task: W1.4 — tenant-scope repository cleanup.

## 2026-08-12 — Wave 1.2: suspended organization deny

- Added an explicit active-organization check at the server-side tenant-context boundary. A user with an
  otherwise active OWNER or ADMIN membership cannot receive a context while the organization is
  `SUSPENDED`.
- Extended the integration contract to cover suspended organization, suspended membership, archived brand
  and soft-deleted brand denial. The first new case failed before the change and all 18 integration
  contracts pass after it.
- Next task: W1.3 — secure n8n tenant binding.

## 2026-08-12 — Wave 1.1: QC fail-closed

- Replaced the hard-coded `PASSED` write in `createQc()` with typed technical/visual/content (and optional
  compliance) sections plus a persisted result from `evaluateQc()`.
- Added the complete status contract: each required-section failure and compliance failure yields `FAILED`,
  issues without a failure yield `WARNING`, and only a clean all-pass result yields `PASSED`.
- Proved the prior defect fail-first: a visual failure was persisted as `PASSED`; the integration contract
  now proves it is persisted as `FAILED`. No schema migration was needed because `QcStatus.WARNING` already
  exists.
- Next task: W1.2 — deny suspended organizations in tenant context resolution.

## 2026-08-12 — Wave 0.2: truthful status reset

- Reclassified project status to `FOUNDATION`, `NOT_IMPLEMENTED` and `BLOCKED_EXTERNAL` in the README,
  implementation report, build status and historical execution record. Removed claims that contract-only
  modules or the static shell are ready.
- Replaced the root screen's four false ready badges with explicit `NOT_IMPLEMENTED` module states. The
  screen remains a static foundation/status shell; it is not a product workspace.
- Made Playwright's web server port configurable through `E2E_PORT`; this keeps the proof isolated when
  another local application already owns port 3000.
- Next task: W1.1, make QC fail closed and prove every QC outcome with unit and integration tests.

## 2026-08-12 — Wave 0.1: reset source of truth

- Added `docs/MASTER_IMPLEMENTATION_PLAN.md` from the owner-approved Master Plan #2. It is the single
  current implementation plan: code, not previous implementation reports, determines whether a module is
  ready.
- Marked `docs/MASTER_DEVELOPMENT_PLAN.md` as historical/reference and repointed the project routers and
  passport to the new plan. No application code, schema, migration, infrastructure or production runtime
  changed in this task.
- Next task: W0.2, remove false ready claims from public/project status documents and the static home shell.

## 2026-08-12 — AMS Server immutable artifact path

- Added the production-only Next standalone output plus an explicitly bundled Node 22 worker; `pnpm build`
  verifies both processes. The worker bundler is a direct locked development dependency rather than a
  transitive tool, and the duplicate `pg-boss` package declaration was removed.
- Added `deploy/ams-server/Dockerfile`: it builds an exact Linux release from a supplied full Git SHA,
  includes static assets, Prisma CLI/schema/migrations and creates `release.json`. Docker is used only on
  the trusted builder; AMS Server continues to run host Nginx and systemd.
- Added guarded artifact extraction, pre-activation migration/seed and atomic `current` switch helpers,
  plus inactive systemd and ACME/HTTPS Nginx templates for `fabrika.ams24.ru`. No files on AMS Server,
  database schema, service, vhost or certificate were changed by this repository work.
- Verified a deliberately non-activatable Linux test artifact. Development tools are pruned from its payload;
  its current size is about 861 MB before archive compression, so capacity for current and rollback releases
  remains an explicit AMS Server release-gate check.
- The new path remains `BLOCKED_EXTERNAL` for production activation: Timeweb must install the `vector` SQL
  object in the Fabrika database before migrations can run. It does not weaken main protection or enable a
  deploy from this feature branch.

## 2026-08-11 — AMS Server and `fabrika.ams24.ru` production preparation

- Corrected the server scope: AMS Content Factory belongs to the AMS Server, not Bastion. Bastion received
  only an earlier read-only audit and no changes.
- Verified the DNS A-record `fabrika.ams24.ru -> 5.42.100.161`, AMS Server SSH access, host Nginx,
  Certbot and Node 22.22.2. HTTPS currently presents a certificate for another hostname; no public vhost
  or service has been activated for the new domain.
- Created the isolated AMS Server layout `/opt/ams-platform/ams-content-factory/{releases,shared}` and
  `/var/log/ams-platform/ams-content-factory`, then transferred a checksummed SourceCraft-main
  `ce7e9f7` source snapshot into an inactive staging release. No `current` link, systemd service, Nginx
  configuration, migration or application process was created.
- Verified the supplied Timeweb DBaaS connection from AMS Server through the private network. The runtime
  user cannot enable `pgvector`, and the extension is absent; migration and activation remain
  `BLOCKED_EXTERNAL` until it is enabled in Timeweb or an extension-capable database user is supplied.
- Adopted the existing AMS Server canonical runtime profile: host Nginx + Certbot + systemd immutable
  releases. The project Docker Compose package remains portable/verification-only on this server.
- The server currently has 2 GB RAM and 5.6 GB free disk; expand resources before activating web and
  worker.

## 2026-08-12 — Timeweb pgvector provider configuration

- Verified the supplied Fabrika DBaaS endpoint from AMS Server and enabled `pgvector` for its only
  `default_db` instance through the authenticated Timeweb API. PostgreSQL now lists `vector` as an
  available extension package.
- The SQL object remains absent: the managed database owner is provider-controlled `root`, while the
  application runtime user correctly receives `Must be superuser to create this extension`. The Timeweb
  API exposes extension configuration but has no separate extension-install action.
- No schema migration, `current` link, systemd service, Nginx vhost or TLS cutover was attempted. These
  remain blocked until Timeweb installs `vector` in `default_db` or supplies an extension-capable
  operator connection.

## 2026-08-11 — GitHub legacy mirror created

- Created private `neyro-level/ams-content-factory`, added it as `github-legacy` and copied `main`,
  all existing `work/*` branches and tags.
- SourceCraft remains the only canonical `origin`, merge gate and future deployment path. GitHub is
  updated only when the owner explicitly asks for a mirror save; no production action was performed.

## 2026-08-11 — Documentation and passport audit

- Verified all required root and technical documents against `main`, the Prisma schema, the runtime
  scripts and SourceCraft remote policy.
- Expanded `01_PROJECT_PASSPORT.md` into the full product/architecture/runtime passport and completed
  `docs/DATA_MODEL.md` through Waves 4–13 plus cross-cutting state.
- Corrected active-document drift: SourceCraft policy is now present-state rather than a pre-W3.5
  instruction, W14/design-system wording is consistent, and local onboarding uses the new
  `.env.development.example` instead of the Timeweb production template.
- Replaced the imported other-project design document with an AMS Content Factory legacy redirect and
  expanded `03_DESIGN_SYSTEM.md` into the canonical, code-aligned operational UI baseline.

## 2026-08-11 — Production database switched to Timeweb Cloud DBaaS

- Aligned the Wave 16 package with the Master Plan and owner decision: production PostgreSQL is now exclusively Timeweb Cloud DBaaS with pgvector; it is not started by `docker-compose.prod.yml` and has no application-managed database volume.
- Kept Docker PostgreSQL 16 + pgvector only in `docker-compose.dev.yml` for isolated development and test work. Production Compose now runs web, worker, Nginx and one-shot migration/seed/logical-backup/restore clients.
- Updated the environment contract, Timeweb/TLS/pgvector preparation checklist, operations, deployment and recovery runbooks. No production infrastructure was created or deployed; Timeweb cluster, connection, TLS and backup-policy setup remain `BLOCKED_EXTERNAL` until the owner provisions them.
- Verified Compose and portable POSIX shell syntax, then passed Prisma validation, lint, formatting, typecheck, unit, integration, E2E and production build on Node 22.13.

## 2026-08-11 — Wave 16 Production package completed

- Added a pinned Node 22.13 Docker image, initial production Compose topology and Nginx reverse proxy with restrictive headers. The initial self-hosted PostgreSQL topology was superseded by the Timeweb Cloud DBaaS decision above.
- Made `/api/health/ready` verify PostgreSQL via a database repository and core application service; `/api/health/live` remains process liveness. Added a worker start command and a pnpm v11 `allowBuilds` policy that approves only reviewed `esbuild` postinstall.
- Added idempotent migrations/seed operations, backup/restore/deploy scripts, environment contract, production checklist and runbooks. Seed initializes only global video recipes and evaluation suites, never demo tenants or social publications.
- Applied all 18 migrations and seed to an isolated clean PostgreSQL 16 + pgvector container, then passed Prisma validation, lint, formatting, typecheck, 4 unit tests, 18 integration contracts, 2 responsive E2E contracts and production build.
- Docker image construction was attempted twice; the only failure was npm registry socket resets inside Docker after base image and system setup. Production deploy is not attempted and is `BLOCKED_EXTERNAL` pending infrastructure inputs and explicit owner confirmation.

## 2026-08-11 — Wave 15 Hardening completed

- Completed security and architecture audits in `docs/HARDENING_AUDIT.md`; production dependency audit reports zero vulnerabilities.
- Fixed the direct Prisma boundary violation by moving pgvector embedding writes and hybrid retrieval from core into the tenant-scoped knowledge repository.
- Repeated all mandatory verification: Prisma deploy, lint, formatting, typecheck, 3 unit tests, 18 integration contracts, 2 responsive E2E contracts and production build.

## 2026-08-11 — Wave 14 UX completed

- Replaced the temporary foundation screen with a neutral accessible operational workspace shell aligned to `DESIGN_SYSTEM_PENDING`: light canvas, white data surfaces, blue-gray accent, visible focus and semantic status presentation.
- Added responsive desktop/tablet/mobile composition, an explicit no-active-brand empty state and disabled actions with accessible explanation; no product data or direct database access was introduced into the UI.
- Added Playwright contracts for the accessible workspace and a 390px mobile viewport with no horizontal overflow. Lint, typecheck, E2E and production build are green.

## 2026-08-11 — Wave 13 AI Evals completed

- Added EvaluationSuite, EvaluationCase, EvaluationRun and EvaluationResult through migration `20260811174210_add_ai_evaluation_foundation`.
- Seeded the required content-quality, brand-voice, factuality, research-quality and storyboard-quality suites. Cases retain input, expected/forbidden properties, reference context and tags; runs retain compared old/new prompt metadata.
- Added deterministic run state machine and regression contract: every suite case requires a result, and any failed case marks the run failed.
- Full gate is green: Prisma validation/deploy, lint, formatting, typecheck, 3 unit tests, 18 integration contracts, E2E and production build. Wave 14 UX is next.

## 2026-08-11 — Wave 12 MCP & Webhooks completed

- Added hash-only scoped API keys, encrypted outbound webhook endpoint secrets and auditable webhook deliveries through migration `20260811173054_add_mcp_webhook_foundation`.
- Added official MCP SDK server shell with the approved tool catalogue delegated to application-service handlers; no Prisma access or independent business logic lives in the MCP application.
- Added validated HMAC-signed n8n Route Handler for research/content/events and an outbound HTTPS webhook service with HMAC delivery signatures. Plaintext API keys and endpoint secrets are never persisted.
- Full gate is green: Prisma validation/deploy, lint, formatting, typecheck, 3 unit tests, 17 integration contracts, E2E and production build. Wave 13 AI Evals is next.

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
