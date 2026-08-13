# Worklog

## 2026-08-13 — W18.2 bounded PostgreSQL rate limiting

- Added an atomic PostgreSQL window limiter that stores only SHA-256 subject hashes. It protects authentication POST,
  inbound n8n delivery, each MCP tool invocation, AI draft generation and external URL/search/indexing entry points;
  local text/file intake remains outside the external-provider bucket.
- The limit repository uses one conflict-safe UPSERT, so simultaneous calls cannot exceed the accepted count. Nginx
  forwards `X-Real-IP` in both the AMS Server and portable Compose profiles; public runtime remains proxy-only.
- Full local gate passed: Prisma migration/generation, lint, formatting, workspace typecheck, 69 unit tests, 77
  PostgreSQL integration contracts and production web/worker builds. The parallel repository contract accepts three
  and rejects three of six simultaneous calls without storing the raw subject. Next: W18.3 outbound webhook SSRF.

## 2026-08-13 — W18.1 real web and worker readiness

- Web `/api/health/ready` now fails closed when either runtime configuration or PostgreSQL is unavailable; it remains
  a safe status-only response and never exposes validation details or connection data.
- The worker now opens a loopback-only probe on `127.0.0.1:3205` after its actual bootstrap validates configuration,
  reaches PostgreSQL/pg-boss, reconciles durable work and registers its handlers. The AMS Server runbook records the
  corresponding internal proof command; no server or production configuration was changed.
- Full local gate passed: Prisma validation/generation, lint, formatting, workspace typecheck, 68 unit tests, 76
  PostgreSQL integration contracts and production web/worker builds. The build uses one-time shell test values rather
  than a real secret; runtime validation still rejects the empty local template. Next: SourceCraft PR, then W18.2
  rate limiting.

## 2026-08-13 — W17 bounded query budgets and index audit

- Publication transitions now distinguish a lightweight tenant-scoped summary from provider reads. Provider reads
  select only the required social credential fields, variant copy and one relevant attempt; scheduling and worker
  checks no longer hydrate provider relations or credentials.
- Content detail now returns bounded current/history samples with true counts and exposes independently cursor-paged
  versions, approvals and comments. Analytics snapshots retain deterministic cursor pagination with a narrowed
  projection. The index audit added only the due-publication and project-list indexes, recorded in migration
  `20260813054003_add_performance_query_indexes`.
- Full local gate passed: Prisma validation/generation, lint, formatting, workspace typecheck, 65 unit tests,
  75 PostgreSQL integration contracts and production web/worker builds. SourceCraft verify remains required before
  W18.

## 2026-08-13 — CI deterministic research URL isolation

- Made the research URL-isolation contract independent of external DNS: its `example.com` lookup is a test-only
  public-address fixture. Production SSRF validation and the page-fetch boundary are unchanged, so a CI resolver
  cannot turn a valid tenant-isolation contract into a non-deterministic failure.
- SourceCraft quality gate is split into bounded database, install/migrate/seed, static, test and build cubes after
  the platform's five-minute cube limit blocked the previous monolithic gate. The full local gate and the repaired
  main verify remain required before W17 begins. Local validation passed: Prisma validation, lint, formatting,
  workspace typecheck, 65 unit tests, 75 PostgreSQL integration contracts and production web/worker builds.

## 2026-08-13 — W16.3–W16.4 audit expansion and error reporter

- Added durable audit records for brand/API-key create/revoke, editorial approve/reject, publication scheduling,
  provider dispatch and reconciliation. They store tenant/resource identifiers and safe action metadata only; neither
  bearer keys nor social credentials are included.
- Added a minimal infrastructure-compatible error reporter that accepts an optional sink and redacts both error text
  and arbitrary context first. Full local gate passed: Prisma validation, lint, formatting, workspace typecheck,
  65 unit tests, 75 PostgreSQL integration contracts and production web/worker builds. Next: W17 performance
  hardening.

## 2026-08-13 — W16.1–W16.2 structured logger and secret redaction

- Added a closed-schema structured logger with approved correlation and outcome fields. Arbitrary metadata cannot be
  attached to normal events. `redactSecrets` recursively removes password, cookie, token, webhook/API secret and
  encryption-key fields plus bearer and raw MCP token strings before a sink receives free-form context.
- Prisma validation, lint, formatting, workspace typecheck and 64 unit tests passed. Next: W16.3 audit expansion.

## 2026-08-13 — W15.6 MCP negative security tests

- Added protocol-level in-memory MCP contracts proving a read-only key cannot invoke a write tool and an unknown tool
  returns an MCP error without reaching any handler. PostgreSQL contracts prove revoked and expired keys fail before
  usage tracking; existing guard contracts cover foreign brands and wrong-scope denial.
- W15 MCP runtime remains `FOUNDATION`: it is scoped and fail-closed, while live process launch stays
  `BLOCKED_EXTERNAL` until a production scoped key is provisioned through approved secret storage. Full local gate
  passed: Prisma validation, lint, formatting, workspace typecheck, 62 unit tests, 74 PostgreSQL integration
  contracts and production web/worker builds. Next: W16.

## 2026-08-13 — W15.5b MCP application-service tools

- Bound the full planned MCP catalogue to tenant-scoped knowledge, research, content, editorial, calendar and
  analytics application services. Added a bounded tenant-scoped content-opportunity list to the research workspace;
  MCP does not query Prisma directly.
- The transport boundary now requires the permission implied by the API key before brand validation and handler
  invocation. A read-only key cannot reach a write tool even when its bound user has broader membership rights.
  Missing generation or retrieval provider configuration remains `BLOCKED_EXTERNAL`, never a fabricated success.
  Full local gate passed: Prisma validation, lint, formatting, workspace typecheck, 60 unit tests, 73 PostgreSQL
  integration contracts and production web/worker builds. Next: W15.6 negative MCP runtime tests.

## 2026-08-13 — W15.5a MCP actor binding

- Added a nullable `ApiKey.actorUserId` relation through migration `20260813001952_add_mcp_api_key_actor`. New keys
  require an active actor with API-management permission. Authentication re-resolves that actor's membership and
  exposes only the intersection of the API-key scopes and real actor permissions.
- Existing unbound keys are intentionally authentication-ineligible: the migration preserves their rows but fails
  closed rather than guessing an actor. PostgreSQL tests also prove a suspended organization invalidates a previously
  bound key. Next: W15.5b bind the MCP tool catalogue to tenant-scoped application services.

## 2026-08-13 — W15.4 startable MCP stdio runtime

- Added the executable `apps/mcp` entrypoint. It accepts only a runtime `MCP_API_KEY`, resolves its read scope before
  constructing the MCP server, then connects a real stdio transport. The bearer is consumed at the boundary and never
  reaches the server factory or a future tool handler.
- The runtime fails closed before stdio startup when the key is missing or authentication fails. It deliberately has no
  mock business tools: W15.5 must bind the catalogue to existing tenant-scoped application services. Live use remains
  `BLOCKED_EXTERNAL` until an operator provisions and injects an active scoped key via approved secret storage.
- Full local gate passed: Prisma validation, lint, formatting, workspace typecheck, 59 unit tests, 72 PostgreSQL
  integration contracts and production web/worker builds. The missing-key process check also proves fail-closed
  startup under Node 22.13. Next: W15.5 real tenant-scoped MCP tool handlers.

## 2026-08-13 — W15.3 MCP API-key usage semantics

- `authenticate` now validates a token hash, active state and required scope without writing to the database.
  The MCP authentication edge calls the separate `markUsed` method only after it receives an authenticated,
  token-free context, binding the update to the exact organization and API-key id.
- Unit and PostgreSQL contracts prove insufficient scope does not update `lastUsedAt`, while an authenticated
  context does. Prisma validation, lint, formatting, typecheck, 56 unit tests and production web build passed;
  browser coverage remains applicable because no web route or component changed. Next: W15.4 startable MCP runtime entrypoint.

## 2026-08-13 — W15.2 MCP brand-in-organization guard

- All MCP tools that receive a `brandId` now use one shared guard before their handler. It accepts only an active,
  non-deleted brand in the organization bound to the authenticated API key; list-brands remains organization-scoped
  and requires no brand lookup.
- Unit coverage proves a rejected guard never reaches a tool handler. PostgreSQL coverage proves own active brands
  pass while foreign and soft-deleted brands fail closed. The MCP/core-only change passed Prisma validation, lint,
  formatting, typecheck, 56 unit tests, 72 PostgreSQL integration contracts and production build; W15.1 browser
  coverage remains applicable because no web route or component changed. Next: W15.3 API-key successful-auth usage semantics.

## 2026-08-13 — W15.1 MCP authenticated context

- MCP now resolves a strict bearer API key before constructing tool handlers. The authenticated handler input is
  immutable `McpAuthContext` containing only organization, API-key id, scopes and derived permissions; the bearer
  token itself cannot reach tool code.
- Missing, malformed, revoked, expired or insufficiently scoped keys fail before a handler is invoked. Usage
  tracking remains on the existing successful-auth path; W15.3 will isolate its precise mutation semantics.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 54 unit tests, 71 PostgreSQL integration
  contracts, production build and 13 browser E2E flows. Unit contracts cover exact bearer parsing, context
  propagation and insufficient scope. Next: W15.2 brand-in-organization validation before every MCP brand tool.

## 2026-08-13 — W14.6 protected per-brand analytics dashboard

- Added a tenant-bound dashboard service and protected brand route backed only by normalized persisted snapshots.
  It selects the latest snapshot per publication before aggregating views, reach, impressions, engagement, clicks
  and follower delta, so collection checkpoints cannot be double counted.
- Platform, pillar and linked content-opportunity topic comparisons use existing model relations. Top and low
  content are ranked by engagement rate against the first available reach, impressions or views denominator.
  Missing provider metrics render as unavailable and the empty state makes no mock-performance claim.
- PostgreSQL and browser contracts prove aggregation, active-brand isolation, authentication and dashboard
  rendering. Full gate passed: Prisma validation, lint, formatting, typecheck, 52 unit tests, 71 PostgreSQL
  integration contracts, production build and 13 browser E2E flows.
- Next: W15.1 MCP server boundary and scoped API-key runtime.

## 2026-08-13 — W14.5 bounded tenant history pagination

- Added a deterministic `take`/`cursor` contract to history reads for knowledge, research/evidence/claims,
  content projects, media assets, social accounts, publication operations, snapshots/insights, MCP keys and
  evaluation cases. Defaults and maxima bound every returned page; sort orders add `id` as a stable tie-breaker.
- Workspace and application services pass optional page inputs through their tenant-bound boundary. The query
  predicates remain organization-and-brand scoped; a PostgreSQL contract proves a foreign cursor cannot return
  a foreign project while subsequent pages advance correctly.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 52 unit tests, 70 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W14.6 protected per-brand analytics dashboard.

## 2026-08-13 — W14.4 durable analytics collection worker

- Registered `analytics.collect` in the real worker dispatcher. The handler accepts only a due workflow with an
  active brand scope and a valid `publicationId`/`capturedAt` payload, then calls the existing tenant-scoped core
  service; it does not access Prisma or provider HTTP clients directly.
- Malformed payloads, foreign publications and prematurely delivered jobs fail closed and the workflow transition
  persists `FAILED` without a metric snapshot. Missing runtime provider configuration is represented by an explicit
  `UnavailableAnalyticsProvider`, never a mock success.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 52 unit tests, 69 PostgreSQL integration
  contracts, production build and 12 browser E2E flows. Live analytics remains `BLOCKED_EXTERNAL` until connected
  social credentials and provider configuration are present.
- Next: W14.5 bounded cursor pagination for history lists.

## 2026-08-13 — W14.3 Instagram analytics runtime adapter

- Added a bounded, read-only Instagram Graph adapter. It validates numeric account/media ids, reads direct media
  like/comment counters and Media Insights values for impressions, reach, shares and saved media; unavailable
  fields are not fabricated.
- Missing version/token, malformed identifiers, Graph errors, timeouts and an absent media object fail closed.
  The access token exists only for the outbound request and cannot appear in normalized/raw metrics or errors.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 52 unit tests, 68 PostgreSQL integration
  contracts, production build and 12 browser E2E flows. Live analytics remains `BLOCKED_EXTERNAL`: no connected
  Instagram credential is present and W14.4 has not yet attached analytics collection to the real worker.
- Next: W14.4 real `analytics.collect` worker handler.

## 2026-08-13 — W14.2 VK analytics runtime adapter

- Added a bounded read-only VK `wall.getById` adapter in the provider layer. It accepts only a numeric connected
  account and a matching `<owner_id>_<post_id>`, then normalizes only metrics actually returned by VK: views,
  likes, comments and reposts (as shares). Reach, clicks and saves are intentionally not fabricated.
- Missing version/token, malformed or foreign ids, API errors, timeouts, empty/malformed responses and absent
  posts fail closed. The token is used only in the outbound request and is excluded from raw metrics and errors.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 49 unit tests, 68 PostgreSQL integration
  contracts, production build and 12 browser E2E flows. Live analytics remains `BLOCKED_EXTERNAL`: no connected
  account credential is present and W14.4 has not yet attached collection to the real worker.
- Next: W14.3 fail-closed Instagram analytics runtime adapter.

## 2026-08-13 — W14.1 durable analytics scheduling

- Added the nullable `WorkflowRun.scheduledFor` field and queue index through a Prisma migration. Queue
  reconciliation now returns queued runs only when their schedule is absent or already due; existing immediate
  workflows retain their previous behaviour.
- A published active-brand publication now has a scoped scheduler that persists exactly three idempotent
  `analytics.collect` intents for +24, +72 and +168 hours. It makes no provider call and sends no premature job;
  W14.4 will bind due intents to the real worker handler.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 46 unit tests, 68 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W14.2 fail-closed VK analytics runtime adapter; live provider access remains `BLOCKED_EXTERNAL`.

## 2026-08-13 — W13.6 provider-failure operator UX

- The protected active-brand calendar now reads a separate scoped issue DTO: failed and uncertain publications
  include only title, platform, account name, state and a safe error code; `errorMessage`, provider response and
  every credential field remain outside the page data.
- Expired or errored social accounts are shown with a direct link to the brand account workspace. `OUTCOME_UNKNOWN`
  explicitly tells the operator not to re-publish before provider reconciliation, while failed attempts direct them
  to repair the connection before a controlled retry. PostgreSQL and browser contracts prove the states render.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 46 unit tests, 67 PostgreSQL integration
  contracts, production build and 12 browser E2E flows. One initial unrelated research integration timeout was
  immediately rerun successfully as 67/67, confirming a transient database-load condition rather than a regression.
- Next: W14 scoped analytics collection and learning loop; live provider access remains `BLOCKED_EXTERNAL`.

## 2026-08-13 — W13.5 publication mutation idempotency

- Added a PostgreSQL concurrency contract that pauses the first provider mutation, launches twenty duplicate
  dispatches, then makes its result `OUTCOME_UNKNOWN`. Exactly one external provider call is recorded; the
  duplicates fail with an in-progress or uncertainty outcome and a later retry remains blocked until controlled
  reconciliation.
- The guarantee is made by the existing transactionally acquired `PublicationAttempt` per publication and
  idempotency key; the database lock is released before the provider call, so it does not hold a transaction
  across an external network boundary.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 46 unit tests, 67 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W13.6 provider-failure operator UX without credential disclosure.

## 2026-08-13 — W13.4 credential-aware publication reconciliation

- Moved publication outcome investigation to the same encrypted-credential boundary as publication itself:
  the application decrypts the active-brand account token immediately before the provider status request and
  does not put it into a database record, normalized response, audit event or log.
- VK `wall.getById` and Instagram Graph media lookup now make bounded authenticated reconciliation calls. Missing
  credentials, malformed status responses, provider errors and timeouts fail closed: they preserve
  `OUTCOME_UNKNOWN` and cannot trigger a second external mutation. The PostgreSQL contract proves the decrypted
  token reaches only the test provider input during investigation.
- Next: W13.5 provider-call idempotency proof for duplicate and concurrent dispatch paths.

## 2026-08-13 — W13.3 durable publication dispatch worker

- Registered the `publication.dispatch` pg-boss consumer. It loads the durable workflow from PostgreSQL, validates
  the brand-scoped payload, atomically claims only a due `QUEUED` publication and invokes the provider through the
  existing encrypted-credential and idempotent attempt boundary.
- Cancelled, future/rescheduled, already-started, missing and cross-brand records are skipped before an external
  call. Missing runtime provider configuration uses an explicit `UnavailablePublishingProvider`, never a mock;
  a real provider error becomes a durable failed attempt/publication/workflow.
- Added worker package dependencies explicitly and expanded readiness to report all three registered queues.
  Full gate passed: Prisma validation, lint, formatting, typecheck, 46 unit tests, 66 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W13.4 credential-aware outcome investigation.

## 2026-08-13 — W13.2 Instagram publishing provider boundary

- Added a provider-layer Instagram Graph API v22.0 client that creates one public image container and then calls
  `media_publish`. It returns only normalized provider IDs and never includes the OAuth access token in its result.
- The adapter accepts exactly one public HTTPS image URL. Private S3 keys, loopback/private URLs, unsupported
  media shapes, malformed account IDs, Graph errors and timeouts fail closed. Credential-free status lookup is
  deliberately `OUTCOME_UNKNOWN` until W13.4 adds the safe reconciliation boundary.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 46 unit tests, 65 PostgreSQL integration
  contracts, production build and 12 browser E2E flows. Live Instagram remains `BLOCKED_EXTERNAL` pending a
  connected OAuth account and public media delivery/upload path.
- Next: W13.3 durable publication dispatch worker.

## 2026-08-12 — W13.1 VK publishing provider boundary

- Added a provider-layer VK API v5.199 runtime client for text-only `wall.post` and `wall.getById`
  reconciliation. It uses the encrypted account OAuth token only for the outbound request and never returns it
  in a normalized result, error or audit payload.
- Missing configuration, malformed owner ID, upstream VK error, timeout, malformed response and an internal
  media key all fail closed. Media publication is intentionally unavailable until a dedicated VK upload pipeline
  exists; no mock post is created.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 43 unit tests, 65 PostgreSQL integration
  contracts, production build and 12 browser E2E flows. Live VK remains `BLOCKED_EXTERNAL` pending real OAuth
  account tokens and media-upload implementation.
- Next: W13.2 Instagram provider boundary.

## 2026-08-12 — W12.6 safe publication cancellation

- A publication can now transition atomically from `QUEUED` to `CANCELLED` only in its active brand and before
  any dispatch attempt. A cancelled record cannot be scheduled, rescheduled or cancelled again through the
  application service, and no social provider is invoked.
- Calendar reads now explicitly select only `QUEUED` publication records. The protected UI action, PostgreSQL
  contracts and browser flow prove that a cancellation is immediately absent from the scheduled view.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 65 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W13.1 real VK publishing-provider boundary; live communication remains `BLOCKED_EXTERNAL` pending
  external app credentials.

## 2026-08-12 — W12.5 safe publication rescheduling

- A future time can now be changed only on the same active-brand `QUEUED` publication before it has a
  `lastAttemptId`. The scoped atomic update retains the publication identity, so rescheduling never creates a
  second publication or calls a social provider.
- The protected calendar exposes the reschedule form only for queued records. Integration coverage proves the
  retained ID, no duplicate record and foreign-brand denial; E2E covers the real calendar action and local-time
  normalization.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 65 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W12.6 cancel a queued publication before external dispatch.

## 2026-08-12 — W12.4 durable publication scheduler

- PostgreSQL now remains the source of truth for due `QUEUED` publications. The scheduler reads a stable,
  bounded active-brand batch, creates or reuses `publication-dispatch:<publicationId>` workflow intent and
  sends a pg-boss singleton job; repeated scans do not create a duplicate durable workflow record.
- This wave deliberately does not invoke a social provider or mark a publication as published. The named queue
  is only the durable dispatch boundary; W13.3 will add the provider handler with its own outcome and recovery
  rules, so an absent credential cannot become a mock success.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 65 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W12.5 reschedule an existing queued publication safely.

## 2026-08-12 — W12.3 protected publication scheduling

- Added the explicit scheduling transition: a valid future `scheduledAt` atomically moves only one scoped
  `DRAFT` publication to `QUEUED`. Repeated, past, invalid and cross-brand requests are fail-closed.
- The calendar's unscheduled-draft lane now has a protected Server Action and form. It persists no provider intent;
  a durable worker is still required to find and dispatch due queue records in W12.4.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 64 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W12.4 durable DB-backed scheduler.

## 2026-08-12 — W12.2 protected calendar UI

- Added a protected active-brand publication calendar with deterministic UTC week and month ranges. It lists only
  scheduled records inside the range and keeps unscheduled `DRAFT` publications in a separate planning lane.
- The page rebuilds the authenticated actor, calls the application service and never queries Prisma directly.
  Cross-brand calendar records cannot enter either list.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 63 PostgreSQL integration
  contracts, production build and 12 browser E2E flows.
- Next: W12.3 explicit scheduling transition.

## 2026-08-12 — W12.1 approved publication creation

- Publication creation now requires an active-tenant `APPROVED` ContentProject, its own PlatformVariant and a
  `CONNECTED` SocialAccount with the same platform. All new records start as `DRAFT` without `scheduledAt`.
- A draft project, a foreign brand, a disconnected account or a mismatched platform cannot create a publication.
  Scheduling remains a separate state transition in W12.3; this step does not offer a bypass.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 62 PostgreSQL integration
  contracts, production build and 11 browser E2E flows.
- Next: W12.2 protected week/month calendar UI.

## 2026-08-12 — W11.4 social account audit

- Added scoped audit events for `social.connect`, `social.disconnect`, `social.expired` and
  `social.refresh_failed`; metadata includes only operational identifiers and never credential values.
- Disconnecting an account atomically removes its encrypted credential and marks the account `DISCONNECTED`.
  Cross-brand disconnect is denied before any status, credential or audit mutation.
- Wave 11 Social Accounts foundation is complete. Live VK/Instagram OAuth and refresh runtime remains
  `BLOCKED_EXTERNAL` until valid provider credentials are configured.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 61 PostgreSQL integration
  contracts, production build and 11 browser E2E flows.
- Next: W12.1 calendar and scheduling entry point.

## 2026-08-12 — W11.3 controlled social token refresh

- Added a tenant- and brand-scoped refresh service: it runs only inside the configured expiry window, decrypts a
  stored refresh token at the provider boundary and atomically replaces encrypted tokens plus `expiresAt` on success.
- Missing refresh credentials mark the account `EXPIRED`; rejected refreshes mark it `ERROR`. Neither branch writes
  plaintext secrets, and a foreign brand cannot inspect or refresh an account.
- The real provider runtime remains `BLOCKED_EXTERNAL` without VK/Instagram credentials; no mock refresh is exposed
  through the product path.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 60 PostgreSQL integration
  contracts, production build and 11 browser E2E flows.
- Next: W11.4 social account audit events.

## 2026-08-12 — W11.2 provider-layer OAuth architecture

- Added provider-only VK and Instagram OAuth contracts for authorization URLs and authorization-code exchange,
  including redirect URI, signed state and optional PKCE challenge/verifier fields.
- Core remains free of provider callback shapes and OAuth client secrets. No runtime HTTP client is configured,
  so a live account connection remains `BLOCKED_EXTERNAL` rather than becoming a mock success.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 39 unit tests, 56 PostgreSQL integration
  contracts, production build and 11 browser E2E flows.
- Next: W11.3 controlled token refresh strategy.

## 2026-08-12 — W11.1 protected social accounts UI

- Added a read-only active-brand workspace for VK and Instagram accounts. It resolves the authenticated actor,
  requires `brand:read`, and applies both organization and brand predicates in the repository.
- The repository returns presentation fields and status only; it does not select credential data. The UI exposes no
  token input or pretend connection flow, leaving provider-specific OAuth for W11.2.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 37 unit tests, 56 PostgreSQL integration
  contracts, production build and 11 browser E2E flows.
- Next: W11.2 provider-specific OAuth architecture outside core.

## 2026-08-12 — W10.8 persisted QC gate

- Removed the generic `QC → READY` production transition. A dedicated QC gate now loads the production and
  latest persisted report in the active tenant scope, accepting only `PASSED` before it executes atomic READY.
- Missing and failed reports stay fail-closed; recovery remains explicit through `QC → COMPOSING` or `QC → FAILED`.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 37 unit tests, 54 PostgreSQL integration
  contracts, production build and 10 browser E2E flows.
- Wave 10 implementation foundation is complete. Next: W11.1 protected social accounts entry points.

## 2026-08-12 — W10.7 caption serialization

- Added SRT/ASS serialization from a persisted scoped transcript. Both files are checksummed `DERIVED`
  MediaAssets in the private storage boundary and are linked to the resulting CaptionTrack only after READY.
- CaptionTrack repository writes now verify every optional caption asset belongs to the same active brand and
  is READY; foreign or failed files cannot be attached through a crafted request.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 37 unit tests, 54 PostgreSQL integration
  contracts, production build and 10 browser E2E flows.
- Next: W10.8 QC gate.

## 2026-08-12 — W10.6 output-asset transcription

- Added an output-asset service which attaches only a `READY`, active-brand MediaAsset to a `COMPOSING`
  VideoProduction. The attachment is tenant-scoped and guarded by a compare-and-set lifecycle predicate.
- The transcription service accepts an injected real provider boundary but invokes it only after reading that
  durable output asset; otherwise it persists no transcript and reports an explicit precondition error.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 37 unit tests, 54 PostgreSQL integration
  contracts, production build and 10 browser E2E flows.
- Next: W10.7 caption tracks and SRT/ASS.

## 2026-08-12 — W10.5 RenderJob orchestration

- Provider submission now refuses any video production outside persisted `GENERATING`; it creates the scoped
  RenderJob and provider-usage records before the external call, preserving idempotency and recovery evidence.
- Completed polling advances the same checked production from `GENERATING` to `COMPOSING` through an atomic
  transition. A foreign or stale production cannot invoke a provider or receive a completion transition.
- Next: W10.6 transcription after a durable generated-video asset.

## 2026-08-12 — W10.4 HeyGen runtime adapter

- Added a fail-closed HeyGen V2 client for avatar generation and status polling. It maps provider statuses,
  uses bounded requests and keeps API credentials, avatar and voice identifiers inside provider configuration.
- A completed HeyGen response does not expose its temporary download URL as an internal storage key; durable
  media ingestion remains the following RenderJob task. Live use is `BLOCKED_EXTERNAL` without credentials.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 37 unit tests, 53 PostgreSQL integration
  contracts, production build and 10 browser E2E flows.
- Next: W10.5 RenderJob orchestration.

## 2026-08-12 — W10.3 guarded VideoProduction lifecycle

- Added the product-path production workflow: it accepts only an approved scoped project, approved storyboard
  and active recipe, then applies persisted `PLANNED → … → READY` transitions atomically.
- Invalid skips are denied; start and terminal timestamps are written at their lifecycle boundaries. Recovery
  from `FAILED → GENERATING` clears the old terminal timestamp and is covered by PostgreSQL integration tests.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 35 unit tests, 53 PostgreSQL integration
  contracts, production build and 10 browser E2E flows.
- Next: W10.4 HeyGen runtime adapter.

## 2026-08-12 — W10.2 approved-script storyboard generation

- Added a generation service that permits storyboard persistence only for an `APPROVED` content project,
  its owned script version and an active video recipe in the resolved brand scope.
- LLM output is strict JSON: every beat must carry narration, an allowed visual job, visual instruction and
  duration; recipe job and duration bounds are validated before persistence. Missing provider credentials
  return `BLOCKED_EXTERNAL` with no storyboard record.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 35 unit tests, 52 PostgreSQL integration
  contracts, production build and 10 browser E2E flows.
- Next: W10.3 VideoProduction lifecycle.

## 2026-08-12 — W10.1 protected media library

- Added a protected brand-scoped media route that lists persisted assets by source and lifecycle status;
  repository predicates prevent a foreign brand asset from appearing in the library.
- The upload server action reconstructs the session and delegates to an application service. Without private
  S3-compatible production storage it returns `BLOCKED_EXTERNAL` before creating an asset or writing a
  local fallback. Integration and browser contracts cover active-brand scope and this fail-closed UI state.
- Full gate passed: Prisma validation, lint, formatting, typecheck, 35 unit tests, 50 PostgreSQL integration
  contracts, production build and 10 browser E2E flows.
- Next: W10.2 storyboard generation from an approved script.

## 2026-08-12 — W9.1 content state UI

- Added protected UI entry points to create content projects and advance only the next valid state. The
  detail view invokes core for `IDEA → RESEARCHING`, live draft generation and `DRAFT → FACT_CHECK`; it does
  not access Prisma or a provider from web code.
- Browser coverage proves project creation, the first state transition and explicit `BLOCKED_EXTERNAL` when
  OpenAI generation is unavailable. No mock draft is shown or persisted. W9 checks are green; next: W10.
- Stabilized the shared E2E contract environment: browser scenarios run sequentially, and the existing
  Knowledge route test now waits for the completed Next navigation before direct test-data insertion/reload.

## 2026-08-12 — W9.2 editorial review actions

- Fact-check now stops at `FACT_CHECK`; a separate authenticated editorial action explicitly requests
  `FACT_CHECK → REVIEW`. Writers can add scoped comments, while reviewers can approve, return to draft or
  reject with an immutable decision record.
- The content detail route displays only actions that match the resolved permissions, but each Server Action
  reconstructs the session and repeats service authorization. A browser flow verifies
  `FACT_CHECK → REVIEW → APPROVED`; no AI or worker path can approve content.

## 2026-08-12 — W9.3 manual approval invariant

- Added a human-only approval service requiring `content:review`. It atomically records the reviewer and
  moves only `REVIEW → APPROVED`; writers and a repeated approval are denied.
- PostgreSQL coverage proves reviewer success, writer denial, state guard and the active-membership boundary.
  Next: editorial actions and UI controls.

## 2026-08-12 — W8.9 content project UI

- Added protected brand-scoped content list and detail routes. The detail view reads the current immutable
  version, status, version/approval counts and fact-check claims/evidence through application services only.
- Added a repository-backed read model and PostgreSQL coverage for list/detail and foreign-project denial.
  Empty states do not claim generated content, evidence or review data that does not exist. Next: editorial
  state actions and manual approval invariant.

## 2026-08-12 — W8.8 fact-check gate

- Added a tenant-scoped fact-check service for `DRAFT` content. It extracts each version assertion as a
  project claim, evaluates its existing evidence and records `SUPPORTED` or `UNVERIFIED` rather than making
  an unsupported claim invisible.
- The service completes the guarded `DRAFT → FACT_CHECK → REVIEW` path and returns unsupported findings to
  its caller. It cannot approve content. PostgreSQL contracts cover unsupported claims, evidence-backed
  claims and foreign-brand denial. Next: content-project UI.

## 2026-08-12 — W8.7 immutable rewrite loop

- Added the checked rewrite path for a `DRAFT` content project. A source version is scoped through its
  project, brand and organization before any AI execution starts; every successful rewrite creates a new
  AI-authored version and leaves the selected source unchanged.
- A source from another project is denied before a provider call. Provider failure remains a failed execution
  rather than a false successful rewrite. Live rewrite remains `BLOCKED_EXTERNAL` without `OPENAI_API_KEY`.
  Next: fact-check and editorial approval entry points.

## 2026-08-12 — W8.6 persisted AI draft generation

- Added the application path from a checked actor and tenant-scoped context through an `AiExecution` to an
  immutable AI-authored `ContentVersion`, then the guarded `RESEARCHING → DRAFT` transition. The production
  provider is not called by a browser route yet; this is the service-level execution path for the later
  editorial entry point.
- A missing OpenAI credential produces a persisted `FAILED` execution with `BLOCKED_EXTERNAL` and no draft.
  The test double proves the successful database lifecycle only; it is not a product-path substitute for a
  live provider. PostgreSQL contracts cover both outcomes without a network call. Next: W8.7 immutable
  rewrite loop.

## 2026-08-12 — W8.5 tenant-scoped context assembler

- Added repository-bound reads for brand profile, voices, active pillars and bounded claim evidence, then
  assembled them only after tenant context, `content:write` and scoped content-project validation.
- Hybrid knowledge retrieval remains an injected boundary for the resolved brand. A cross-brand project or
  evidence cannot enter the context; no UI or provider call claims a live generation result.

## 2026-08-12 — W8.4 prompt versioning

- Added the approved eight v1 prompt identifiers to a code catalogue. Unknown operations are rejected
  rather than silently falling back to another prompt; each definition prohibits unsupported facts outside
  supplied context. No schema, migration, provider call or live-generation claim was added.

## 2026-08-12 — W8.3 AI execution tracking

- Added the additive `AiExecution` migration and repository. Each record is bound to organization, brand
  and content project; it preserves provider/model/operation, prompt version, lifecycle timestamps, token
  usage, costs and failure details.
- Repository writes use the full tenant/project scope and expected state. PostgreSQL coverage proves a
  successful lifecycle, persisted failure metadata, foreign-brand denial and no illegal restart of a failed
  execution. This is tracking `FOUNDATION`, not a live generation result.

## 2026-08-12 — W8.2 production text-generation adapter

- Added exactly one `OpenAiTextGenerationProvider` using the Responses API behind the existing neutral
  contract. It does not introduce SDK coupling, model routing or a fallback matrix; requests are bounded
  and explicitly set `store: false`.
- The adapter fails closed on a missing credential, non-success provider response or absent output. This
  environment has no `OPENAI_API_KEY`, therefore live generation is correctly `BLOCKED_EXTERNAL`, not a
  mock success. Provider response mapping and error behavior are covered without a network call.

## 2026-08-12 — W8.1 text generation provider boundary

- Added the provider-neutral `TextGenerationProvider` contract and a deterministic test-only
  `MockTextGenerationProvider`. The application contract carries operation, prompt, optional model and
  normalized result/usage only; it does not depend on an LLM SDK or implement routing/fallback logic.
- No schema, migration or live provider has been added. Text generation remains `FOUNDATION`; the next
  separate task adds exactly one production adapter and must report `BLOCKED_EXTERNAL` until its credential
  is present.

## 2026-08-12 — W7 protected research workspace

- Added protected brand-scoped research list, text/URL intake and external-search entry points. Every route
  reconstructs the Better Auth actor and verified organization/brand context before reaching the
  application service; neither Server Actions nor React access Prisma directly.
- Added `FirecrawlResearchProvider` for the documented v2 search and scrape contracts. Core URL intake
  remains SSRF-safe, the workspace maps an absent provider credential to a visible `BLOCKED_EXTERNAL`, and
  no mock result is shown in the live product path. The environment has no `FIRECRAWL_API_KEY`, so live
  search and URL extraction remain `BLOCKED_EXTERNAL`.
- Added provider mapping/fail-closed unit contracts, workspace URL/search and cross-brand integration
  coverage, plus the authenticated browser path. Full quality gate is green: Prisma validation, lint,
  formatting, typecheck, 28 unit tests, 34 integration contracts, 7 browser E2E flows and production
  build. Next: W8 content generation and editorial workflow.

## 2026-08-12 — W6.4 hybrid knowledge retrieval

- Added protected document indexing and hybrid search UI through the application service, repository
  predicates and `OpenAiEmbeddingProvider`. Indexing requires `content:write`; search stays constrained to
  the verified active organization and brand.
- `MockEmbeddingProvider` is used only in the PostgreSQL isolation contract. The browser flow verifies that
  the live UI reports `BLOCKED_EXTERNAL` when the required OpenAI credential is absent; no mock success is
  shown to a user. Full quality gate is green: Prisma validation, lint, formatting, typecheck, 26 unit
  tests, 33 integration contracts, 7 browser E2E flows and production build. Live retrieval remains
  `BLOCKED_EXTERNAL` pending `OPENAI_API_KEY`. Next: W7 research workspace.

## 2026-08-12 — W6.3 controlled knowledge retry

- Added a tenant- and brand-scoped recovery path for documents in `FAILED` only. It reuses the already
  persisted safe text and the existing guarded state transitions, so retry neither refetches a URL nor
  creates a duplicate document or bypasses repository boundaries.
- Added valid recovery plus pending and foreign-brand negative PostgreSQL contracts, and a browser retry
  scenario. During the final gate, removed the exhausted 20-slug ceiling for non-Latin organization names:
  readable attempts now fall back to a collision-safe UUID suffix, with an integration contract. Browser
  assertions now use persisted rendered state rather than a transient revalidation notice. Full quality
  gate is green: Prisma validation, lint, formatting, typecheck, 26 unit tests, 32 integration contracts,
  7 browser E2E flows and production build. Next: W6.4 hybrid retrieval.

## 2026-08-12 — W6.2 knowledge intake

- Connected text, URL and UTF-8 textual-file forms to tenant-bound Server Actions and the existing safe
  knowledge ingestion service. URL and file validation remain in the core/provider layer, not React.
- Browser coverage performs real text ingestion from the form into a READY document. Full quality gate is
  green: Prisma validation, lint, formatting, typecheck, 26 unit tests, 30 integration contracts, 7 browser
  E2E flows and production build. Next: W6.3 controlled document retry.

## 2026-08-12 — W6.1 knowledge document list

- Added the protected, brand-scoped Knowledge entry point and a tenant-scoped document listing application
  service. The UI contains no direct Prisma access; foreign organization/brand route context is rejected.
- Added PostgreSQL tenant-bound list coverage and browser navigation to the honest empty state. Full quality
  gate is green: Prisma validation, lint, formatting, typecheck, 26 unit tests, 30 integration contracts,
  7 browser E2E flows and production build. Next: W6.2 text/URL/file intake.

## 2026-08-12 — W5.5 first real end-to-end application flow

- Added one browser-to-database contract for the available product path: Better Auth account, browser login,
  organization creation, brand creation, persisted ACTIVE/OWNER/MANAGE access records, logout and renewed
  denial of the nested protected route.
- No product fixture or mock provider creates the organization or brand; the only setup is Better Auth's
  official account route. Full gate is green: Prisma validation, lint, formatting, typecheck, 26 unit tests,
  29 integration contracts, 7 browser E2E flows and production build. Next: W6 Knowledge UI.

## 2026-08-12 — W5.4 application navigation

- Added route-aware workspace and organization navigation to the authenticated shell. It intentionally
  exposes no unimplemented product modules and marks the active route for assistive technology.
- Added a real Better Auth session exit with pending/error states. Browser coverage now proves navigation,
  successful logout and that the protected shell denies access after logout.
- Full gate is green: Prisma validation, lint, formatting, typecheck, 26 unit tests, 29 integration
  contracts, 6 browser E2E flows and production build. Next: W5.5 first real end-to-end application flow.

## 2026-08-12 — W5.3 brands UI

- Added brand list/create pages nested under a verified organization route. Both the page and server action
  rebuild the session tenant context; brand creation requires `brand:manage` and gives the creator an
  explicit `MANAGE` brand access record.
- Added cross-organization/editor negative coverage, duplicate-slug recovery and browser E2E creation.
  Full gate is green: Prisma validation, lint, formatting, typecheck, 26 unit tests, 29 integration
  contracts, 6 browser E2E flows and production build. Next: W5.4 application navigation.

## 2026-08-12 — W5.2 organizations UI

- Added the real authenticated organizations entry point at `/app/organizations`: active organizations are
  listed only through the current session user's active memberships, and the server action creates the user
  as `OWNER` with collision-safe slug allocation.
- Added integration coverage for owner creation, cross-user isolation and revoked membership plus browser
  E2E creation. Full gate is green: Prisma validation, lint, formatting, typecheck, 26 unit tests, 28
  integration contracts, 5 browser E2E flows and production build. Next: W5.3 brands UI.

## 2026-08-12 — W5.1 protected application shell

- Added a Better Auth email/password login form and a server-protected `/app` layout. Anonymous requests are
  redirected before workspace rendering; return paths are constrained to local `/app` locations, preventing
  an open redirect.
- Added a real Playwright flow for anonymous denial and credential login to `/app`. Full gate is green:
  Prisma validation, lint, formatting, typecheck, 26 unit tests, 27 integration contracts, 4 browser E2E
  flows and production build. Next: W5.2 organizations UI.

## 2026-08-12 — W4.5 worker readiness signal

- Refactored worker startup into a testable bootstrap sequence. A safe `worker.ready` signal is emitted only
  after environment validation, pg-boss startup, queued-work recovery and handler registration; startup
  failures do not report readiness and close an already-open queue.
- Added positive and negative readiness contracts. Full gate is green: Prisma validation, lint, formatting,
  typecheck, 25 unit tests, 27 integration contracts and production build. Next: W5.1 protected application
  shell.

## 2026-08-12 — W4.4 lost queued-work reconciliation

- Worker startup now scans durable `QUEUED` workflow runs and re-enqueues them through pg-boss with each
  workflow-run id as `singletonKey`. Interrupted worker execution or a lost queue job can therefore recover
  through the single durable intent path.
- Added unit and PostgreSQL integration recovery contracts. Full gate is green: Prisma validation, lint,
  formatting, typecheck, 22 unit tests, 27 integration contracts and production build. Next: W4.5 worker
  readiness.

## 2026-08-12 — W4.3 managed queue lifecycle

- Replaced per-request pg-boss start/stop in workflow enqueueing with a shared process-lifetime queue.
  Failed initialization is recoverable on a later enqueue, and the default database repository is now lazy
  so importing the application service does not access the database.
- Added a unit contract for queue reuse and initialization recovery. Full gate is green: Prisma validation,
  lint, formatting, typecheck, 21 unit tests, 27 integration contracts and production build. Next: W4.4
  queue reconciliation and worker readiness.

## 2026-08-12 — W4.2 explicit workflow dispatcher

- Replaced the placeholder worker path with a closed workflow-type dispatcher. `system.health` is the
  initial registered handler; only an actual handler result transitions a workflow run to `SUCCEEDED`.
- Missing types remain typed `UNSUPPORTED_WORKFLOW_TYPE` failures and handler exceptions persist as
  `WORKFLOW_HANDLER_FAILED`. The payload never controls executable function selection. Full gate is green:
  Prisma validation, lint, formatting, typecheck, 19 unit tests, 27 integration contracts and production
  build. Next: W4.3 queue lifecycle.

## 2026-08-12 — W4.1 worker false-success removal

- The workflow worker no longer writes a timestamp result and marks a run `SUCCEEDED` without a registered
  business handler. It now records `FAILED` with `UNSUPPORTED_WORKFLOW_TYPE` and rethrows a typed error.
- A workflow integration contract proves an unknown workflow is auditable failure rather than false success.
  Full gate is green: Prisma validation, lint, formatting, typecheck, 19 unit tests, 27 integration
  contracts and production build. Next: W4.2 explicit dispatcher.

## 2026-08-12 — W3.9 storyboard authorization boundary

- Storyboard creation now accepts a verified `TenantContext` and derives organization/brand only from it;
  direct caller-supplied tenant identity has been removed from the service API. `content:write` and active
  brand context are mandatory before repository access.
- Updated every service caller and cross-brand integration contract. Full gate is green: Prisma validation,
  lint, formatting, typecheck, 19 unit tests, 27 integration contracts and production build. Next: W4.1.

## 2026-08-12 — W3.8 resource graph validation

- `ContentProject` now validates `pillarId` and `opportunityId` against the active brand before writing;
  an opportunity classified under a pillar must match the project's pillar. This blocks foreign and
  internally mismatched content graphs before persistence.
- Integration coverage proves foreign pillar/opportunity denial and successful creation of a coherent
  same-brand graph. Full gate is green: Prisma validation, lint, formatting, typecheck, 19 unit tests,
  27 integration contracts and production build.

## 2026-08-12 — W3.7 video provider reconciliation

- A successful provider video-job creation followed by a database persistence failure is now represented as
  `OUTCOME_UNKNOWN`, never as a local `FAILED` job. The recovery write preserves the external job ID and
  the attempted provider usage identity.
- `poll()` is the reconciliation path: it queries the known external video job and moves the local render
  job forward without a second provider `create()` call. The integration contract injects final-persistence
  failure after provider success and proves recovery to `PROCESSING`. Full gate is green: Prisma validation,
  lint, formatting, typecheck, 19 unit tests, 27 integration contracts and production build.

## 2026-08-12 — W3.6 atomic publication attempts

- Replaced the read/max/insert attempt race with an atomic tenant-scoped acquisition transaction. It locks
  the publication only while assigning the next attempt and reuses the existing logical attempt for the
  same idempotency key; provider calls remain outside the transaction.
- A 20-request parallel integration contract proves one logical attempt, one provider mutation and no
  leaked unique-constraint violation. Concurrent callers receive a typed in-progress result until the
  owning dispatch completes. Full gate is green: Prisma validation, lint, formatting, typecheck, 19 unit
  tests, 27 integration contracts and production build.

## 2026-08-12 — W3.5 publishing reconciliation

- A provider success followed by a persistence failure now becomes `OUTCOME_UNKNOWN`, never `FAILED`.
  The service does not issue a second external mutation and retains the provider operation/job identity
  required for investigation.
- `investigate()` reconciles confirmed posts to `PUBLISHED`, records a confirmed `NOT_FOUND` outcome before
  requeuing, and leaves an inconclusive provider result untouched. A recovery contract simulates failure of
  the final DB persistence after provider success and proves that one external post is reconciled without a
  second provider call. Full gate is green: Prisma validation, lint, formatting, typecheck, 19 unit tests,
  26 integration contracts and production build.

## 2026-08-12 — W3.4 publishing state machine cleanup

- Removed the unused `PREPARING` hop from the active dispatch path, so a crash cannot leave a newly
  dispatched publication permanently in that state. The guarded `QUEUED → PUBLISHING` transition now
  occurs immediately before the provider mutation.
- Defined every publication status in the current master plan. Historical intermediate states are never
  newly written and can only recover explicitly to `QUEUED`.
- `OUTCOME_UNKNOWN` cannot be moved back to `QUEUED` by ordinary scheduling; only provider investigation
  may reconcile it. Integration coverage proves terminal-state denial, uncertain-outcome denial and
  legacy-state recovery. Full gate is green: Prisma validation, lint, formatting, typecheck, 19 unit tests,
  25 integration contracts and production build. Next task: W3.5 — publishing reconciliation.

## 2026-08-12 — Wave 2.2: negative security contracts

- Extended content workflow coverage with foreign organization, insufficient `content:write` permission and
  suspended membership denial. Publishing coverage now proves that a foreign social account cannot be
  attached to a publication in the active brand.
- Existing integration contracts continue to cover foreign brand, content project and media resource paths;
  all are executed by the mandatory SourceCraft pgvector gate. Next task: W3.4 — publishing state machine cleanup.
- Made knowledge ingestion retry-safe: `READY` returns only the ready document, `PROCESSING` returns a typed
  in-progress error, and `FAILED` is retried through a controlled transition. Document creation handles the
  unique-key race, chunks upsert by ordinal to reconcile partial persistence, and integration coverage proves
  processing denial plus recovery with exactly one resulting chunk.
- Made research ingestion stateful and retry-safe. `READY` returns its verified persisted item, `PROCESSING`
  returns `ResearchInProgressError`, `FAILED` re-enters only through a controlled transition, and every
  impossible repository state raises an integrity error rather than returning `null`. Integration contracts
  cover a live parallel request, controlled failure/retry, and cross-brand isolation.
- Rebuilt media storage into a fail-closed pipeline: server-side deterministic keys, `PENDING` intent,
  storage write, byte-signature detection and controlled `READY` transition. Unsupported content, storage
  failure and persistence failure reconcile to `FAILED` and attempt object cleanup. Contracts prove no write
  without permission, no trust in fake MP4 MIME/extension, cross-brand isolation, and checksum retry
  idempotency.
- Added the fail-fast runtime environment contract. Web and worker startup now validate core configuration;
  provider credential groups are checked only when configured, localhost fallback is limited to dev/test, and
  invalid production worker configuration exits before it can start the queue. SourceCraft CI passes only
  ephemeral, non-secret test values required by this gate.
- Added reusable, credential-free test adapters for failing storage, publishing providers and repository
  persistence, plus delayed and call-counting publishing wrappers. The unit contracts model duplicate and
  parallel requests, provider success followed by persistence failure, timeout, and worker crashes without
  making a real external call. The harness deliberately observes duplicate provider calls; enforcing an
  atomic one-call publication dispatch remains scheduled for PR 13.5.
- Made the research isolation contract independent of external DNS by using a text source; URL/SSRF safety
  remains covered by the dedicated knowledge ingestion contract.

## 2026-08-12 — Wave 2.1: SourceCraft integration gate

- Replaced the CI-only static quality gate with a disposable `pgvector/pgvector:pg16` database on the
  SourceCraft compute runner. The Node 22 verification container now runs Prisma generation, migration
  deploy, seed, lint, format, typecheck, unit tests, integration tests and build against that database.
- Next task: W2.2 — negative security tests for core write paths.

## 2026-08-12 — Wave 1.4: tenant-scope repository cleanup

- Removed ID-only tenant-owned write APIs for workflow runs, social accounts, publication attempts, API-key
  usage and outbound webhook deliveries. Their callers now pass organization scope and brand scope where
  the resource belongs to a brand.
- The worker job payload includes the workflow organization scope; brand access lookup also requires its
  organization. An integration contract proves a foreign organization cannot transition a workflow run.
- Next task: W2.1 — SourceCraft PostgreSQL + pgvector integration gate.

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
