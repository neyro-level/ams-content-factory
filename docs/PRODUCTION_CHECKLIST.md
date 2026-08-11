# Production checklist

## До первого запуска

- [ ] Есть отдельное подтверждение владельца инфраструктуры и окна работ.
- [ ] Зафиксирован SourceCraft commit из зелёного `main`.
- [ ] Сервер, SSH user/port, ОС и Docker Compose v2 проверены.
- [ ] Определён final hostname и TLS termination.
- [ ] `.env` создан из template, secret values сгенерированы и не попали в Git.
- [ ] `DATABASE_URL` и SSL requirements проверены для выбранной БД.
- [ ] Проверена стратегия off-server backups и тест восстановления.
- [ ] Live provider credentials подключены только при отдельном integration review.

## Release

- [ ] Пройдены `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`,
      `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`.
- [ ] Выполнен `sh deploy/deploy.sh`.
- [ ] `postgres`, `web`, `worker`, `nginx` healthy.
- [ ] `live` и `ready` возвращают HTTP 200 через конечный proxy.
- [ ] Проверены logs без секретов и подготовлен rollback commit.

## После release

- [ ] Зафиксированы версия, время release и operator.
- [ ] Запланирована проверка backup/restore в изолированном контуре.
- [ ] Настроен monitoring на `/api/health/live` и `/api/health/ready`.
