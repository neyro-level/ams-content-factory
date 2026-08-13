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

## Verification and release boundary

The V0.1 code gate requires Prisma validation and migration verification, lint, format, typecheck,
unit, integration, build and deterministic Playwright happy-path plus tenant-isolation smoke.

Real user-facing AI generation additionally requires a securely configured `OPENAI_API_KEY`. Until it
exists, Content is rendered as a product-level limited capability without exposing technical provider
details. This does not authorize production: Timeweb `vector`, TLS/vhost, runtime secrets and explicit
owner deployment confirmation remain independent release blockers.

## Implementation record — 2026-08-13

- The V0.1 code scope is implemented and protected by a Prisma migration, tenant/recovery integration
  contracts, deterministic critical Playwright workflow and SourceCraft critical-E2E gate.
- Verified locally: Prisma validation and migration deploy, clean-database migration drill, lint, formatting,
  typecheck, 76 unit tests, 85 integration tests, two V0.1 browser smokes and production build.
- SourceCraft `verify` passed on the implementation PR and again on canonical `main` (`b9a094b`), including
  PostgreSQL + pgvector, migrations, unit/integration tests, build and both deterministic browser contracts.
- Editorial integrity follow-up: manual brief and text versions now retain their creating user, and AI rewrite
  finalisation creates the immutable version and marks its execution successful in one database transaction. A
  persistence failure records `REWRITE_PERSISTENCE_FAILED` without leaving a partial version or a running execution.
- **Verdict:** `NOT READY FOR V0.1 USER TESTING` until one external input is supplied: a securely configured
  `OPENAI_API_KEY` and one real owner smoke through the editorial generation flow. The deterministic test
  provider is test-only and never substitutes this proof.
