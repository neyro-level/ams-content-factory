# Deployment

## Граница ответственности

Пакет Wave 16 подготовлен для self-hosted production: PostgreSQL 16 с pgvector, Next.js web,
отдельный pg-boss worker и Nginx. Фактическое развёртывание запрещено до отдельного подтверждения
инфраструктуры владельцем.

## Подготовка сервера

1. Получить доступ к Linux-серверу с Docker Engine и Docker Compose v2.
2. Клонировать SourceCraft `main` в каталог, доступный только оператору.
3. Скопировать `.env.example` в `.env`, заменить все placeholder-значения и ограничить права на файл.
4. Указать в `APP_URL` финальный HTTPS origin. Для встроенной БД URL обязан ссылаться на сервис
   `postgres`; для внешней БД изменяется compose-конфигурация после документированного review.
5. Настроить TLS перед Nginx на уровне согласованного reverse proxy или добавить сертификат в
   отдельной инфраструктурной задаче. Пакет не выдаёт фиктивный TLS-сертификат.

## Повторяемый запуск

```sh
sh deploy/deploy.sh
```

Скрипт собирает контейнеры, применяет только Prisma migrations через `prisma migrate deploy`,
идемпотентно заполняет глобальные video recipes и evaluation suites, затем запускает `postgres`,
`web`, `worker` и `nginx`. Он никогда не выполняет `prisma db push`.

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
