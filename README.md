# AMS Content Factory

AMS Content Factory — внутренняя AMS-платформа полного цикла: знания бренда, research,
производство контента и видео, согласования, публикация, аналитика и learning loop.

## Быстрый старт

1. Установить Node.js `22.13+` и pnpm `11.5+`.
2. Скопировать `.env.example` в `.env.local` и не добавлять секреты в Git.
3. Выполнить `pnpm install`, затем `pnpm db:up` и `pnpm dev`.

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

Перед работой читать `AGENTS.md`, затем `docs/MASTER_DEVELOPMENT_PLAN.md`,
`docs/EXECUTION_PLAN.md`, `docs/BUILD_STATUS.md` и `docs/DECISIONS.md`.
