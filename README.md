# AMS Content Factory

AMS Content Factory — внутренняя AMS-платформа полного цикла: знания бренда, research,
производство контента и видео, согласования, публикация, аналитика и learning loop.

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
