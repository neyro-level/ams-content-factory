# Полный паспорт

## Назначение

AMS Content Factory — внутренняя multi-tenant платформа полного цикла для работы с контентом брендов:
она хранит контекст и знания бренда, собирает research, создаёт и согласует контент, планирует и
производит видео, публикует материалы, собирает метрики и формирует learning loop. Каноническое
продуктовое описание — `docs/MASTER_DEVELOPMENT_PLAN.md`; фактическая готовность —
`docs/BUILD_STATUS.md`.

## Реализованный контур

- Организации, роли, бренды, brand access и audit trail с tenant isolation.
- Brand profile/voice/pillars, безопасный knowledge ingestion и pgvector hybrid retrieval.
- Research, claims/evidence, content opportunities, версии контента, approvals и editorial loop.
- Video recipes, storyboard, media assets, render/production states, captions и QC.
- Provider-neutral mock/production boundaries для AI, research, storage, video, publishing и analytics.
- Публикации Instagram/VK с зашифрованными credentials, идемпотентными попытками и состоянием
  `OUTCOME_UNKNOWN`; analytics, costs, MCP/n8n webhooks и AI evaluation suites.

## Архитектура и данные

Это modular monolith: Next.js web/API и отдельный worker вызывают application services в
`packages/core`; те используют tenant-scoped repositories из `packages/db`. Prisma 7 обращается к
PostgreSQL + pgvector только внутри DB package. PostgreSQL — единственный business source of truth;
pg-boss использует тот же кластер для фоновых jobs. UI, Server Actions и Route Handlers не обращаются
к Prisma напрямую.

Все tenant-owned данные изолированы по `Organization` и `Brand`. Внешние сервисы доступны только
через provider interfaces/adapters; детерминированные `Mock*Provider` покрывают отсутствие credentials
и live-интеграции фиксируются как `BLOCKED_EXTERNAL`.

## Runtime и delivery

Стек: Node 22.13, pnpm 11.5, Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL/pgvector и
pg-boss. Локальная разработка и tests используют Docker PostgreSQL 16 + pgvector. Production database
предоставляет Timeweb Cloud DBaaS: `docker-compose.prod.yml` не запускает PostgreSQL и подключается
к внешнему кластеру только через `DATABASE_URL` с TLS.

Канонический remote — private SourceCraft `integrator-p/ams-content-factory`. Любое изменение проходит
`work/*` → PR → green `verify` → `main`. Production deploy не выполнялся и остаётся
`BLOCKED_EXTERNAL` до создания Timeweb-кластера, настройки TLS/backups, сервера, домена и отдельного
подтверждения инфраструктуры владельцем.

GitHub `neyro-level/ams-content-factory` существует как private remote `github-legacy`: это полная
резервная копия Git-истории по отдельному запросу владельца, но не источник истины, не CI gate и не
путь deployment.
