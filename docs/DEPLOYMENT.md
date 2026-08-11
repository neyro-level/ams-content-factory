# Deployment

## Граница ответственности

Production-пакет использует Timeweb Cloud DBaaS как единственный PostgreSQL 16 + pgvector runtime.
`docker-compose.prod.yml` запускает только Next.js web, отдельный pg-boss worker, Nginx и одноразовые
клиенты миграции/seed/backup/restore; в нём нет PostgreSQL-сервиса или database volume. Фактическое
развёртывание запрещено до отдельного подтверждения инфраструктуры владельцем.

Для утверждённого AMS Server production-профиль отличается от переносимого Compose-пакета: host Nginx
и Certbot остаются на сервере, Next.js запускается systemd из immutable release. Целевой origin —
`https://fabrika.ams24.ru`. Compose не должен занимать на AMS Server порт 80/443 и не является вторым
production reverse proxy.

## Подготовка сервера

1. В Timeweb Cloud создать managed PostgreSQL 16 cluster и включить расширение `pgvector` для
   нужной базы до запуска Prisma migrations.
2. В панели Timeweb зафиксировать TLS-подключение и backup policy. Использовать private network,
   если application server и DBaaS размещены в одном Timeweb project; иначе ограничить доступный
   IP-адрес сервера приложения.
3. На AMS Server подготовить `/opt/ams-platform/ams-content-factory/{releases,shared}` и
   `/var/log/ams-platform/ams-content-factory`; runtime запускается от `amsplatform` через systemd.
4. Собрать Linux-артефакт exact SourceCraft `main`, проверить его checksum и разместить в новом
   release-каталоге. Нельзя собирать или активировать feature branch.
5. Создать root-owned `/etc/ams-platform/ams-content-factory.env` с ограниченными правами. В него
   попадают только runtime secrets, включая TLS `DATABASE_URL` Timeweb; файл никогда не копируется
   в release и Git.
6. Указать `APP_URL=https://fabrika.ams24.ru`, создать Nginx vhost и выпустить Certbot-сертификат
   только после подтверждения DNS. Публичный порт приложения остаётся закрыт: systemd слушает
   исключительно `127.0.0.1`.

## Portable Compose package

```sh
sh deploy/deploy.sh
```

Скрипт собирает контейнеры, подключается к Timeweb DBaaS через `DATABASE_URL`, применяет только
Prisma migrations через `prisma migrate deploy`, идемпотентно заполняет глобальные video recipes и
evaluation suites, затем запускает `web`, `worker` и `nginx`. Он никогда не выполняет
`prisma db push` и не создаёт PostgreSQL-контейнер.

Этот путь применяется для переносимой проверки и для серверов, специально согласованных под Compose.
На AMS Server выполнять нужно runbook `docs/AMS_SERVER_DEPLOY_RUNBOOK.md`.

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
