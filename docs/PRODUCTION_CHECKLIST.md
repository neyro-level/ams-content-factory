# Production checklist

## До первого запуска

- [ ] Есть отдельное подтверждение владельца инфраструктуры и окна работ.
- [ ] Зафиксирован SourceCraft commit из зелёного `main`.
- [x] AMS Server, SSH, ОС, host Nginx и Certbot проверены; DNS `fabrika.ams24.ru` указывает на него.
- [ ] Сервер расширен до согласованного ресурса для web + worker; свободный внутренний порт закреплён.
- [ ] Создан отдельный Nginx vhost `fabrika.ams24.ru` и выпущен/проверен TLS-сертификат.
- [ ] `.env` создан из template, secret values сгенерированы и не попали в Git.
- [ ] В Timeweb Cloud создан PostgreSQL 16 cluster, для базы включён `pgvector`, а `DATABASE_URL` и TLS requirements проверены. Подключение с AMS Server проверено, но `pgvector` пока отсутствует и требует включения в панели/оператором БД.
- [ ] Для DBaaS включены provider backups; проверена стратегия off-server logical backups и тест восстановления.
- [ ] Live provider credentials подключены только при отдельном integration review.

## Release

- [ ] Пройдены `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`,
      `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`.
- [ ] Собран и проверен immutable Linux-артефакт exact SourceCraft `main`; `current` переключён только
      после его аудита.
- [ ] В Timeweb DBaaS cluster доступен, а systemd `web` и `worker` healthy.
- [ ] `live` и `ready` возвращают HTTP 200 через конечный proxy.
- [ ] Проверены logs без секретов и подготовлен rollback commit.

## После release

- [ ] Зафиксированы версия, время release и operator.
- [ ] Запланирована проверка backup/restore в изолированном контуре.
- [ ] Настроен monitoring на `/api/health/live` и `/api/health/ready`.
