# Foundation implementation report — AMS Content Factory

**Статус документа:** historical snapshot. Текущая очередность и Definition of Done —
[`docs/MASTER_IMPLEMENTATION_PLAN.md`](docs/MASTER_IMPLEMENTATION_PLAN.md).

## FOUNDATION

- Multi-tenant model, RBAC, audit trail, tenant-scoped repositories и Prisma migrations.
- Brand/knowledge, research, content, video, publishing, analytics, MCP и evaluation domain models,
  application services, provider contracts и integration contracts.
- Safe URL/text/file ingestion, encryption boundaries, health endpoints, pg-boss foundation, SourceCraft CI
  и production artifact/runbook templates.

Это фундамент, а не сквозная пользовательская реализация: models, repositories, mocks и contract tests не
считаются готовой функцией без entry point, полезной операции и recovery-покрытия.

## NOT_IMPLEMENTED

- Protected application shell, организация и бренд как реальные UI flows.
- Рабочие web/worker workflows knowledge → research → draft → review → approval.
- Реальные AI generation, calendar/scheduler, video production, OAuth/social publishing, analytics и MCP
  runtime.
- Production deployment и release-gate proof.

## BLOCKED_EXTERNAL

- Timeweb должен установить SQL object `vector` в production database или предоставить отдельное
  extension-capable operator connection.
- Для live adapters нужны официальные credentials/authorization внешних провайдеров.

## Проверенная база

На 2026-08-12 в чистом окружении были зелёными Prisma validation, lint, formatting, typecheck, unit и
integration contracts, E2E shell contracts и production build. Эти проверки доказывают стабильность
фундамента, но не заменяют будущие реальные E2E сценарии продукта.
