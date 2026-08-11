# Deployment

## Граница ответственности

Production-пакет использует Timeweb Cloud DBaaS как единственный PostgreSQL 16 + pgvector runtime.
`docker-compose.prod.yml` запускает только Next.js web, отдельный pg-boss worker, Nginx и одноразовые
клиенты миграции/seed/backup/restore; в нём нет PostgreSQL-сервиса или database volume. Фактическое
развёртывание запрещено до отдельного подтверждения инфраструктуры владельцем.

## Подготовка сервера

1. В Timeweb Cloud создать managed PostgreSQL 16 cluster и включить расширение `pgvector` для
   нужной базы до запуска Prisma migrations.
2. В панели Timeweb зафиксировать TLS-подключение и backup policy. Использовать private network,
   если application server и DBaaS размещены в одном Timeweb project; иначе ограничить доступный
   IP-адрес сервера приложения.
3. Получить доступ к Linux-серверу с Docker Engine и Docker Compose v2, затем клонировать
   SourceCraft `main` в каталог, доступный только оператору.
4. Скопировать `.env.example` в `.env`, заменить все placeholder-значения и ограничить права на
   файл. `DATABASE_URL` копируется из панели Timeweb и не может указывать на `postgres`.
5. Указать в `APP_URL` финальный HTTPS origin и настроить TLS перед Nginx на уровне согласованного
   reverse proxy. Пакет не выдаёт фиктивный TLS-сертификат.

## Повторяемый запуск

```sh
sh deploy/deploy.sh
```

Скрипт собирает контейнеры, подключается к Timeweb DBaaS через `DATABASE_URL`, применяет только
Prisma migrations через `prisma migrate deploy`, идемпотентно заполняет глобальные video recipes и
evaluation suites, затем запускает `web`, `worker` и `nginx`. Он никогда не выполняет
`prisma db push` и не создаёт PostgreSQL-контейнер.

## Проверка после запуска

```sh
docker compose --env-file .env -f docker-compose.prod.yml ps
curl --fail http://127.0.0.1/api/health/live
curl --fail http://127.0.0.1/api/health/ready
```

`live` подтверждает процесс web, `ready` дополнительно проверяет соединение с PostgreSQL. Внешний
monitor должен использовать оба endpoint: `live` для restart policy, `ready` для traffic routing.

## Откат

Откат application image не отменяет миграции автоматически. Сначала остановить публикацию и
создать backup, затем вернуть ранее проверенный SourceCraft commit, собрать его и выполнить
`sh deploy/deploy.sh`. Если схема несовместима, восстановить backup только по процедуре
`docs/BACKUP_RESTORE.md`.
