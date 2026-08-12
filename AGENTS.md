# AMS Content Factory — рабочий роутер

## Источники истины

1. `docs/MASTER_IMPLEMENTATION_PLAN.md` — единственный текущий план реализации, инварианты, очередность задач и release gate.
2. `docs/EXECUTION_PLAN.md` — порядок исполнения по Wave и task.
3. `docs/BUILD_STATUS.md` — фактическое операционное состояние.
4. `docs/DECISIONS.md` — архитектурные решения и отклонения.
5. `03_DESIGN_SYSTEM.md` — UI source of truth; до утверждения действует `DESIGN_SYSTEM_PENDING`.

`docs/MASTER_DEVELOPMENT_PLAN.md` — historical/reference и не определяет текущий статус. Перед новой Wave перечитывать текущий план и проверять фактический код.

## Архитектурные инварианты

- Modular monolith: Web UI → application services → domain/core → repositories → Prisma/PostgreSQL.
- Prisma 7, PostgreSQL и pgvector; production использует только migrations, никогда `db push`.
- Multi-tenant first: tenant-owned операции получают проверенный `TenantContext` с `organizationId` и при необходимости `brandId`.
- UI, Server Actions и Route Handlers не обращаются к Prisma напрямую; business logic не живёт в React.
- Внешние сервисы доступны только через provider interfaces/adapters; mocks имеют явное имя `Mock*Provider`.
- Никаких plaintext secrets, giant n8n workflows, Redis, Temporal, микросервисов или provider-specific logic вне provider layer.
- Статусы меняются только transition services; небезопасные внешние мутации идемпотентны.

## Автономность

Агент самостоятельно выполняет утверждённый Master Plan: создаёт файлы, запускает проверки,
исправляет ошибки и делает локальные commits. Wave 3.5 уже завершена: SourceCraft подключён как
канонический remote. При сбое он
делает минимум две безопасные содержательные попытки с разными гипотезами и фиксирует результат.
К владельцу обращается только после двух неуспешных попыток, если нужен внешний доступ,
credential, платёж, домен, необратимое действие вне плана или продуктовый выбор.

## Git, SourceCraft и deploy

- `origin` — только `git.sourcecraft.dev/integrator-p/ams-content-factory.git`.
- `github-legacy` — private `github.com/neyro-level/ams-content-factory.git`; это optional mirror,
  не merge/deploy gate и обновляется только по запросу владельца.
- Для любого изменения: `work/*` → PR → green verify → `main`. Запрещены production/deployment/backup branches.
- Production deploy возможен только после W19, полного green release-gate и явного owner confirmation.

## Definition of Done

Для task: реализация без скрытых stubs, tests рядом с изменением, документация синхронизирована,
и пройдены обязательные команды: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`,
релевантные integration/E2E tests и `pnpm build`.
