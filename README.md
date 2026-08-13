# AMS Content Factory

AMS Content Factory — внутренняя AMS-платформа для будущего полного цикла: знания бренда, research,
производство контента и видео, согласования, публикация, аналитика и learning loop.

## Фактический статус

- `READY`: защищённый tenant-scoped путь Authentication → Organization → Brand → Brand Context →
  Knowledge → Content → Review → READY → Copy. Он включает immutable версии, ручное согласование,
  безопасные сообщения действий и critical E2E.
- `LIMITED`: Research допускает только безопасную работу с материалами бренда; внешний поиск и извлечение
  недоступны без подключённого provider. Реальная AI-генерация требует защищённо переданного
  `OPENAI_API_KEY`; тестовый deterministic provider не является пользовательской функцией.
- `PLANNED`: Media, Video, Calendar, Publishing, Social Accounts, Analytics, Automation и MCP/Integrations
  видимы как направление продукта, но не запускают незрелые операции.

`READY`, `LIMITED` и `PLANNED` — пользовательские статусы. Production deployment отдельно остаётся
`BLOCKED_EXTERNAL`: необходимы Timeweb `vector` SQL object, runtime credentials, TLS/vhost и явное
подтверждение владельца.

Текущий порядок работ и критерии готовности —
[`docs/V0_1_USER_TEST_PLAN.md`](docs/V0_1_USER_TEST_PLAN.md) и
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
