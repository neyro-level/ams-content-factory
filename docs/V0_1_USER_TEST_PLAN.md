# AMS Content Factory V0.1 — User Testing Plan

## Назначение

Этот документ уточняет следующий исполнимый этап после технического foundation: безопасный первый
editorial workflow для тестирования владельцем. Он не заменяет архитектурные инварианты и production
release gate из `MASTER_IMPLEMENTATION_PLAN.md`.

## Вариант V0.1

Рабочая цепочка:

```text
Login → Organization → Brand → Brand Context → Knowledge → Content Project
→ Generate → Content Version → Review/Edit/Rewrite → READY → Copy
```

Публикация в V0.1 выполняется пользователем вне AMS Content Factory. Production deploy, S3,
video, social OAuth, provider publishing, analytics, MCP и n8n не входят в этот этап.

## Product statuses

| Module                                                                                         | V0.1 status             | Реальная граница                                               |
| ---------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| Authentication, Organizations, Brands                                                          | `READY`                 | Protected tenant-scoped application flow.                      |
| Brand Context, Knowledge, Content                                                              | `READY` after this plan | Requires the verified V0.1 implementation.                     |
| Research                                                                                       | `LIMITED`               | Existing scoped workspace; external provider remains optional. |
| Media, Video, Calendar, Publishing, Social Accounts, Analytics, Automation, MCP / Integrations | `PLANNED`               | Visible product direction only; no unsafe operation.           |

`READY`, `LIMITED` and `PLANNED` are product terms. Internal errors such as
`BLOCKED_EXTERNAL` must never be rendered as ordinary UI status text.

## Mandatory integrity contract

- One initial generation key is `draft:<promptKey>` per content project.
- A database claim, not a disabled browser button, permits at most one provider call for that key.
- A completed key returns its already persisted ContentVersion; a running key reports safe in-progress
  state; a failed key can be claimed deterministically for retry.
- Version allocation is transactionally monotonic per ContentProject; `MAX(version) + 1` is forbidden.
- Provider success followed by a known persistence failure leaves no `AiExecution` permanently `RUNNING`.
- All context, knowledge, project and execution access remains organization- and brand-scoped.
- A V0.1 project requires topic, goal, audience and brief. Its immutable first `USER` ContentVersion
  is stored with the project in one transaction; it is version 1 and the project counter begins at 2.

## Verification and release boundary

The V0.1 code gate requires Prisma validation and migration verification, lint, format, typecheck,
unit, integration, build and deterministic Playwright happy-path, tenant-isolation smoke and a separate browser
contract for the no-credential limited Content mode.

Real user-facing AI generation additionally requires a securely configured `OPENAI_API_KEY`. Until it
exists, Content is rendered as a product-level limited capability: editing, review and manual finalisation remain
available, while generation and rewrite controls are disabled with a product explanation. The capability is resolved
only on the server and does not expose credential details. This does not authorize production: Timeweb `vector`, TLS/vhost, runtime secrets and explicit
owner deployment confirmation remain independent release blockers.

### Live-provider owner smoke

`pnpm live:ai-owner-smoke` is the only V0.1 command allowed to call the real text provider. It is fail-closed:
it requires a non-empty server-side `OPENAI_API_KEY` and exact `CONFIRM_LIVE_AI_SMOKE=run`; otherwise it exits
before Docker, database or provider work begins. With both values present it creates a disposable local pgvector
database, applies committed migrations and executes one browser generation through the normal application entry
point. The contract proves `DRAFT`, one persisted AI ContentVersion and `AiExecution=SUCCEEDED`; the user and
database are removed afterwards. The key, generated text and request payload are never printed. This is an owner
test proof, not a production deploy. The browser spec is explicitly skipped in ordinary `pnpm test:e2e` runs unless
both inputs exist; this does not weaken the owner command, which rejects missing inputs before starting its isolated
environment.

The canonical owner-controlled secret target is Doppler `ams-content-factory/prd`. It exists as of 2026-08-14,
but remains intentionally empty until the owner provisions `OPENAI_API_KEY`; its creation is not evidence of a
live provider result.

## Implementation record — 2026-08-13

- The V0.1 code scope is implemented and protected by a Prisma migration, tenant/recovery integration
  contracts, deterministic critical Playwright workflow and SourceCraft critical-E2E gate.
- Verified locally: Prisma validation and migration deploy, clean-database migration drill, lint, formatting,
  typecheck, 81 unit tests, 86 integration tests, deterministic browser smoke covering initial generation, manual
  version and rewrite, tenant isolation, and production build.
- SourceCraft `verify #194` passed for the live-owner-smoke PR, and post-merge `verify #195` passed on canonical
  `main` (`6b2b7d5`). Both gates covered PostgreSQL + pgvector, migrations, unit/integration tests, build and the
  three critical browser contracts: deterministic editorial workflow, tenant isolation and ordinary no-credential
  Content mode. A separate W19.6 local release smoke confirms the same V0.1 scope with a disposable database and
  worker contracts. The non-canonical private GitHub mirror was synchronized to the same commit after `#195`.
- Editorial integrity follow-up: manual brief and text versions now retain their creating user, and AI rewrite
  finalisation creates the immutable version and marks its execution successful in one database transaction. A
  persistence failure records `REWRITE_PERSISTENCE_FAILED` without leaving a partial version or a running execution.
- Project creation integrity follow-up: the required topic, goal, audience and brief are now persisted through one
  tenant-scoped transaction. The initial brief is the immutable user-authored version 1, so a failed version write
  rolls back the project rather than leaving an empty editorial card.
- Product-language follow-up: Knowledge renders document types and lifecycle states as Russian product labels;
  database enums remain an internal contract and are not ordinary user-facing statuses.
- Product-language follow-up: Fact-check renders claim verification as Russian editorial labels rather than raw
  `ClaimStatus` enum values.
- Product-language follow-up: Content project cards and detail pages share one label catalog for content types and
  lifecycle states, including the actual `REVIEW` state rather than an obsolete status name.
- Product-language follow-up: Research maps internal material lifecycle enums to Russian editorial labels. Its
  unavailable provider path tells the user which capability will appear after configuration and never exposes a
  technical `BLOCKED_EXTERNAL` marker.
- Workflow-gate follow-up: copying for manual publication is available only after the project reaches `READY`;
  drafts remain editable but cannot be presented as final output.
- Editorial UX follow-up: request-review, approval, return, rejection and comment actions return safe Russian
  confirmation or error feedback at the entry point; raw service errors are not exposed to the owner.
- Runtime-capability follow-up: the dashboard, navigation and content controls present Content as `LIMITED` when
  no real text-generation credential exists. The test-only deterministic provider is recognised only inside the
  isolated local Playwright runtime.
- Runtime-capability entry-point follow-up: the direct Content workspace shows the same limited-capability notice,
  so this truthful state is visible even when the owner bypasses dashboard navigation with a saved URL.
- Limited-capability browser follow-up: a separate Playwright server runs without the deterministic generation
  provider and proves the navigation marker, direct Content notice and disabled generation control. This is not a
  substitute for the required live provider smoke.
- **Verdict:** `NOT READY FOR V0.1 USER TESTING` until one external input is supplied: a securely configured
  `OPENAI_API_KEY` and one explicit `pnpm live:ai-owner-smoke` run through the editorial generation flow. The
  deterministic test provider is test-only and never substitutes this proof.
