# Production checklist

## До первого запуска

- [ ] Есть отдельное подтверждение владельца инфраструктуры и окна работ.
- [ ] Зафиксирован SourceCraft commit из зелёного `main`.
- [ ] Сервер, SSH user/port, ОС и Docker Compose v2 проверены.
- [ ] Определён final hostname и TLS termination.
- [ ] `.env` создан из template, secret values сгенерированы и не попали в Git.
- [ ] В Timeweb Cloud создан PostgreSQL 16 cluster, для базы включён `pgvector`, а `DATABASE_URL` и TLS requirements проверены.
- [ ] Для DBaaS включены provider backups; проверена стратегия off-server logical backups и тест восстановления.
- [ ] Live provider credentials подключены только при отдельном integration review.

## Release

- [ ] Пройдены `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`,
      `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`.
- [ ] Выполнен `sh deploy/deploy.sh`.
- [ ] В Timeweb DBaaS cluster доступен, а `web`, `worker`, `nginx` healthy.
- [ ] `live` и `ready` возвращают HTTP 200 через конечный proxy.
- [ ] Проверены logs без секретов и подготовлен rollback commit.

## После release

- [ ] Зафиксированы версия, время release и operator.
- [ ] Запланирована проверка backup/restore в изолированном контуре.
- [ ] Настроен monitoring на `/api/health/live` и `/api/health/ready`.
