# AMS Content Factory

AMS Content Factory — внутренняя AMS-платформа для будущего полного цикла: знания бренда, research,
производство контента и видео, согласования, публикация, аналитика и learning loop.

## Фактический статус

- `FOUNDATION`: multi-tenant data model, repositories, application services, provider contracts, worker
  foundation, health endpoints и CI.
- `NOT_IMPLEMENTED`: защищённый пользовательский shell и сквозные UI/worker flows для knowledge,
  research, AI-генерации, редакционного согласования, видео, публикаций и аналитики.
- `BLOCKED_EXTERNAL`: production DBaaS `vector` SQL object, runtime credentials и production release
  prerequisites.

Текущий порядок работ и критерии готовности —
[`docs/MASTER_IMPLEMENTATION_PLAN.md`](docs/MASTER_IMPLEMENTATION_PLAN.md). Наличие Prisma model,
repository, provider contract, mock или теста не означает готовность пользовательской функции.

## Быстрый старт

1. Установить Node.js `22.13+` и pnpm `11.5+`.
2. Скопировать `.env.development.example` в `.env`; production-шаблон `.env.example` не применять
   для local development и не добавлять `.env` в Git.
3. Выполнить `pnpm install`, затем `pnpm db:up`, `pnpm prisma:deploy` и `pnpm dev`.

## Проверки

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Перед работой читать `AGENTS.md`, затем `00_PROJECT_DOCUMENTS_INDEX.md`.
